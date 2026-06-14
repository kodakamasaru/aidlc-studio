// inbox-service — the Human Inbox half of the loop. listInbox/getQuestion read
// open questions; answerQuestion is the core flow: applyAnswer() yields
// {question, fact, command}; question + fact persist in ONE transaction, THEN
// the Unit-02 command is dispatched to the orchestrator/cycle (S7 D-04).
import type { Ports } from "../ports/composition";
import { fail, isServiceError, messageOf, type ServiceError } from "./errors";
import { compensateRun } from "./compensate";
import { locatePhaseOfRun } from "./cycle-helpers";
import { CycleService } from "./cycle-service";
import { applyHearingAnswerToContracts } from "./hearing-service";
import { parseAnswersBlock, validateReconstructionProposal } from "../../wire/aidlc-wire";
import type { StepDef, SkillRef } from "../../domain/project/project";
import {
  applyAnswer,
  type Question,
  type Answer,
  type AnswerContext,
  type Unit02Command,
  type QuestionError,
} from "../../domain/question/question";
import type { Fact } from "../../domain/facts/facts";
import { proposeTask, acceptProposal } from "../../domain/task/task";
import {
  backtrackTo,
  approvePhase,
  advanceRun,
  resumeRun,
  completeCycle,
  reconstructPipeline as domainReconstructPipeline,
} from "../../domain/cycle/cycle";
import type { Cycle } from "../../domain/cycle/cycle";
import { Step, type Verdict } from "../../domain/shared/vocab";
import type { Text } from "../../domain/shared/primitives";
import { ProjectId, QuestionId, CycleId } from "../../domain/shared/ids";
import type { RunId } from "../../domain/shared/ids";
import { isErr, isOk } from "../../domain/shared/result";

export interface AnswerInput {
  readonly verdict: Verdict;
  readonly body?: Text;
  readonly backtrackTo?: string;
  readonly reason?: Text;
}

export interface AnswerResult {
  readonly question: Question;
  readonly fact: Fact;
}

const questionErrorStatus = (error: QuestionError): ServiceError => {
  switch (error) {
    case "QuestionClosed":
      return fail(409, error);
    default:
      // InvalidVerdict / EmptyReason / MissingBacktrackTarget
      return fail(400, error);
  }
};

export class InboxService {
  constructor(private readonly ports: Ports) {}

  listInbox(projectIdRaw: string): readonly Question[] {
    return this.ports.repos.questions.listOpenByProject(ProjectId(projectIdRaw));
  }

  /**
   * Cycle-scoped open questions — lets SCR-02 tell whether (and why) the cycle is
   * waiting on the human (an open Question against the active run) without
   * widening to the whole project's inbox. Filters listByCycle to state "open".
   */
  listCycleOpenQuestions(cycleIdRaw: string): readonly Question[] {
    return this.ports.repos.questions
      .listByCycle(CycleId(cycleIdRaw))
      .filter((q) => q.state === "open");
  }

  getQuestion(questionIdRaw: string): Question {
    const question = this.ports.repos.questions.findById(
      QuestionId(questionIdRaw),
    );
    if (!question) throw fail(404, "QuestionNotFound");
    return question;
  }

  async answerQuestion(
    questionIdRaw: string,
    input: AnswerInput,
  ): Promise<AnswerResult> {
    const question = this.ports.repos.questions.findById(
      QuestionId(questionIdRaw),
    );
    if (!question) throw fail(404, "QuestionNotFound");

    // exactOptionalPropertyTypes: only include optional keys when provided.
    const answer: Answer = {
      verdict: input.verdict,
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.backtrackTo !== undefined
        ? { backtrackTo: Step(input.backtrackTo) }
        : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    };

    const ctx: AnswerContext = {
      factId: this.ports.ids.factId(),
      at: this.ports.clock.now(),
      by: "human",
    };

    const outcome = applyAnswer(question, answer, ctx);
    if (isErr(outcome)) throw questionErrorStatus(outcome.error);
    const command = outcome.value.command;

    // backtrack: rollback the cycle in the SAME transaction as question+fact so
    // the DB is never in a partial state (question answered but cycle not yet
    // rewound). The orchestrator auto-relaunch fires AFTER this commit (post-commit
    // side-effect), mirroring the startPhase/relaunchPhase pattern (S7 D-04).
    const backtrackedCycle =
      command.type === "backtrack"
        ? this.computeBacktrack(question, command.toStep, command.reason)
        : undefined;

    // Persist question + fact (+ backtracked cycle) in ONE transaction.
    this.ports.uow.run(() => {
      this.ports.repos.questions.save(outcome.value.question);
      this.ports.repos.facts.save(outcome.value.fact);
      if (backtrackedCycle) this.ports.repos.cycles.save(backtrackedCycle);
    });

    // BU-3: config-hearing write. When the question carries a target, apply the
    // answer deterministically to StepContracts (§C7.6). This is additive: normal
    // dispatch still runs so the hearing turn continues (or finalises) as usual.
    // Errors here are visible (ServiceError) — they do NOT silently drop (原則④).
    if (question.target !== undefined && question.kind === "question") {
      const cycle = this.ports.repos.cycles.findById(question.cycleId);
      const projectId = cycle?.projectId;
      if (projectId !== undefined) {
        const scope =
          question.target.scope ??
          `cycle:${question.cycleId}`;
        // Extract choiceId + note from the answer body. The body may be an
        // aidlc-answers fenced block (multi-question batch) or a plain string.
        const { choiceId, note } = this.extractHearingValues(question.id, input.body);
        applyHearingAnswerToContracts(
          {
            scope,
            projectId: String(projectId),
            target: { step: question.target.step, field: question.target.field },
            ...(choiceId !== undefined ? { choiceId } : {}),
            ...(note !== undefined ? { note } : {}),
          },
          this.ports,
        );
      }
    }

    // AFTER commit: dispatch orchestrator side-effects.
    // backtrack: the cycle rollback is now persisted — auto-relaunch the rewound
    // phase so the human never needs to press "relaunch" manually (US-13 UX).
    // If the orchestrator launch fails, compensate the new run to "stalled" (still
    // retriable via the manual relaunch button) and swallow the error — the
    // backtrack itself succeeded and returning 502 would be misleading.
    if (command.type === "backtrack") {
      await this.autoRelaunchAfterBacktrack(question.cycleId, command.toStep);
    } else {
      await this.dispatch(question, command);
    }

    return { question: outcome.value.question, fact: outcome.value.fact };
  }

  private async dispatch(
    question: Question,
    command: Exclude<Unit02Command, { type: "backtrack" }>,
  ): Promise<void> {
    // The question is already answered+persisted; a post-commit orchestrator
    // failure compensates the acted-on run to "stalled" (still retriable) and
    // surfaces a 502 — the loop stays recoverable.
    try {
      switch (command.type) {
        case "resumeRun": {
          // Batch hearing (S2/S6: N問→N答→1 resume). One live run may raise
          // several `question` cards at once; the human answers them as a batch.
          // Each answer is persisted individually (above), but the session must
          // be resumed ONCE with the full aidlc-answers body — NOT once per
          // answer, which would re-spawn `claude --resume` N times on the same
          // session. So defer the resume while sibling `question`s for this run
          // are still open; only the FINAL answer (no open question siblings
          // left — the just-answered one is already persisted as "answered")
          // triggers the single resume carrying the batched body. The batch
          // selection is an app-layer responsibility (S6 評価AI S-1), mirroring
          // resolveDescopedRun's "wait until no open siblings" gate below.
          if (command.body !== undefined) {
            const openSiblings = this.ports.repos.questions
              .listByRun(command.runId)
              .filter((q) => q.kind === "question" && q.state === "open");
            if (openSiblings.length > 0) return; // not the last answer → defer.
          }
          // Unit-04: when the human answered a `question` (body present), pass
          // the captured session_id so the live adapter can `claude --resume`.
          // Absent sessionId with body present → live adapter emits stalled
          // (session not yet captured / server restarted); the human retries.
          const sessionId =
            command.body !== undefined
              ? (this.ports.repos.sessions.find(command.runId) ?? undefined)
              : undefined;
          await this.ports.orchestrator.resume({
            runId: command.runId,
            ...(command.body !== undefined ? { body: command.body } : {}),
            ...(sessionId !== undefined ? { sessionId } : {}),
          });
          return;
        }
        case "approveTaskReview":
          // Post-review approval: advance the run to "done" (which moves the
          // phase to "review"), then approve the phase (review → done) so the
          // next phase can start. Uses domain functions directly instead of
          // orchestrator.resume() — the live adapter's in-memory context Map
          // is lost on server restart, making resume fragile. Domain functions
          // operate on the DB-backed cycle aggregate, which is always available.
          this.finalizeApprovedReview(question, command.runId);
          return;
        case "retryLaunch":
          await this.dispatchRetry(question, command.runId);
          return;
        case "cancelRun":
          await this.ports.orchestrator.cancel({ runId: command.runId });
          return;
        case "descopeToBacklog":
          // S6 descope-policy D-03 / S8 #5: 見送り承認→backlog 化。proposeTask で AI 申請を
          // 起こし、人間が下した descope/defer verdict を acceptProposal の判断ゲート(INV-5)
          // として通し、backlog Task を生成する。DB のみの同期書き込み(orchestrator 不要)。
          this.descopeToBacklog(question, command);
          return;
        // US-08 F-1: 再構成提案の承認 → applyCycleReconstruction を実行しカードはクローズ。
        // applyAnswer がカードを "answered" に更新済みなので DB 書き込みはここでは不要。
        // reject は no-op — カードは applyAnswer で "answered" になっているので自動クローズ済み。
        case "approveReconstruction":
          this.approveReconstructionCmd(command.cycleId);
          return;
        case "rejectReconstruction":
          // no-op: the card was already closed by applyAnswer above.
          return;
      }
    } catch (err) {
      // A ServiceError from a lookup (e.g. 404 ProjectNotFound in dispatchRetry)
      // is a real client/data error → propagate untouched. Anything else is the
      // orchestrator throwing → compensate to "stalled" and surface a 502.
      if (isServiceError(err)) throw err;
      // approveReconstruction / rejectReconstruction do not invoke the orchestrator,
      // so they never reach this catch — but if they do, fall back to question.runId.
      const failedRunId =
        "runId" in command ? command.runId : question.runId;
      compensateRun(
        this.ports,
        question.cycleId,
        failedRunId,
        "stalled",
        `AI への指示送信に失敗しました: ${messageOf(err)}`,
      );
      throw fail(502, "OrchestratorDispatchFailed");
    }
  }

  private async dispatchRetry(question: Question, runId: RunId): Promise<void> {
    // Unlike CycleService.retryRun, this does NOT advance the cycle here: the
    // upstream answer flow already persisted the stall_retry verdict as a Fact,
    // and the new attempt's run is materialized by the orchestrator's own retry
    // emission (RunStateChanged) flowing back through the EventApplier — so this
    // path only re-launches the agent and leaves run bookkeeping to the sink.
    const cycle = this.loadCycle(question);
    const phase = locatePhaseOfRun(cycle, runId);
    const project = this.ports.repos.projects.findById(cycle.projectId);
    if (!project) throw fail(404, "ProjectNotFound");
    await this.ports.orchestrator.retry({
      runId,
      newRunId: this.ports.ids.runId(),
      projectId: project.id,
      cycleId: cycle.id,
      phaseId: phase.id,
      step: phase.step,
      repoPath: project.repoPath,
    });
  }

  /**
   * descope/defer approval → backlog Task (S6 descope-policy D-03 / Unit-05).
   * The human already judged the AI's descope request by answering the Question,
   * so proposeTask (AI source) and acceptProposal (the INV-5 human gate, satisfied
   * by the verdict) happen together here. The requirement becomes a backlog Task;
   * `deferred` is carried in the Task kind (no new TaskState / S6 Q-02). Persisted
   * in ONE transaction. A domain error (e.g. empty requirement) surfaces as a
   * ServiceError so dispatch()'s catch re-throws it untouched (no run compensation).
   */
  private descopeToBacklog(
    question: Question,
    command: Extract<Unit02Command, { type: "descopeToBacklog" }>,
  ): void {
    const cycle = this.loadCycle(question);
    const projectId = cycle.projectId;
    // Append to the end of the project's backlog (priority = current count).
    const priority = this.ports.repos.tasks.listByProject(projectId).length;
    const kind = command.deferred ? "descoped-deferred" : "descoped";

    const proposal = proposeTask({
      id: this.ports.ids.proposalId(),
      source: "ai",
      title: command.requirement,
      body: command.deferred
        ? `後回し(defer): ${command.requirement}`
        : `見送り(descope): ${command.requirement}`,
      rationale: command.aiReason,
    });
    const accepted = acceptProposal(proposal, {
      taskId: this.ports.ids.taskId(),
      projectId,
      kind,
      priority,
      createdAt: this.ports.clock.now(),
    });
    if (isErr(accepted)) throw fail(500, `DescopeToBacklogFailed: ${accepted.error}`);

    this.ports.uow.run(() => {
      this.ports.repos.proposals.save(projectId, accepted.value.proposal);
      this.ports.repos.tasks.save(accepted.value.task);
    });

    // The gap is now an approved 見送り (backlogged). Per Unit-05's hard gate a
    // step is done-able once every gap is resolved OR approved-descoped — so once
    // this run has no MORE open descope Questions, unwedge the gen→gate→eval
    // evaluator run the EngineService stalled and let the phase complete.
    this.resolveDescopedRun(question, command.runId);
  }

  /**
   * US-08 F-1: 再構成提案を承認して cycle の pending 工程列を置換する。
   * reconstruction_proposals テーブルから提案を取得し、delete 以外のステップを
   * StepDef に変換して domainReconstructPipeline へ渡す。
   * 既に開始済み(non-pending)フェーズと重複するステップは除外する
   * (POST /api/cycles/:id/reconstruct と同じ除外ロジック / 後方互換)。
   * ServiceError をそのまま投げるので dispatch() の catch が 502 化を判別できる。
   */
  /**
   * US-08 F-1: 再構成提案を承認して cycle の pending 工程列を置換する。
   * reconstruction_proposals テーブルから提案を取得し、delete 以外のステップを
   * StepDef に変換して domainReconstructPipeline へ渡す。
   * 既に開始済み(non-pending)フェーズと重複するステップは除外する
   * (POST /api/cycles/:id/reconstruct の HTTP ルートと同一除外ロジック)。
   */
  private approveReconstructionCmd(cycleId: CycleId): void {
    const cycle = this.ports.repos.cycles.findById(cycleId);
    if (!cycle) throw fail(404, "CycleNotFound");

    const rawProposal = this.ports.repos.reconstructionProposals.find(cycleId);
    if (rawProposal === undefined) throw fail(404, "ProposalNotFound");

    const parsed = validateReconstructionProposal(rawProposal);
    if (!parsed.ok) {
      throw fail(400, `InvalidReconstruction: ${parsed.error.detail}`);
    }
    const proposal = parsed.value;

    // Exclude deleted steps and already-started steps (same filter as the HTTP route).
    const startedStepIds = new Set(
      cycle.phases
        .filter((p) => p.state !== "pending")
        .map((p) => String(p.step)),
    );
    const newSteps: readonly StepDef[] = proposal.steps
      .filter((s) => s.diff !== "delete" && !startedStepIds.has(s.id))
      .map((s) => ({
        id: Step(s.id),
        label: s.label as Text,
        order: s.order,
        skillRef: s.skillRef as SkillRef,
        ...(s.instruction.trim().length > 0
          ? { instruction: s.instruction as Text }
          : {}),
      }));

    if (newSteps.length === 0) {
      // All steps are deleted or already started — no pending effect; treat as no-op.
      return;
    }

    const result = domainReconstructPipeline(cycle, newSteps);
    if (isErr(result)) throw fail(400, `ReconstructFailed: ${result.error}`);

    // Assign real PhaseIds to new phases (mirrors CycleService.applyCycleReconstruction).
    const next: Cycle = {
      ...result.value,
      phases: result.value.phases.map((p) =>
        (p.id as string).startsWith("new-")
          ? { ...p, id: this.ports.ids.phaseId() }
          : p,
      ),
    };
    this.ports.uow.run(() => this.ports.repos.cycles.save(next));
  }

  /**
   * After a descope/defer approval, if the run has no remaining open descope
   * Questions, complete the gen→gate→eval step: the EngineService left the
   * evaluator run "stalled" awaiting this human decision, so resume it → done →
   * approve the phase (review → done) → complete the cycle if it was the last
   * phase. Mirrors finalizeApprovedReview but starts from a stalled run. A no-op
   * when the run is not a stalled evaluator (role-less / still-pending gaps).
   */
  private resolveDescopedRun(question: Question, runId: RunId): void {
    const cycle = this.ports.repos.cycles.findById(question.cycleId);
    if (!cycle) return;
    const phase = cycle.phases.find((p) => p.runs.some((r) => r.id === runId));
    const run = phase?.runs.find((r) => r.id === runId);
    if (!phase || !run || run.state !== "stalled") return; // nothing to unwedge.

    // More descope decisions still pending for this run → wait for them.
    const openDescopes = this.ports.repos.questions
      .listByRun(runId)
      .filter((q) => q.kind === "descope" && q.state === "open");
    if (openDescopes.length > 0) return;

    const resumed = resumeRun(cycle, runId);
    if (isErr(resumed)) return;
    const advanced = advanceRun(resumed.value, {
      runId,
      to: "done",
      at: this.ports.clock.now(),
    });
    if (isErr(advanced)) return;

    // No visual_review is raised on the descope path, so the run's reviews are all
    // closed → the phase may be approved.
    const openReviews = this.ports.repos.questions
      .listByRun(runId)
      .filter((q) => q.kind === "visual_review" && q.state === "open");
    const approved = approvePhase(advanced.value, {
      phaseId: phase.id,
      allTaskReviewsApproved: openReviews.length === 0,
    });
    const next = isOk(approved) ? approved.value : advanced.value;
    const completed = completeCycle(next);
    const finalCycle = isOk(completed) ? completed.value : next;
    this.ports.uow.run(() => this.ports.repos.cycles.save(finalCycle));
  }

  /**
   * After a visual_review is approved, advance the run to "done" (which moves
   * the phase to "review"), then approve the phase (review → done). Both steps
   * use domain functions directly — no orchestrator dependency, no lost-context
   * risk. Errors are thrown so the outer catch in dispatch() can surface them
   * as a 502 to the frontend (the user sees the error instead of silent failure).
   */
  private finalizeApprovedReview(question: Question, runId: RunId): void {
    const cycle = this.loadCycle(question);
    const phase = locatePhaseOfRun(cycle, runId);

    // Step 1: advance the run running → done (phase becomes "review").
    const advanced = advanceRun(cycle, {
      runId,
      to: "done",
      at: this.ports.clock.now(),
    });
    if (isErr(advanced)) {
      throw fail(500, `RunAdvanceFailed: ${advanced.error}`);
    }

    // Step 2: approve the phase review → done (only when all visual_reviews
    // for this run are closed — the current one was just answered).
    const openReviews = this.ports.repos.questions
      .listByRun(runId)
      .filter((q) => q.kind === "visual_review" && q.state === "open");
    const approved = approvePhase(advanced.value, {
      phaseId: phase.id,
      allTaskReviewsApproved: openReviews.length === 0,
    });
    if (isErr(approved)) {
      throw fail(500, `PhaseApproveFailed: ${approved.error}`);
    }

    // Step 3: if that was the LAST phase, complete the cycle (active → done).
    // completeCycle errs PhasesNotAllDone for any non-final approval — that's the
    // normal "more phases to go" case, so we keep the approved cycle as-is. Only a
    // success swaps in the done cycle, which stops the UI poll and shows "done".
    const completed = completeCycle(approved.value);
    const finalCycle = isOk(completed) ? completed.value : approved.value;

    this.ports.uow.run(() => this.ports.repos.cycles.save(finalCycle));
  }

  /** Pure: load the cycle and compute the backtracked state (saved by caller). */
  private computeBacktrack(
    question: Question,
    toStep: Extract<Unit02Command, { type: "backtrack" }>["toStep"],
    reason: Text,
  ): Cycle {
    const cycle = this.loadCycle(question);
    // Retire the reviewed run BEFORE rewinding. A run stays "running" through its
    // review (ResultEmitted does not advance it — only approve→finalize does), so
    // a reject/backtrack would otherwise leave it a phantom "running" run with no
    // live process behind it. When the backtrack target IS the reviewed phase, the
    // UI then sees phase=running + run=running (not a rewind) and spins "生成中"
    // forever. The run DID complete and emit output (the human rejected the
    // OUTPUT, not the run's execution), so advance it to "done"; backtrackTo then
    // sets the phase back to "running" and the phase reads as a rewind ("要再実行").
    // Skip when the run already left "running" (IllegalTransition) — keep as-is.
    const settled = advanceRun(cycle, {
      runId: question.runId,
      to: "done",
      at: this.ports.clock.now(),
    });
    const base = isOk(settled) ? settled.value : cycle;
    const result = backtrackTo(base, { step: toStep, reason });
    if (isErr(result)) throw fail(400, result.error);
    return result.value;
  }

  /**
   * Auto-relaunch the rewound phase after a backtrack commit (US-13 UX).
   *
   * Design decisions:
   * D-1 REUSE: delegates entirely to CycleService.relaunchPhase — no duplicate
   *     domainRelaunchPhase + persistThenLaunch logic here. CycleService already
   *     owns the "persist cycle then launch orchestrator" pattern (S7 D-04).
   * D-2 SOFT FAILURE: if the orchestrator launch throws, CycleService's internal
   *     compensateRun drives the new run to "failed" (same as startPhase behavior).
   *     We catch and swallow the error — do NOT propagate it. The backtrack is
   *     already committed and returning 502 would mislead the caller about what
   *     failed. The human uses /retry to create a new attempt or /relaunch to
   *     restart the rewound phase.
   * D-3 MANUAL RELAUNCH PRESERVED: the /relaunch HTTP endpoint is NOT removed.
   *     It is still needed for stall recovery (when auto-relaunch itself stalls).
   */
  private async autoRelaunchAfterBacktrack(
    cycleId: import("../../domain/shared/ids").CycleId,
    toStep: Extract<import("../../domain/question/question").Unit02Command, { type: "backtrack" }>["toStep"],
  ): Promise<void> {
    try {
      const cycleService = new CycleService(this.ports);
      await cycleService.relaunchPhase(cycleId as string, toStep as string);
    } catch (_err) {
      // CycleService.relaunchPhase already compensates the new run to "failed"
      // when the orchestrator launch throws (same as startPhase behavior). The
      // human can use /retry to create a new attempt, or the manual /relaunch
      // button to restart the whole rewound phase.
      // Any non-ServiceError (e.g. PhaseNotRewound) is also swallowed: it means
      // the cycle state didn't allow a relaunch at this moment — the backtrack
      // is already committed, so the human can use the /relaunch button.
      // Swallow — do not propagate. The backtrack is committed; auto-relaunch is
      // best-effort. Returning 502 would mislead the caller about what failed.
    }
  }

  private loadCycle(question: Question): Cycle {
    const cycle = this.ports.repos.cycles.findById(question.cycleId);
    if (!cycle) throw fail(404, "CycleNotFound");
    return cycle;
  }

  /**
   * BU-3: extract (choiceId, note) from an answer body for config-hearing.
   * If the body is an aidlc-answers fenced block, parse it and find the answer
   * matching the given questionId. Otherwise treat the plain body string as the
   * note value (simple direct answer for non-batch config questions).
   */
  private extractHearingValues(
    questionId: import("../../domain/shared/ids").QuestionId,
    body: Text | undefined,
  ): { choiceId?: string; note?: string } {
    if (body === undefined) return {};

    // Try parsing as aidlc-answers block first.
    const parsed = parseAnswersBlock(body);
    if (parsed.ok) {
      const match = parsed.value.find((a) => a.questionId === questionId);
      if (match) {
        return {
          ...(match.choiceIds.length > 0 ? { choiceId: match.choiceIds[0] } : {}),
          ...(match.note !== undefined ? { note: match.note } : {}),
        };
      }
    }

    // Fallback: treat the whole body string as a plain note value.
    const plain = (body as string).trim();
    return plain.length > 0 ? { note: plain } : {};
  }
}

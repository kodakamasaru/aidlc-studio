// inbox-service — the Human Inbox half of the loop. listInbox/getQuestion read
// open questions; answerQuestion is the core flow: applyAnswer() yields
// {question, fact, command}; question + fact persist in ONE transaction, THEN
// the Unit-02 command is dispatched to the orchestrator/cycle (S7 D-04).
import type { Ports } from "../ports/composition";
import { fail, isServiceError, type ServiceError } from "./errors";
import { compensateRun } from "./compensate";
import { locatePhaseOfRun } from "./cycle-helpers";
import {
  applyAnswer,
  type Question,
  type Answer,
  type AnswerContext,
  type Unit02Command,
  type QuestionError,
} from "../../domain/question/question";
import type { Fact } from "../../domain/facts/facts";
import { backtrackTo } from "../../domain/cycle/cycle";
import type { Cycle } from "../../domain/cycle/cycle";
import { Step, type Verdict } from "../../domain/shared/vocab";
import type { Text } from "../../domain/shared/primitives";
import { ProjectId, QuestionId, CycleId } from "../../domain/shared/ids";
import type { RunId } from "../../domain/shared/ids";
import { isErr } from "../../domain/shared/result";

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

    // backtrack is a pure cycle rollback (no orchestrator side-effect), so it
    // joins question+fact in the SAME transaction — never a partial commit where
    // the question is answered but the cycle is not yet rolled back.
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

    // AFTER commit: dispatch ONLY the orchestrator side-effects. backtrack is
    // fully persisted above and needs no post-commit call.
    if (command.type !== "backtrack") {
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
        case "resumeRun":
          await this.ports.orchestrator.resume({
            runId: command.runId,
            ...(command.body !== undefined ? { body: command.body } : {}),
          });
          return;
        case "approveTaskReview":
          // Approval recorded; continue the run after the human OK.
          await this.ports.orchestrator.resume({ runId: command.runId });
          return;
        case "retryLaunch":
          await this.dispatchRetry(question, command.runId);
          return;
        case "cancelRun":
          await this.ports.orchestrator.cancel({ runId: command.runId });
          return;
      }
    } catch (err) {
      // A ServiceError from a lookup (e.g. 404 ProjectNotFound in dispatchRetry)
      // is a real client/data error → propagate untouched. Anything else is the
      // orchestrator throwing → compensate to "stalled" and surface a 502.
      if (isServiceError(err)) throw err;
      compensateRun(this.ports, question.cycleId, command.runId, "stalled");
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

  /** Pure: load the cycle and compute the backtracked state (saved by caller). */
  private computeBacktrack(
    question: Question,
    toStep: Extract<Unit02Command, { type: "backtrack" }>["toStep"],
    reason: Text,
  ): Cycle {
    const cycle = this.loadCycle(question);
    const result = backtrackTo(cycle, { step: toStep, reason });
    if (isErr(result)) throw fail(400, result.error);
    return result.value;
  }

  private loadCycle(question: Question): Cycle {
    const cycle = this.ports.repos.cycles.findById(question.cycleId);
    if (!cycle) throw fail(404, "CycleNotFound");
    return cycle;
  }
}

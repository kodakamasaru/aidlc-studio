// engine-service — the app-layer gen→gate→eval driver (S5 Unit-03 / scope B-E).
// It wraps the EventApplier as the DomainEventSink: every emission is first
// persisted (applier.apply), then `react` advances the gen→gate→eval pipeline.
// The progression lives HERE (app layer), not in RunState or the domain (S6
// run-role D-02). Reactions are keyed on the EMITTING run's role:
//
//   generator ResultEmitted → runDeterministicGate (AI-independent):
//       ok   → advanceRun(done) + launchEval(domain) + orchestrator.launchEval
//       fail → advanceRun(stalled, reason)  [no evaluator]
//   evaluator ResultEmitted{completeness} → completeness gate:
//       allow-done    → raise visual_review (human approves the evaluator output)
//       await-descope → advanceRun(stalled, reason)  [descope Qs already in inbox]
//       auto-rework   → advanceRun(stalled, reason)  [Q-02: loud, not silent re-gen]
//   RunStateChanged → "done" for a role-less S1 run → S1 確定 → auto-launch ONE
//       reconstruction proposal run (US-08 AC-2). Fires on confirmation only, and
//       never from a reconstruction run itself (recursion guard) — the live loop fix.
//
// Role-less runs (v0.0.1 single-run flow) get NO ResultEmitted reaction — the
// applier's own visual_review path handles them unchanged (backward compatible).
import type { Ports } from "../ports/composition";
import type { RunEmission, RunContext } from "../ports/orchestrator";
import { EventApplier } from "./event-applier";
import { compensateRun } from "./compensate";
import { runDeterministicGate } from "./deterministic-gate";
import { launchReconstructionForS1 } from "./reconstruction-launch";
import {
  advanceRun,
  launchEval,
  type Cycle,
  type Run,
  type RunRole,
} from "../../domain/cycle/cycle";
import { sameStep, type Step } from "../../domain/shared/vocab";
import { resolveContracts, type StepContracts } from "../../domain/project/step-contracts";
import { resolveGatePaths } from "./context-resolver";
import { evidenceGateBlockReason } from "./evidence-gate-check";
import { readPipeline, type Project } from "../../domain/project/project";
import { lookupProfile, emptyProfile } from "../../domain/review/profile";
import { evaluateCompleteness, type Requirement } from "../../domain/review/brief";
import { decideDisposition, type DescopeRequest } from "../../domain/review/descope";
import { raiseQuestion, type Question } from "../../domain/question/question";
import type { ResultEmitted } from "../../domain/events/events";
import type { RunId } from "../../domain/shared/ids";
import { isErr } from "../../domain/shared/result";
import { logError } from "../../infra/log";

export class EngineService {
  private readonly applier: EventApplier;

  constructor(private readonly ports: Ports) {
    this.applier = new EventApplier(ports);
  }

  /** The DomainEventSink: persist the emission, then drive the pipeline. */
  readonly handle = async (emission: RunEmission): Promise<void> => {
    await this.applier.apply(emission);
    await this.react(emission);
  };

  // ── reactions ────────────────────────────────────────────────────
  private async react(emission: RunEmission): Promise<void> {
    const { ctx, event } = emission;
    const cycle = this.ports.repos.cycles.findById(ctx.cycleId);
    if (!cycle) return;

    if (event.type === "ResultEmitted") {
      const role = this.runRole(cycle, ctx.runId);
      if (role === "generator") await this.onGeneratorResult(cycle, ctx, event);
      else if (role === "evaluator") await this.onEvaluatorResult(cycle, ctx, event);
      // role-less ResultEmitted: the applier already raised the visual_review card.
      // Reconstruction is NOT triggered here anymore — it fires only on S1 確定
      // (RunStateChanged done) below, so it never runs during the pre-approval
      // review-waiting state, and a reconstruction run's own role-less ResultEmitted
      // can no longer re-trigger it (the live infinite-loop root cause).
      return;
    }

    // US-08 AC-2: S1 確定 = the run reached `done`. The AI-emits-status:"done" path
    // hits here; the human-approves-review path triggers the SAME shared launcher
    // from InboxService.finalizeApprovedReview. The launcher is idempotent (DB
    // proposal guard), so firing from both paths is safe and never self-recurses.
    if (event.type === "RunStateChanged" && event.to === "done") {
      // US-01: the applier may have REJECTED this done (evidence gate → stalled).
      // Only fire reconstruction when the run actually reached done in the
      // persisted cycle — never off a gate-stalled run.
      const run = this.locateRun(cycle, ctx.runId);
      if (run?.state !== "done") return;
      await launchReconstructionForS1(this.ports, cycle, ctx.step, ctx.phaseId);
    }
  }

  /**
   * Generator finished producing → run the deterministic gate. On pass, advance
   * the generator to done and (in one persisted step) append the evaluator run,
   * then launch it. On fail, stall the generator with the missing pieces as the
   * reason (loud + retriable) — the evaluator is NOT launched.
   */
  private async onGeneratorResult(
    cycle: Cycle,
    ctx: RunContext,
    event: ResultEmitted,
  ): Promise<void> {
    const project = this.ports.repos.projects.findById(cycle.projectId);
    const contracts = project ? this.stepContracts(project, ctx.step) : undefined;
    const profile = contracts?.output?.profileKind
      ? lookupProfile(contracts.output.profileKind)
      : emptyProfile("default");

    // 前段の存在ゲート: 各 done 前段ステップの index.md が存在することだけを要求する
    // (project-AGNOSTIC)。以前は resolveContextPaths の「詳細成果物パス(studio 固有の
    // 画面/Unit/集約ファイル名)」まで HARD 要求していたため、別プロジェクト(例: chat)の
    // S9 live run が `s3/scr-01-inbox.md` 不在で stall した。詳細ファイルは prompt 文脈
    // (soft / 欠落マーカー)であってゲートの硬要件ではない(precision-first: 存在=ゲート、
    // 中身の質=evaluator)。resolveGatePaths は index.md のみを返す。
    const artifactPaths = project
      ? resolveGatePaths({
          cycle,
          step: ctx.step,
          repoPath: project.repoPath,
        })
      : this.artifactPaths();

    const gate = runDeterministicGate(
      profile,
      { artifacts: artifactPaths, blocks: event.blocks },
      this.ports.fs,
    );
    if (!gate.ok) {
      this.advanceAndSave(
        cycle,
        ctx.runId,
        "stalled",
        `deterministic gate 不合格: 不足block=[${gate.missingBlocks.join(",")}] 不足path=[${gate.missingPaths.join(",")}]`,
      );
      return;
    }

    const at = this.ports.clock.now();
    const advanced = advanceRun(cycle, { runId: ctx.runId, to: "done", at });
    if (isErr(advanced)) {
      logError("EngineService.onGeneratorResult: advanceRun(done) failed", advanced.error);
      return;
    }
    const evalRunId = this.ports.ids.runId();
    const launched = launchEval(advanced.value, {
      step: ctx.step,
      runId: evalRunId,
      startedAt: at,
    });
    if (isErr(launched)) {
      // Persist the generator's done state even if eval can't launch (visible).
      logError("EngineService.onGeneratorResult: launchEval failed", launched.error);
      this.ports.uow.run(() => this.ports.repos.cycles.save(advanced.value));
      return;
    }
    this.ports.uow.run(() => this.ports.repos.cycles.save(launched.value));

    const phase = launched.value.phases.find((p) => sameStep(p.step, ctx.step));
    if (!phase) return;
    try {
      await this.ports.orchestrator.launchEval({
        runId: evalRunId,
        projectId: cycle.projectId,
        cycleId: cycle.id,
        phaseId: phase.id,
        step: ctx.step,
        repoPath: project?.repoPath ?? "",
        // US-04: thread the cycle version for the live adapter's auto evidence manifest.
        version: cycle.version,
        generatorRunId: ctx.runId,
        ...(contracts?.verification
          ? { verification: contracts.verification.observations }
          : {}),
      });
    } catch (err) {
      // Post-commit launch failure: the eval run is persisted "running" with no
      // live process → compensate to stalled (retriable) instead of stuck.
      compensateRun(
        this.ports,
        cycle.id,
        evalRunId,
        "stalled",
        `evaluator の起動に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Evaluator finished → completeness gate. allow-done raises a visual_review of
   * the evaluator output (the run stays running; approve finalizes it). Any gap
   * stalls the run with a reason; descope requests the evaluator already raised
   * sit in the inbox for the human (await-descope) — auto-rework (no request) is
   * surfaced loud too (Q-02). No completeness (live MVP) → visual_review fallback.
   */
  private async onEvaluatorResult(
    cycle: Cycle,
    ctx: RunContext,
    event: ResultEmitted,
  ): Promise<void> {
    if (!event.completeness) {
      await this.allowDone(cycle, ctx, event);
      return;
    }
    const report = evaluateCompleteness(event.completeness);
    if (report.isComplete) {
      await this.allowDone(cycle, ctx, event);
      return;
    }
    const requests = this.descopeRequestsFor(ctx.runId, report.gaps);
    const disp = decideDisposition(report.gaps, requests);
    const reason =
      disp.kind === "await-descope"
        ? `未対応要件 ${report.gaps.length} 件: 見送り(descope)判断待ち — Inbox の見送り申請を確認してください`
        : `未対応要件 ${report.gaps.length} 件(見送り申請なし): generator の再生成が必要です`;
    this.advanceAndSave(cycle, ctx.runId, "stalled", reason);
  }

  // ── helpers ──────────────────────────────────────────────────────
  private runRole(cycle: Cycle, runId: RunId): RunRole | undefined {
    return this.locateRun(cycle, runId)?.role;
  }

  private locateRun(cycle: Cycle, runId: RunId): Run | undefined {
    for (const phase of cycle.phases) {
      const run = phase.runs.find((r) => r.id === runId);
      if (run) return run;
    }
    return undefined;
  }

  private stepContracts(project: Project, step: Step): StepContracts | undefined {
    const stepDef = readPipeline(project).find((sd) => sameStep(sd.id, step));
    return stepDef ? resolveContracts(stepDef) : undefined;
  }

  /** Artifact paths to existence-check. v0.0.2: none threaded yet (block check only). */
  private artifactPaths(): readonly string[] {
    return [];
  }

  private advanceAndSave(
    cycle: Cycle,
    runId: RunId,
    to: "stalled" | "done" | "failed",
    reason?: string,
  ): void {
    const r = advanceRun(cycle, {
      runId,
      to,
      at: this.ports.clock.now(),
      ...(reason !== undefined ? { reason } : {}),
    });
    if (isErr(r)) {
      logError("EngineService.advanceAndSave failed", { runId, to, error: r.error });
      return;
    }
    this.ports.uow.run(() => this.ports.repos.cycles.save(r.value));
  }

  /**
   * US-01 live-evidence hard gate. The evaluator's allow-done is the technical
   * step's self-reported completion; before presenting it to the human as a
   * visual_review we machine-verify that the step's live evidence exists
   * (縦経路ログ + 視覚/動作証拠). Missing evidence → STALL with a loud reason
   * (retriable) instead of raising the review — so the human never reviews a step
   * whose live evidence isn't already on disk. No gate installed (deterministic
   * tests) → the review is raised unchanged.
   */
  private async allowDone(
    cycle: Cycle,
    ctx: RunContext,
    event: ResultEmitted,
  ): Promise<void> {
    // US-01 live-evidence gate (gen→eval path): a technical step's evaluator
    // allow-done is gated on live evidence (shared check, scoped by
    // contracts.requiresLiveEvidence). Blocked → stall instead of raising review.
    const blockReason = evidenceGateBlockReason(this.ports, cycle, ctx);
    if (blockReason !== undefined) {
      this.advanceAndSave(cycle, ctx.runId, "stalled", blockReason);
      return;
    }
    await this.raiseVisualReview(ctx, event);
  }

  private async raiseVisualReview(ctx: RunContext, event: ResultEmitted): Promise<void> {
    const review = this.ports.repos.reviews.findByRunTask(
      ctx.runId,
      event.taskId ?? null,
    );
    if (!review) {
      logError("EngineService.raiseVisualReview: review missing", { runId: ctx.runId });
      return;
    }
    const q: Question = raiseQuestion({
      id: this.ports.ids.questionId(),
      runId: ctx.runId,
      cycleId: ctx.cycleId,
      ...(event.taskId !== undefined ? { taskId: event.taskId } : {}),
      payload: { kind: "visual_review", review },
      createdAt: this.ports.clock.now(),
    });
    this.ports.uow.run(() => this.ports.repos.questions.save(q));
    try {
      await this.ports.notify.questionRaised(q);
    } catch {
      // notification is best-effort (v0.0.x) — never break the run.
    }
  }

  /**
   * Map the run's OPEN descope Questions (the evaluator's reasoned descope
   * requests) to DescopeRequests keyed against the actual gaps. The descope
   * Question payload carries only the requirement TEXT, so match it to the gap
   * whose text equals it — that supplies the stable key decideDisposition needs.
   */
  private descopeRequestsFor(
    runId: RunId,
    gaps: readonly Requirement[],
  ): readonly DescopeRequest[] {
    const byKey = new Map(gaps.map((g) => [g.key, g]));
    const byText = new Map(gaps.map((g) => [g.text as string, g]));
    const out: DescopeRequest[] = [];
    for (const q of this.ports.repos.questions.listByRun(runId)) {
      if (q.state !== "open" || q.payload.kind !== "descope") continue;
      // Prefer the stable key (deterministic); fall back to text only when the
      // evaluator omitted the key (older emissions / backward compat).
      const gap =
        (q.payload.requirementKey !== undefined
          ? byKey.get(q.payload.requirementKey)
          : undefined) ?? byText.get(q.payload.requirement as string);
      if (gap) out.push({ requirement: gap, aiReason: q.payload.aiReason });
    }
    return out;
  }
}

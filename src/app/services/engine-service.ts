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
import {
  advanceRun,
  launchEval,
  type Cycle,
  type Run,
  type RunRole,
} from "../../domain/cycle/cycle";
import { sameStep, type Step } from "../../domain/shared/vocab";
import { resolveContracts, type StepContracts } from "../../domain/project/step-contracts";
import { resolveContextPaths } from "./context-resolver";
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
  /**
   * US-08 AC-2 recursion guard: runIds we launched as reconstruction proposal runs.
   * A reconstruction run is itself a role-less S1 run, so when the human approves it
   * and it reaches `done`, onS1Confirmed would re-launch reconstruction → the
   * infinite live loop (scripted side-stepped it by emitting RunStateChanged(done)
   * from a single-shot scenario; live emits a plain ResultEmitted that recursed).
   * Skipping these runIds makes reconstruction single-shot in BOTH adapters.
   * In-memory, never evicted (one entry per S1 確定 / bounded by process lifetime).
   */
  private readonly reconstructionRuns = new Set<string>();

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

    // US-08 AC-2: S1 確定 = the run reached `done` (human approved its review).
    // Only then auto-launch the reconstruction proposal run.
    if (event.type === "RunStateChanged" && event.to === "done") {
      await this.onS1Confirmed(cycle, ctx);
    }
  }

  /**
   * US-08 AC-2: S1 確定(role-less S1 run reaching `done` = 人間がレビュー承認)を
   * 検知して再構成提案ランを 1 回だけ自動起動する。ベストエフォート(失敗しても
   * S1 完了に影響しない)。
   *
   * 再帰ガード: 自分が起動した reconstruction run(role-less S1)が承認されて done に
   * なっても再起動しない(reconstructionRuns で除外)。これが live 無限ループの根治。
   *
   * hearingScope="reconstruction" を RunLaunch に乗せることで scripted adapter が
   * 単発の reconstruction シナリオを選択できる。live adapter は同フィールドを読んで
   * aidlc-reconstruction ブロックを求めるプロンプトを生成する(live は additive / §4)。
   *
   * 新フェーズは作成しない — S1 の phase/step 文脈でそのまま起動する。
   * run の DB 永続化はここでは行わない(scripted は状態機械内部に保持 / live は launch
   * 後に DB を書かないアーキテクチャが存在する場合の互換性確保のため)。
   */
  private async onS1Confirmed(cycle: Cycle, ctx: RunContext): Promise<void> {
    if (!sameStep(ctx.step, "S1" as Step)) return;
    // Recursion guard: never spawn reconstruction-of-reconstruction (the live loop).
    if (this.reconstructionRuns.has(ctx.runId as string)) return;

    const project = this.ports.repos.projects.findById(cycle.projectId);
    if (!project) return;

    const runId = this.ports.ids.runId();
    // Mark BEFORE launching so the new run's own terminal `done` is recognized and
    // skipped — even if its events arrive before this method returns.
    this.reconstructionRuns.add(runId as string);
    const phaseId =
      cycle.phases.find((p) => sameStep(p.step, ctx.step))?.id ?? ctx.phaseId;

    try {
      await this.ports.orchestrator.launch({
        runId,
        projectId: cycle.projectId,
        cycleId: cycle.id,
        phaseId,
        step: ctx.step,
        repoPath: project.repoPath,
        hearingScope: "reconstruction",
      });
    } catch (err) {
      logError("EngineService.onS1Confirmed: reconstruction launch failed", {
        cycleId: ctx.cycleId as string,
        step: ctx.step as string,
        error: err instanceof Error ? err.message : String(err),
      });
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

    // Unit-02 前段文脈注入: resolve prior-step artifact paths for the deterministic gate.
    // These are the same paths that were passed as contextPaths at launch; the gate
    // checks that the prior-step artifacts actually exist on disk before advancing.
    const artifactPaths = project
      ? resolveContextPaths({
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
      await this.raiseVisualReview(ctx, event);
      return;
    }
    const report = evaluateCompleteness(event.completeness);
    if (report.isComplete) {
      await this.raiseVisualReview(ctx, event);
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
    for (const phase of cycle.phases) {
      const run: Run | undefined = phase.runs.find((r) => r.id === runId);
      if (run) return run.role;
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

// ScriptedOrchestrator — a deterministic OrchestratorPort for tests and the v0
// composition root (S7 D-01/D-06). It models the human-in-the-loop run as a
// per-run state machine; every step emits context-tagged DomainEvents to the
// injected DomainEventSink (it never writes the DB itself). All sink calls are
// awaited so emission ordering is fully deterministic. The live Claude-CLI
// adapter (Phase 5b) implements the same port with the same emission shape.
//
// v0.0.2: when a launch carries role="generator", the run is the gen half of a
// gen→gate→eval step — it emits a typed BriefOut (ResultEmitted + completeness)
// and leaves the gate + evaluator launch to the app EngineService. launchEval
// then emits the evaluator's verdict (addressed) and, per scenario, a descope
// QuestionRaised for a gap. Role-less launches keep the v0.0.1 ask→result flow.
import type {
  OrchestratorPort,
  RunLaunch,
  EvalLaunch,
  ResumeRun,
  RetryLaunch,
  DomainEventSink,
  RunContext,
} from "../../app/ports/orchestrator";
import type { DomainEvent } from "../../domain/events/events";
import type { RunId } from "../../domain/shared/ids";
import type { Requirement } from "../../domain/review/brief";
import { buildRunContext, type LaunchLike } from "./shared";

export type ScriptedScenario =
  | "happy"
  | "stall-first"
  // gen→gate→eval scenarios (v0.0.2): the generator emits a BriefOut; launchEval
  // emits the evaluator verdict. "complete" addresses every requirement (→ allow
  // done); "descope" leaves one gap WITH a reasoned descope request (→ await-
  // descope); "gap" leaves the SAME gap with NO request (→ auto-rework: the run
  // stalls loud, no human card — Q-02 / 原則#6「理由のない見送りは発生しない」).
  | "gen-eval-complete"
  | "gen-eval-descope"
  | "gen-eval-gap";

type RunPhase = "asked" | "reviewed" | "stalled" | "done";

export interface ScriptedOptions {
  readonly sink: DomainEventSink;
  readonly scenario?: ScriptedScenario;
}

// Fixed requirement set the scripted gen→gate→eval scenarios reason over.
const SCRIPTED_REQUIREMENTS: readonly Requirement[] = [
  { key: "r1", text: "要件1: 一覧が表示される" },
  { key: "r2", text: "要件2: 空状態が表示される" },
];

const SCRIPTED_BLOCKS = [
  {
    type: "summary" as const,
    title: "直したこと",
    body: "一覧と空状態の両方を表示するようにした。要件の取りこぼしはない。",
  },
  { type: "screenshot" as const, src: "screenshots/x.png", caption: "実際に動いた画面" },
  {
    type: "risk" as const,
    level: "med" as const,
    note: "変わったところ: 一覧の表示処理(空のときの分岐を追加)",
  },
  { type: "video" as const, src: "videos/x.mp4", poster: "screenshots/x.png" },
];

export class ScriptedOrchestrator implements OrchestratorPort {
  private readonly sink: DomainEventSink;
  private readonly scenario: ScriptedScenario;
  private readonly states = new Map<string, RunPhase>();
  // Remember each run's context so resume/cancel can rebuild emissions.
  private readonly runs = new Map<string, RunContext>();

  constructor(opts: ScriptedOptions) {
    this.sink = opts.sink;
    this.scenario = opts.scenario ?? "happy";
  }

  async launch(cmd: RunLaunch): Promise<void> {
    const ctx = this.ctxFor(cmd, cmd.runId);
    if (this.scenario === "stall-first") {
      await this.emit(ctx, {
        type: "RunStateChanged",
        runId: cmd.runId,
        to: "stalled",
      });
      this.states.set(cmd.runId, "stalled");
      return;
    }
    // gen→gate→eval: a generator run emits its BriefOut (blocks + completeness with
    // an empty `addressed` — the evaluator fills that). It does NOT advance itself
    // to done; the EngineService runs the deterministic gate, then advances the
    // generator and launches the evaluator.
    if (cmd.role === "generator") {
      await this.emit(ctx, {
        type: "ResultEmitted",
        runId: cmd.runId,
        blocks: SCRIPTED_BLOCKS,
        completeness: { requirements: SCRIPTED_REQUIREMENTS, addressed: [] },
      });
      this.states.set(cmd.runId, "reviewed");
      return;
    }
    await this.emit(ctx, this.askEvent(cmd.runId));
    this.states.set(cmd.runId, "asked");
  }

  async launchEval(cmd: EvalLaunch): Promise<void> {
    const ctx = this.ctxFor(cmd, cmd.runId);
    // "descope"/"gap" both leave r2 unaddressed; "descope" additionally raises a
    // reasoned descope request for r2 (→ app await-descope), while "gap" raises
    // NONE (→ app auto-rework: stall loud, no human card). "complete" (and any
    // other scenario) addresses every requirement → app allow-done.
    const isDescope = this.scenario === "gen-eval-descope";
    const hasGap = isDescope || this.scenario === "gen-eval-gap";
    if (isDescope) {
      await this.emit(ctx, {
        type: "QuestionRaised",
        runId: cmd.runId,
        kind: "descope",
        payload: {
          kind: "descope",
          requirement: "要件2: 空状態が表示される",
          requirementKey: "r2",
          aiReason: "今サイクルでは一覧表示を優先。空状態は次サイクルで対応推奨。",
        },
      });
    }
    await this.emit(ctx, {
      type: "ResultEmitted",
      runId: cmd.runId,
      blocks: SCRIPTED_BLOCKS,
      completeness: {
        requirements: SCRIPTED_REQUIREMENTS,
        addressed: hasGap ? ["r1"] : ["r1", "r2"],
      },
    });
    this.states.set(cmd.runId, "reviewed");
  }

  async resume(cmd: ResumeRun): Promise<void> {
    const entry = this.runs.get(cmd.runId);
    const phase = this.states.get(cmd.runId);
    if (!entry || phase === undefined) return; // unknown run → idempotent no-op.

    if (phase === "asked") {
      await this.emit(entry, {
        type: "ResultEmitted",
        runId: cmd.runId,
        blocks: [
          {
            type: "summary",
            title: "Step output",
            body: "Deterministic scripted result.",
          },
          { type: "ac-map", items: [{ ac: "AC-1", status: "done" }] },
          { type: "mermaid", src: "graph TD; A-->B" },
          {
            type: "screenshot",
            src: "screenshots/x.png",
            caption: "verify-ui screenshot",
          },
        ],
      });
      this.states.set(cmd.runId, "reviewed");
      return;
    }
    if (phase === "reviewed") {
      await this.emit(entry, {
        type: "RunStateChanged",
        runId: cmd.runId,
        to: "done",
      });
      this.states.set(cmd.runId, "done");
      return;
    }
    // "stalled" | "done" → no-op.
  }

  async retry(cmd: RetryLaunch): Promise<void> {
    // A retry is a fresh attempt carried by newRunId.
    const ctx = this.ctxFor(cmd, cmd.newRunId);
    await this.emit(ctx, this.askEvent(cmd.newRunId));
    this.states.set(cmd.newRunId, "asked");
  }

  async cancel(cmd: { readonly runId: RunId }): Promise<void> {
    const entry = this.runs.get(cmd.runId);
    if (!entry) return;
    await this.emit(entry, {
      type: "RunStateChanged",
      runId: cmd.runId,
      to: "failed",
    });
    // Internal "done" bucket is the terminal marker: it holds BOTH failed and
    // done runs (no further emissions), so a cancelled run parks here too.
    this.states.set(cmd.runId, "done");
  }

  // ── internals ──────────────────────────────────────────────────
  private ctxFor(cmd: LaunchLike, runId: RunId): RunContext {
    const ctx = buildRunContext(cmd, runId);
    this.runs.set(runId, ctx);
    return ctx;
  }

  private askEvent(runId: RunId): DomainEvent {
    return {
      type: "QuestionRaised",
      runId,
      kind: "question",
      payload: {
        kind: "question",
        prompt: "進め方を選んでください。扱うデータのまとめ方はどちらにしますか?",
        options: [
          {
            id: "by-entity",
            label: "「もの」ごとにまとめる",
            hint: "扱う対象(データ)ごとに整理します",
            recommended: true,
          },
          {
            id: "by-task",
            label: "「やること」ごとにまとめる",
            hint: "機能(操作)ごとに整理します",
          },
        ],
      },
    };
  }

  private async emit(ctx: RunContext, event: DomainEvent): Promise<void> {
    await this.sink({ ctx, event });
  }
}

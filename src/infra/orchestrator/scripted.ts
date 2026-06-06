// ScriptedOrchestrator — a deterministic OrchestratorPort for tests and the v0
// composition root (S7 D-01/D-06). It models the human-in-the-loop run as a
// per-run state machine; every step emits context-tagged DomainEvents to the
// injected DomainEventSink (it never writes the DB itself). All sink calls are
// awaited so emission ordering is fully deterministic. The live Claude-CLI
// adapter (Phase 5b) implements the same port with the same emission shape.
import type {
  OrchestratorPort,
  RunLaunch,
  ResumeRun,
  RetryLaunch,
  DomainEventSink,
  RunContext,
} from "../../app/ports/orchestrator";
import type { DomainEvent } from "../../domain/events/events";
import type { RunId } from "../../domain/shared/ids";
import { buildRunContext, type LaunchLike } from "./shared";

export type ScriptedScenario = "happy" | "stall-first";

type RunPhase = "asked" | "reviewed" | "stalled" | "done";

export interface ScriptedOptions {
  readonly sink: DomainEventSink;
  readonly scenario?: ScriptedScenario;
}

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
    await this.emit(ctx, this.askEvent(cmd.runId));
    this.states.set(cmd.runId, "asked");
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
        prompt: "Confirm the scope before I proceed?",
      },
    };
  }

  private async emit(ctx: RunContext, event: DomainEvent): Promise<void> {
    await this.sink({ ctx, event });
  }
}

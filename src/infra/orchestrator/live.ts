// LiveClaudeOrchestrator — an OrchestratorPort that drives the LOCALLY-INSTALLED
// Claude Code CLI (`claude -p`, subscription-authed) headless, NOT the Anthropic
// API (S7 Phase 5b). It implements the same port + emission shape as the
// ScriptedOrchestrator: it never writes the DB; it spawns the local agent, parses
// its stream-json stdout, and pushes context-tagged DomainEvents to the injected
// DomainEventSink, which normalizes + persists them (S7 D-04).
//
// v0 scope: this proves the REAL-AI run→emit→persist loop. Headless `claude -p`
// runs to completion — it does NOT pause for human input mid-run — so the
// interactive Q→answer→resume loop against the real model (via --resume /
// session injection) is a deliberate v0.0.x enhancement (see `resume` below).
// For v0 the live adapter proves: spawn local Claude → produce output → normalize
// through the sink → persist → surface as a reviewable card.
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
import type { Step } from "../../domain/shared/vocab";
import { buildRunContext } from "./shared";
import { logError } from "../log";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";

/** Default bounded prompt: one sentence, no tools needed, fully deterministic shape. */
const defaultBuildPrompt = (cmd: { readonly step: Step }): string =>
  `You are running AI-DLC step ${cmd.step as string}. In ONE sentence, state ` +
  `what this step produces. Reply with only that sentence.`;

const DEFAULT_CLAUDE_BIN = "claude";
const DEFAULT_TIMEOUT_MS = 120_000;
/** Grace period after SIGTERM before SIGKILL, so a process ignoring TERM still dies. */
const HARD_KILL_GRACE_MS = 2_000;
/** Sentinel thrown when extractResultText sees an `is_error:true` result event. */
const RESULT_IS_ERROR = "claude reported is_error:true in its result event";

export interface LiveClaudeOptions {
  readonly sink: DomainEventSink;
  readonly claudeBin?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  /**
   * Cap on claude agentic turns (`--max-turns`). Omitted by default = NO cap, so
   * the agent can actually complete a phase (a low cap aborts the moment it tries
   * a tool → `error_max_turns`). The wall-clock `timeoutMs` is the real backstop.
   */
  readonly maxTurns?: number;
  readonly buildPrompt?: (cmd: RunLaunch) => string;
}

type SpawnedChild = ReturnType<typeof Bun.spawn>;

export class LiveClaudeOrchestrator implements OrchestratorPort {
  private readonly sink: DomainEventSink;
  private readonly claudeBin: string;
  private readonly model: string | undefined;
  private readonly timeoutMs: number;
  private readonly maxTurns: number | undefined;
  private readonly buildPrompt: (cmd: RunLaunch) => string;
  // Live child processes keyed by runId, so cancel() can kill an in-flight run.
  private readonly children = new Map<string, SpawnedChild>();
  // Each run's full context, kept so the post-review approval finalize (resume)
  // can emit a context-tagged `RunStateChanged done` — the sink needs cycleId to
  // locate + advance the Cycle. Populated at startAttempt; never evicted in v0
  // (one run per launch; bounded by process lifetime).
  private readonly contexts = new Map<string, RunContext>();

  constructor(opts: LiveClaudeOptions) {
    this.sink = opts.sink;
    this.claudeBin = opts.claudeBin ?? DEFAULT_CLAUDE_BIN;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTurns = opts.maxTurns;
    this.buildPrompt = opts.buildPrompt ?? defaultBuildPrompt;
  }

  // The OrchestratorPort contract says launch "Resolves once the run is started"
  // — NOT once it finishes. Headless `claude -p` can run for minutes, so awaiting
  // its completion here would block POST /phases/:step/start for the whole run and
  // freeze the web Start button. So launch SPAWNS the child (tracking it in the
  // map) and returns immediately; the rest — await exit, drain, parse, emit — runs
  // detached in awaitAndEmit(). spawn() throws synchronously only if the spawn
  // itself is impossible (bad cwd / missing bin); that propagates out of launch so
  // the caller's compensation can react. Once the child is spawned, every later
  // failure becomes a terminal `RunStateChanged failed` emission inside the
  // detached task — never an unhandled rejection out of launch.
  async launch(cmd: RunLaunch): Promise<void> {
    this.startAttempt(
      buildRunContext(cmd, cmd.runId),
      this.buildPrompt(cmd),
      cmd.repoPath,
    );
  }

  /**
   * Launch the evaluator half of a gen→gate→eval step (S5 Unit-03 §3). v0.0.2
   * scope: spawn a bounded `claude -p` that verifies the step against its
   * observations and emits a single ResultEmitted summary — same non-blocking
   * spawn+detach model as launch(). The live evaluator does NOT yet emit a typed
   * completeness verdict (real-AI `addressed` parsing is a v0.0.x enhancement); the
   * deterministic completeness loop is proven by the ScriptedOrchestrator. The app
   * EngineService falls back to a visual_review when an evaluator emits no
   * completeness, so the live path still surfaces a reviewable card.
   */
  async launchEval(cmd: EvalLaunch): Promise<void> {
    const obs = (cmd.verification ?? []).map((o) => `- ${o as string}`).join("\n");
    const prompt =
      `You are the EVALUATOR for AI-DLC step ${cmd.step as string}. Verify the ` +
      `generator's output${obs.length > 0 ? ` against:\n${obs}` : ""}\nIn ONE ` +
      `sentence, state whether the step's requirements are met. Reply with only that sentence.`;
    this.startAttempt(buildRunContext(cmd, cmd.runId), prompt, cmd.repoPath);
  }

  async retry(cmd: RetryLaunch): Promise<void> {
    // A retry is a fresh attempt carried by newRunId (same bounded prompt).
    const launchLike: RunLaunch = {
      runId: cmd.newRunId,
      projectId: cmd.projectId,
      cycleId: cmd.cycleId,
      phaseId: cmd.phaseId,
      step: cmd.step,
      repoPath: cmd.repoPath,
      ...(cmd.worktreeRef !== undefined ? { worktreeRef: cmd.worktreeRef } : {}),
    };
    this.startAttempt(
      buildRunContext(cmd, cmd.newRunId),
      this.buildPrompt(launchLike),
      cmd.repoPath,
    );
  }

  /**
   * In live v0 the ONLY resume is the post-review approval finalize. A live run
   * does NOT emit `done` on completion — it emits only `ResultEmitted`, so the
   * run stays `running` and surfaces as a `visual_review` card ("レビュー待ち").
   * When the human approves that review, the inbox service dispatches resume —
   * which here simply emits the terminal `RunStateChanged done`. No `claude`
   * re-spawn is needed: headless `claude -p` already ran to completion at launch.
   *
   * RunStateChanged carries only a runId, so resume can emit `done` without the
   * cycle/phase/step context a Question/Review needs. If the run already failed,
   * advanceRun(done) is an illegal transition — that's fine; the sink logs it and
   * the run stays terminal-failed.
   *
   * Mid-run interactive Q→answer→resume against the real model is still a v0.0.x
   * enhancement (S7-C1): headless `claude -p` has no mid-run pause, so there is no
   * live session to inject an answer into. The v0 review-approval finalize below
   * is the only resume the live adapter supports.
   */
  async resume(cmd: ResumeRun): Promise<void> {
    const ctx = this.contexts.get(cmd.runId);
    if (!ctx) {
      // Context lost (server restart / not launched by this instance).
      // Throw so the caller's compensation can surface the error to the user
      // instead of silently failing and leaving the run stuck in "running".
      throw new Error(
        `LiveClaudeOrchestrator.resume: context not found for run ${cmd.runId}`,
      );
    }
    await this.emit(ctx, {
      type: "RunStateChanged",
      runId: cmd.runId,
      to: "done",
    });
  }

  async cancel(cmd: { readonly runId: RunId }): Promise<void> {
    const child = this.children.get(cmd.runId);
    if (!child) return; // not running (or already terminal) → idempotent no-op.
    // Kill the in-flight process. The runAttempt awaiting it observes a non-zero
    // exit and emits `failed`, so cancel itself emits nothing (single source of
    // run-state truth: the attempt loop).
    try {
      child.kill();
    } catch (err) {
      logError("LiveClaudeOrchestrator.cancel: kill failed", err);
    } finally {
      // Unconditional cleanup: drop the handle even if kill threw, so the map
      // never leaks a dead child (runAttempt's finally also deletes on its path).
      this.children.delete(cmd.runId);
    }
  }

  // ── internals ──────────────────────────────────────────────────
  /**
   * Spawn the local claude headless for one attempt and return IMMEDIATELY,
   * leaving the await/parse/emit to a detached background task (awaitAndEmit).
   * This is what makes launch/retry non-blocking: the HTTP start request resolves
   * as soon as the child is spawned + tracked, not when claude finishes.
   *
   * THROWS only if the spawn itself is impossible (bad cwd / missing bin) — that
   * propagates out of launch/retry so the caller's compensation can react. Once
   * the child is spawned + tracked, this returns void and every later failure is
   * converted to a terminal `failed` emission inside awaitAndEmit.
   */
  private startAttempt(
    ctx: RunContext,
    prompt: string,
    repoPath: string,
  ): void {
    // Defense in depth: refuse to spawn against a non-absolute / missing cwd.
    // Bun.spawn with a bad cwd can throw or behave oddly per-platform; failing
    // fast here (synchronously, BEFORE the run is tracked) surfaces as a launch
    // throw → caller compensation, not a half-tracked run.
    if (!isAbsolute(repoPath) || !existsSync(repoPath)) {
      throw new Error(`repoPath must be an existing absolute path: ${repoPath}`);
    }

    const args = [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      // No --max-turns by default: a low cap aborts the agent the instant it uses
      // a tool (error_max_turns). Only pass it when explicitly configured.
      ...(this.maxTurns !== undefined
        ? ["--max-turns", String(this.maxTurns)]
        : []),
      ...(this.model !== undefined ? ["--model", this.model] : []),
    ];

    // Bun.spawn throws synchronously if the binary is missing/unspawnable → that
    // escapes launch as the "spawn is impossible" case the contract calls out.
    const child = Bun.spawn([this.claudeBin, ...args], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    this.children.set(ctx.runId, child);
    this.contexts.set(ctx.runId, ctx);

    // Detached: do NOT await. awaitAndEmit owns the rest of the lifecycle and is
    // total — it catches everything and always emits a terminal/result event — so
    // there is never an unhandled rejection. void marks the intentional detach.
    void this.awaitAndEmit(ctx, child);
  }

  /**
   * Background task: await the spawned child, drain+parse its stream-json, and
   * emit. On success: emit ONLY `ResultEmitted` — the run stays `running` and the
   * sink raises a `visual_review` Question ("レビュー待ち"); the run is finalized to
   * `done` later by resume() when the human approves the review. On TIMEOUT (the
   * run is stuck) → emit terminal `RunStateChanged stalled` (the retriable stall
   * surface); on any other failure (non-zero exit, parse miss, is_error, sink
   * throw) → terminal `failed`. Never rejects — all errors are caught + converted.
   */
  private async awaitAndEmit(
    ctx: RunContext,
    child: SpawnedChild,
  ): Promise<void> {
    let timedOut = false;
    let hardKillTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      this.killChild(child);
      // SIGTERM may be ignored; escalate to SIGKILL after a short grace so a
      // stubborn process can't keep child.exited (and this run) pending forever.
      hardKillTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // best-effort; nothing more we can do.
        }
      }, HARD_KILL_GRACE_MS);
    }, this.timeoutMs);

    try {
      // Drain stdout, stderr, and the exit concurrently. Draining stdout fully
      // before reading stderr can deadlock when the child blocks writing to a
      // full stderr pipe while we're still reading stdout.
      // SpawnedChild widens stdout/stderr to a union (the general Bun.spawn
      // overload), but this adapter always spawns with `"pipe"`, so both are
      // ReadableStreams — narrow them for Response.
      const out = child.stdout as ReadableStream<Uint8Array>;
      const err = child.stderr as ReadableStream<Uint8Array>;
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(out).text(),
        new Response(err).text(),
        child.exited,
      ]);
      if (timedOut) {
        throw new Error(`claude timed out after ${this.timeoutMs}ms`);
      }
      if (exitCode !== 0) {
        // claude usually writes its real error to STDOUT (stream-json), not
        // stderr — a bare `claude exited 1:` with empty stderr is useless to the
        // human. Prefer stderr, but fall back to a readable detail mined from
        // stdout so the failureReason carries the actual cause.
        const detail = claudeFailureDetail(stderr, stdout);
        throw new Error(
          detail
            ? `claude exited ${exitCode}: ${detail}`
            : `claude exited ${exitCode}(診断出力なし — claude CLI のログを確認してください)`,
        );
      }
      const text = extractResultText(stdout);
      if (text === undefined || text.trim().length === 0) {
        throw new Error("claude produced no assistant result text");
      }
      // SUCCESS: emit ONLY the review. Do NOT emit `done` — the run stays
      // `running` until the human approves the review (resume → done). This keeps
      // the live flow consistent with the scripted model's review→approve gate.
      await this.emit(ctx, {
        type: "ResultEmitted",
        runId: ctx.runId,
        blocks: [
          {
            type: "summary",
            title: `S${ctx.step as string} (live Claude)`,
            body: text,
          },
        ],
      });
    } catch (err) {
      logError("LiveClaudeOrchestrator: run ended abnormally", err);
      // A TIMEOUT means the run is STUCK (the AI stopped making progress) → emit
      // `stalled`, the recoverable state the human retries from. A genuine error
      // (non-zero exit, parse miss, spawn failure, is_error) → `failed`. Both are
      // retriable, but the distinction makes stall detection real in live mode
      // (the stall surface + retry only triggers on a `stalled` run).
      // This terminal emit is best-effort: if the sink throws it must NOT escape
      // (detached task → an escape would be an unhandled rejection and leave the
      // run with no terminal state). Swallow after logging.
      const terminal: "stalled" | "failed" = timedOut ? "stalled" : "failed";
      // Derive a concise, human-readable reason from the actual error so the
      // user knows WHAT went wrong (not just "failed").
      const reason = err instanceof Error ? err.message : String(err);
      try {
        await this.emit(ctx, {
          type: "RunStateChanged",
          runId: ctx.runId,
          to: terminal,
          reason,
        });
      } catch (sinkErr) {
        logError("LiveClaudeOrchestrator: terminal-emit threw", sinkErr);
      }
    } finally {
      clearTimeout(timer);
      if (hardKillTimer !== undefined) clearTimeout(hardKillTimer);
      this.children.delete(ctx.runId);
    }
  }

  private killChild(child: SpawnedChild): void {
    try {
      child.kill();
    } catch {
      // best-effort kill; the awaited child.exited still resolves.
    }
  }

  private async emit(ctx: RunContext, event: DomainEvent): Promise<void> {
    await this.sink({ ctx, event });
  }
}

const MAX_DETAIL_LEN = 500;

/** Readable text for claude's known terminal `result` error subtypes. */
const RESULT_SUBTYPE_MSG: Record<string, string> = {
  error_max_turns: "max turns に達しました(エージェントが完了前に停止)",
  error_during_execution: "実行中にエラーが発生しました",
};

/**
 * Human-readable summary of a claude stream-json `{"type":"result"}` event, or
 * undefined if it isn't an error result. Prefers the `result` text; otherwise
 * maps the known error subtype to a sentence (NOT raw JSON — error_max_turns &
 * friends carry no `result` string, only a subtype).
 */
function resultEventMessage(e: Record<string, unknown>): string | undefined {
  if (e["type"] !== "result") return undefined;
  const result = e["result"];
  if (typeof result === "string" && result.trim().length > 0) return result;
  const subtype = e["subtype"];
  if (typeof subtype !== "string" || subtype === "success") return undefined;
  const base = RESULT_SUBTYPE_MSG[subtype] ?? `claude error: ${subtype}`;
  const turns = e["num_turns"];
  return typeof turns === "number" ? `${base}(${turns} turns)` : base;
}

/**
 * Best-effort human-readable detail for a non-zero `claude` exit, used to enrich
 * the run's failureReason. Prefers stderr; when it's empty (claude writes most
 * errors to stdout as stream-json), mines stdout for an error message — a
 * `{"type":"result"}` event (its `result` text or mapped error subtype), a
 * top-level `error`, or the last non-JSON text line. Raw JSON is NEVER returned
 * verbatim. Returns "" when nothing usable exists.
 */
export function claudeFailureDetail(stderr: string, stdout: string): string {
  const errText = stderr.trim();
  if (errText.length > 0) return errText.slice(0, MAX_DETAIL_LEN);

  let fromJson: string | undefined;
  let lastText: string | undefined; // last NON-JSON line — never a raw JSON dump.
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let evt: unknown;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      lastText = trimmed; // plain text (e.g. a stack trace) — usable as detail.
      continue;
    }
    if (typeof evt !== "object" || evt === null) continue;
    const e = evt as Record<string, unknown>;
    const resultMsg = resultEventMessage(e);
    if (resultMsg !== undefined) {
      fromJson = resultMsg;
    } else if (typeof e["error"] === "string") {
      fromJson = e["error"] as string;
    } else if (
      typeof e["error"] === "object" &&
      e["error"] !== null &&
      typeof (e["error"] as Record<string, unknown>)["message"] === "string"
    ) {
      fromJson = (e["error"] as Record<string, unknown>)["message"] as string;
    }
  }
  const detail = (fromJson ?? lastText ?? "").trim();
  return detail.slice(0, MAX_DETAIL_LEN);
}

/**
 * Extract the assistant's final text from claude stream-json JSONL output.
 * Primary: the `{"type":"result","subtype":"success","result":"..."}` event.
 * Fallback: the last `{"type":"assistant"}` event's message.content[].text.
 * Tolerant of interleaved hook/system/rate_limit lines and partial trailing JSON.
 */
export function extractResultText(stdout: string): string | undefined {
  let resultText: string | undefined;
  let assistantText: string | undefined;
  let sawErrorResult = false;

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let evt: unknown;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      continue; // skip non-JSON / partial lines.
    }
    if (typeof evt !== "object" || evt === null) continue;
    const e = evt as Record<string, unknown>;

    if (e["type"] === "result") {
      if (e["is_error"] === true) {
        // The CLI itself reported the turn as an error → this run failed; do not
        // pass partial text off as a successful result.
        sawErrorResult = true;
      } else if (typeof e["result"] === "string") {
        resultText = e["result"] as string;
      }
    } else if (e["type"] === "assistant") {
      const text = assistantTextOf(e["message"]);
      if (text !== undefined) assistantText = text;
    }
  }

  // A success result wins. Otherwise, if the CLI flagged an error result, fail
  // loudly so the run emits `failed` rather than `done` with partial assistant
  // text. With no result at all, fall back to the last assistant text.
  if (resultText !== undefined) return resultText;
  if (sawErrorResult) throw new Error(RESULT_IS_ERROR);
  return assistantText;
}

function assistantTextOf(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const content = (message as Record<string, unknown>)["content"];
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (
      typeof block === "object" &&
      block !== null &&
      (block as Record<string, unknown>)["type"] === "text" &&
      typeof (block as Record<string, unknown>)["text"] === "string"
    ) {
      parts.push((block as Record<string, unknown>)["text"] as string);
    }
  }
  return parts.length > 0 ? parts.join("") : undefined;
}

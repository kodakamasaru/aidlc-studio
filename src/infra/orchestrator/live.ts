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
  readonly buildPrompt?: (cmd: RunLaunch) => string;
}

type SpawnedChild = ReturnType<typeof Bun.spawn>;

export class LiveClaudeOrchestrator implements OrchestratorPort {
  private readonly sink: DomainEventSink;
  private readonly claudeBin: string;
  private readonly model: string | undefined;
  private readonly timeoutMs: number;
  private readonly buildPrompt: (cmd: RunLaunch) => string;
  // Live child processes keyed by runId, so cancel() can kill an in-flight run.
  private readonly children = new Map<string, SpawnedChild>();

  constructor(opts: LiveClaudeOptions) {
    this.sink = opts.sink;
    this.claudeBin = opts.claudeBin ?? DEFAULT_CLAUDE_BIN;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.buildPrompt = opts.buildPrompt ?? defaultBuildPrompt;
  }

  async launch(cmd: RunLaunch): Promise<void> {
    await this.runAttempt(
      buildRunContext(cmd, cmd.runId),
      this.buildPrompt(cmd),
      cmd.repoPath,
    );
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
    await this.runAttempt(
      buildRunContext(cmd, cmd.newRunId),
      this.buildPrompt(launchLike),
      cmd.repoPath,
    );
  }

  /**
   * v0.0.x: interactive Q→answer→resume against the real model is NOT yet
   * supported — headless `claude -p` runs to completion and never pauses for
   * human input mid-run, so there is no live session to inject an answer into.
   * The real-AI gated test therefore does NOT depend on real Q→resume. The
   * proper enhancement is `--resume <session-id>` with the human answer streamed
   * as the next turn (v0.0.x).
   *
   * Rather than silently no-op'ing (which would leave the run hanging with no
   * terminal affordance), we THROW. ResumeRun carries only a runId — not the
   * cycle/phase/step context an emission needs — so the adapter can't emit a
   * context-tagged terminal event itself. Throwing routes through the inbox
   * service's post-commit compensation, which drives the acted-on run to a
   * retriable terminal state and surfaces a 502, so the UI/inbox can offer a
   * retry instead of the run hanging forever.
   */
  async resume(_cmd: ResumeRun): Promise<void> {
    const reason =
      "resume-not-supported-in-v0: headless claude -p cannot pause/resume";
    logError("LiveClaudeOrchestrator.resume", reason);
    return Promise.reject(new Error(reason));
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
   * Spawn the local claude headless for one attempt, await completion, and emit.
   * On success: ResultEmitted(summary) THEN RunStateChanged(done). On any
   * failure (spawn error, non-zero exit, timeout, parse miss): RunStateChanged
   * (failed). Never throws out of here unless the spawn itself is impossible —
   * the run state conveys failure to the app layer.
   */
  private async runAttempt(
    ctx: RunContext,
    prompt: string,
    repoPath: string,
  ): Promise<void> {
    // The ENTIRE attempt — spawn, parse, AND the ResultEmitted/done emits — is
    // wrapped so ANY failure (spawn error, non-zero exit, timeout, parse miss,
    // is_error result, or a throw from the sink mid-emit) falls through to emit
    // exactly one terminal `failed`. A run is never left with no terminal state.
    try {
      const text = await this.runClaude(ctx.runId, prompt, repoPath);
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
      await this.emit(ctx, {
        type: "RunStateChanged",
        runId: ctx.runId,
        to: "done",
      });
    } catch (err) {
      logError("LiveClaudeOrchestrator: run failed", err);
      // The terminal `failed` emit is itself best-effort: if the sink throws
      // here (the only emit on the failure path), it must NOT escape — otherwise
      // the run is left with no terminal state at all. Swallow after logging so
      // the attempt is guaranteed to resolve, never reject, on the failure path.
      try {
        await this.emit(ctx, {
          type: "RunStateChanged",
          runId: ctx.runId,
          to: "failed",
        });
      } catch (sinkErr) {
        logError("LiveClaudeOrchestrator: terminal failed-emit threw", sinkErr);
      }
    }
  }

  /**
   * Run `claude -p <prompt> --output-format stream-json --verbose --max-turns 1`
   * in cwd=repoPath, stream-parse JSONL stdout, and return the assistant's final
   * text. Throws on non-zero exit, timeout, or when no result text is found.
   */
  private async runClaude(
    runId: RunId,
    prompt: string,
    repoPath: string,
  ): Promise<string> {
    // Defense in depth: refuse to spawn against a non-absolute / missing cwd.
    // Bun.spawn with a bad cwd can throw or behave oddly per-platform; failing
    // fast here yields a clean, well-described error → terminal `failed`.
    if (!isAbsolute(repoPath) || !existsSync(repoPath)) {
      throw new Error(
        `repoPath must be an existing absolute path: ${repoPath}`,
      );
    }

    const args = [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--max-turns",
      "1",
      ...(this.model !== undefined ? ["--model", this.model] : []),
    ];

    const child = Bun.spawn([this.claudeBin, ...args], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    this.children.set(runId, child);

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
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (timedOut) {
        throw new Error(`claude timed out after ${this.timeoutMs}ms`);
      }
      if (exitCode !== 0) {
        throw new Error(`claude exited ${exitCode}: ${stderr.slice(0, 500)}`);
      }
      const text = extractResultText(stdout);
      if (text === undefined || text.trim().length === 0) {
        throw new Error("claude produced no assistant result text");
      }
      return text;
    } finally {
      clearTimeout(timer);
      if (hardKillTimer !== undefined) clearTimeout(hardKillTimer);
      this.children.delete(runId);
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

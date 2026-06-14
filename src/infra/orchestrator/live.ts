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
import type { DomainEvent, QuestionRaised } from "../../domain/events/events";
import type { RunId } from "../../domain/shared/ids";
import type { Step } from "../../domain/shared/vocab";
import type { PromptComposer } from "../../app/services/prompt-composer";
import type { ScreenshotCapturer, CaptureResult } from "../../app/ports/screenshot";
import type { ReviewBlock } from "../../domain/review/review";
import type { Text } from "../../domain/shared/primitives";
import type { QuestionOption } from "../../domain/question/question";
import type { SessionRepo } from "../../app/ports/repos";
import { extractCompleteness } from "./completeness-parse";
import { buildRunContext } from "./shared";
import { join, resolve } from "node:path";
import { logError } from "../log";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { parseQuestionBlock, type AidlcQuestion } from "../../wire/aidlc-wire";
import { parseAidlcResultBlock, type AidlcResult } from "../../wire/aidlc-result";

/**
 * Unit-04: cap on resume turns per hearing. Exceeding this emits `stalled`
 * (retriable) so the run doesn't loop infinitely. Value 10 is a provisional
 * operational ceiling (S4 non-functional requirement / unit-04-resume-turn.md).
 */
export const MAX_HEARING_TURNS = 10;

/**
 * BU-2: Pure mapper — translate a validated AidlcResult envelope into the
 * sequence of DomainEvents to emit. This is the testable core of the new path.
 *
 * Routing (§C7.4 s4-tech-spec):
 *   - questions[] non-empty → one QuestionRaised per question (questions win
 *     over status; the AI is asking for clarification before proceeding)
 *   - status="needs_human" (no questions) → ResultEmitted carrying completeness
 *     + artifacts + decisions (human visual_review path)
 *   - status="done"    → RunStateChanged done  (no human gate)
 *   - status="stalled" → RunStateChanged stalled (retriable)
 *
 * Pure: no I/O, no side effects. Exported for direct unit testing.
 */
export function aidlcResultToEvents(runId: RunId, result: AidlcResult): DomainEvent[] {
  // questions[] non-empty: emit one QuestionRaised per question (highest priority).
  if (result.questions.length > 0) {
    return result.questions.map((q) => aidlcQuestionToEvent(runId, q));
  }

  if (result.status === "needs_human") {
    // Build a ResultEmitted that carries completeness + artifacts + decisions
    // from the envelope (§C7.4). blocks starts empty — the review text is in
    // aidlc-docs md files (path refs in artifacts); the ReviewDetail renderer
    // uses artifacts + completeness directly (Unit-05 alignment).
    const event: DomainEvent = {
      type: "ResultEmitted",
      runId,
      blocks: [],
      completeness: result.completeness,
      ...(result.artifacts.length > 0 ? { artifacts: result.artifacts } : {}),
      ...(result.decisions.length > 0 ? { decisions: result.decisions } : {}),
    };
    return [event];
  }

  if (result.status === "done") {
    return [{
      type: "RunStateChanged",
      runId,
      to: "done",
    }];
  }

  // status === "stalled"
  return [{
    type: "RunStateChanged",
    runId,
    to: "stalled",
    reason: "AI がスタックを報告しました(aidlc-result status=stalled)。Inbox から retry してください。",
  }];
}

/** Default bounded prompt: one sentence, no tools needed, fully deterministic shape. */
const defaultBuildPrompt = (cmd: { readonly step: Step }): string =>
  `You are running AI-DLC step ${cmd.step as string}. In ONE sentence, state ` +
  `what this step produces. Reply with only that sentence.`;

/** Evaluator stub (used only when no PromptComposer is wired). */
const evalStubPrompt = (cmd: EvalLaunch): string => {
  const obs = (cmd.verification ?? []).map((o) => `- ${o as string}`).join("\n");
  return (
    `You are the EVALUATOR for AI-DLC step ${cmd.step as string}. Verify the ` +
    `generator's output${obs.length > 0 ? ` against:\n${obs}` : ""}\nIn ONE ` +
    `sentence, state whether the step's requirements are met. Reply with only that sentence.`
  );
};

/**
 * US-05: map a CaptureResult to a `screenshot` review block. ok → served URL src;
 * failure → empty src (web renders placeholder) + the reason in the caption (never
 * a silent empty / 原則④). Pure, so the ok/failure mapping is deterministically tested.
 */
export function screenshotBlockFrom(
  result: CaptureResult,
  urlBase: string,
  file: string,
): ReviewBlock {
  return result.ok
    ? {
        type: "screenshot",
        src: `${urlBase}/${file}` as Text,
        caption: "verify-ui 実行画面(live)" as Text,
      }
    : {
        type: "screenshot",
        src: "" as Text, // empty → web ScreenshotFigure renders the placeholder
        caption: `スクリーンショット取得失敗: ${result.reason}` as Text,
      };
}

/**
 * Unit-03: Extract the session_id from the stream-json init line.
 * Pure, standalone, exported so Unit-04 can import without touching the drain loop.
 *
 * Looks for `{"type":"system","subtype":"init","session_id":"..."}` in the JSONL.
 * Returns the session_id string when found and non-empty; null otherwise.
 * Absence is NOT silently swallowed — callers must surface it (resume-impossible / 原則④).
 */
export function extractSessionId(stdout: string): string | null {
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let evt: unknown;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof evt !== "object" || evt === null) continue;
    const e = evt as Record<string, unknown>;
    if (e["type"] === "system" && e["subtype"] === "init") {
      const sid = e["session_id"];
      if (typeof sid === "string" && sid.length > 0) return sid;
      // init found but session_id is missing/empty/wrong type → null (unusable).
      return null;
    }
  }
  return null;
}

/**
 * Unit-03: Map one wire AidlcQuestion to a domain QuestionRaised event.
 * Pure, standalone, exported for direct unit testing.
 *
 * Wire `background` has no domain field; when present it is merged into the prompt
 * (appended after a separator) so the human sees full context. Wire `answerKind`
 * is not exposed on the domain payload (the domain uses kind="question" uniformly).
 * Options are mapped 1-to-1: id/label/hint/recommended preserved as-is.
 */
export function aidlcQuestionToEvent(runId: RunId, q: AidlcQuestion): QuestionRaised {
  const prompt: Text = q.background !== undefined
    ? `${q.prompt}\n\n背景: ${q.background}`
    : q.prompt;

  const options: readonly QuestionOption[] = q.options.map((o) => ({
    id: o.id,
    label: o.label as Text,
    ...(o.hint !== undefined ? { hint: o.hint as Text } : {}),
    ...(o.recommended === true ? { recommended: true } : {}),
  }));

  return {
    type: "QuestionRaised",
    runId,
    kind: "question",
    payload: { kind: "question", prompt, options },
  };
}

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
  /**
   * US-03 PromptComposer: when set, generator/evaluator prompts are composed from
   * the real skill 本文 + step contracts (the single canonical source) instead of
   * the one-sentence stubs. Omitted = stub prompts (deterministic tests, demos).
   */
  readonly composer?: PromptComposer;
  /**
   * US-05 verify-ui screenshot: when set (with verifyUrl), an evaluator run captures
   * a real screenshot of the running app and emits it as a `screenshot` review block
   * (real path on success / placeholder + reason on failure). Omitted = no capture.
   */
  readonly capturer?: ScreenshotCapturer;
  /** URL the capturer screenshots (the running app = verify-ui subject). */
  readonly verifyUrl?: string;
  /** Dir the capturer writes pngs into (served by the screenshots HTTP route). */
  readonly shotsDir?: string;
  /** URL prefix the server serves shotsDir at (the review block's src base). */
  readonly shotUrlBase?: string;
  /**
   * Unit-04: session_id store for persisting the claude session captured from
   * stream-json init, keyed by runId. When omitted (legacy / tests that don't
   * need resume), session persistence is skipped silently.
   */
  readonly sessionRepo?: SessionRepo;
}

type SpawnedChild = ReturnType<typeof Bun.spawn>;

export class LiveClaudeOrchestrator implements OrchestratorPort {
  private readonly sink: DomainEventSink;
  private readonly claudeBin: string;
  private readonly model: string | undefined;
  private readonly timeoutMs: number;
  private readonly maxTurns: number | undefined;
  private readonly buildPrompt: (cmd: RunLaunch) => string;
  private readonly composer: PromptComposer | undefined;
  private readonly capturer: ScreenshotCapturer | undefined;
  private readonly verifyUrl: string | undefined;
  private readonly shotsDir: string;
  private readonly shotUrlBase: string;
  private readonly sessionRepo: SessionRepo | undefined;
  // Live child processes keyed by runId, so cancel() can kill an in-flight run.
  private readonly children = new Map<string, SpawnedChild>();
  // Each run's full context, kept so the post-review approval finalize (resume)
  // can emit a context-tagged `RunStateChanged done` — the sink needs cycleId to
  // locate + advance the Cycle. Populated at startAttempt; never evicted in v0
  // (one run per launch; bounded by process lifetime).
  private readonly contexts = new Map<string, RunContext>();
  // Unit-04: count resume turns per runId (turns in one hearing). When this
  // exceeds MAX_HEARING_TURNS the run is stalled so the human decides next steps.
  private readonly resumeCounts = new Map<string, number>();

  constructor(opts: LiveClaudeOptions) {
    this.sink = opts.sink;
    this.claudeBin = opts.claudeBin ?? DEFAULT_CLAUDE_BIN;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTurns = opts.maxTurns;
    this.buildPrompt = opts.buildPrompt ?? defaultBuildPrompt;
    this.composer = opts.composer;
    this.capturer = opts.capturer;
    this.verifyUrl = opts.verifyUrl;
    // Absolute default so a capturer injected without an explicit shotsDir still
    // writes to a well-defined dir (not cwd-relative at call time).
    this.shotsDir = opts.shotsDir ?? resolve(process.cwd(), ".verify-screenshots");
    this.shotUrlBase = opts.shotUrlBase ?? "/api/screenshots";
    this.sessionRepo = opts.sessionRepo;
  }

  /**
   * US-05: capture a verify-ui screenshot for an evaluator run and return a
   * `screenshot` review block. On success the block's src is the served URL of the
   * real png; on failure it carries an empty src + the reason (placeholder, never a
   * silent empty / 原則④). Returns undefined when capture isn't configured.
   */
  private async captureVerifyUi(runId: string): Promise<ReviewBlock | undefined> {
    if (this.capturer === undefined || this.verifyUrl === undefined) return undefined;
    const file = `${runId}.png`;
    const outPath = join(this.shotsDir, file);
    let result: CaptureResult;
    try {
      result = await this.capturer.capture({ url: this.verifyUrl, outPath });
    } catch (err) {
      result = { ok: false as const, reason: err instanceof Error ? err.message : String(err) };
    }
    if (!result.ok) {
      logError("LiveClaudeOrchestrator: verify-ui screenshot capture failed", {
        runId,
        reason: result.reason,
      });
    }
    return screenshotBlockFrom(result, this.shotUrlBase, file);
  }

  /** Generator prompt: real composition when a composer is wired, else the stub. */
  private generatorPrompt(cmd: RunLaunch): string {
    if (!this.composer) return this.buildPrompt(cmd);
    // BU-1: prefer structured path when structuredContext is present (§C7.1-C7.4 sections).
    // Legacy path (contextPaths) is kept as fallback for scripted / backward-compat cases.
    if (cmd.structuredContext !== undefined) {
      return this.composer.composeWithStructuredContext(
        { role: "generator", step: cmd.step, repoPath: cmd.repoPath },
        cmd.structuredContext,
      );
    }
    return this.composer.compose({
      role: "generator",
      step: cmd.step,
      repoPath: cmd.repoPath,
      // Unit-02 前段文脈注入: forward resolved contextPaths from the launch context so
      // the composer injects prior-step artifacts instead of its brief.md default.
      ...(cmd.contextPaths !== undefined ? { contextPaths: cmd.contextPaths } : {}),
    });
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
      this.generatorPrompt(cmd),
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
    const prompt = this.composer
      ? this.composer.compose({
          role: "evaluator",
          step: cmd.step,
          repoPath: cmd.repoPath,
          ...(cmd.verification ? { verification: cmd.verification } : {}),
        })
      : evalStubPrompt(cmd);
    // US-04: evaluator runs parse a structured completeness verdict out of the
    // result and emit it on ResultEmitted, so the SAME app gate (gap→descope) runs
    // on the real model's output.
    this.startAttempt(buildRunContext(cmd, cmd.runId), prompt, cmd.repoPath, {
      completeness: true,
    });
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
      this.generatorPrompt(launchLike),
      cmd.repoPath,
    );
  }

  /**
   * Unit-04: two-path resume.
   *
   * PATH A — turn continuation (`body` present):
   *   Re-spawn `claude --resume <sessionId> -p <body>` to run the next turn.
   *   The resumed turn drains through `awaitAndEmit`, which emits:
   *     - `QuestionRaised`  when the AI asks another question
   *     - `ResultEmitted`   when the AI produces a visual_review result
   *   If `sessionId` is absent the run cannot be resumed → emit `stalled` so
   *   the human can retry from the Inbox (never silently lost / 原則④).
   *   Turn cap: exceeding MAX_HEARING_TURNS emits `stalled` (US-04 AC).
   *
   * PATH B — finalize approval (`body` absent):
   *   The human approved a `visual_review` → emit terminal `RunStateChanged done`.
   *   No `claude` re-spawn is needed (the run already completed its last turn).
   *
   * Context requirement (paths A + B): ctx must be in this.contexts. If it is
   * missing (server restart / not launched by this instance) the run is stuck.
   * Throw so the caller's compensation surfaces a 502 instead of silent failure.
   */
  async resume(cmd: ResumeRun): Promise<void> {
    const ctx = this.contexts.get(cmd.runId);
    if (!ctx) {
      // Context lost (server restart / not launched by this instance).
      throw new Error(
        `LiveClaudeOrchestrator.resume: context not found for run ${cmd.runId}`,
      );
    }

    // PATH B — finalize approval (no body → done, no re-spawn).
    if (cmd.body === undefined) {
      await this.emit(ctx, {
        type: "RunStateChanged",
        runId: cmd.runId,
        to: "done",
      });
      return;
    }

    // PATH A — turn continuation.
    // Turn cap: count how many resume turns this run has had in this hearing.
    const turns = (this.resumeCounts.get(cmd.runId) ?? 0) + 1;
    this.resumeCounts.set(cmd.runId, turns);
    if (turns > MAX_HEARING_TURNS) {
      logError(
        `LiveClaudeOrchestrator.resume: MAX_HEARING_TURNS (${MAX_HEARING_TURNS}) exceeded`,
        { runId: cmd.runId },
      );
      await this.emit(ctx, {
        type: "RunStateChanged",
        runId: cmd.runId,
        to: "stalled",
        reason: `ヒアリング turn 数が上限(${MAX_HEARING_TURNS})を超えました。Inbox から retry してください。`,
      });
      return;
    }

    // sessionId is required for --resume. Missing → stalled (not silent / 原則④).
    if (!cmd.sessionId) {
      logError(
        "LiveClaudeOrchestrator.resume: sessionId missing — cannot --resume without it",
        { runId: cmd.runId },
      );
      await this.emit(ctx, {
        type: "RunStateChanged",
        runId: cmd.runId,
        to: "stalled",
        reason: "セッション ID が見つかりません。run を retry してください。",
      });
      return;
    }

    // Spawn `claude --resume <sessionId> -p <body>` to run the next turn.
    // Uses the same non-blocking spawn+detach model as launch/retry: the
    // resume call returns as soon as the child is tracked; awaitAndEmit drains
    // in the background and emits QuestionRaised or ResultEmitted.
    this.startResumeTurn(ctx, cmd.sessionId, cmd.body as string);
  }

  /**
   * Unit-04: spawn a resumed turn (`claude --resume <sessionId> -p <body>`) and
   * detach. Uses the same awaitAndEmit drain as launch/retry. Non-blocking so the
   * inbox-service POST resolves quickly. Throws synchronously only when the spawn
   * itself is impossible (bad binary) so the caller's compensation can react.
   */
  private startResumeTurn(ctx: RunContext, sessionId: string, body: string): void {
    const args = [
      "--resume",
      sessionId,
      "-p",
      body,
      "--output-format",
      "stream-json",
      "--verbose",
      ...(this.maxTurns !== undefined ? ["--max-turns", String(this.maxTurns)] : []),
      ...(this.model !== undefined ? ["--model", this.model] : []),
    ];

    const child = Bun.spawn([this.claudeBin, ...args], {
      cwd: process.cwd(), // resumed session has no repoPath context; use cwd
      stdout: "pipe",
      stderr: "pipe",
    });
    this.children.set(ctx.runId, child);

    void this.awaitAndEmit(ctx, child, false);
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
    opts: { readonly completeness?: boolean } = {},
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
    void this.awaitAndEmit(ctx, child, opts.completeness === true);
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
    parseCompleteness = false,
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
      // Unit-03: parse session_id from the init line (enables --resume in Unit-04).
      // Absence is NOT silently swallowed — log it so the operator knows resume
      // is not available for this run (原則④).
      const sessionId = extractSessionId(stdout);
      if (sessionId === null) {
        logError("LiveClaudeOrchestrator: stream-json init line missing — session_id unavailable (--resume disabled for this run)", {
          runId: ctx.runId as string,
        });
      } else {
        // Unit-04: persist the captured session_id so a later resume turn can
        // pass `--resume <sessionId>`. Writing is best-effort: a failure here
        // does NOT abort the run — we log it and continue (the run's result is
        // still valid; only the resume path becomes unavailable for this run).
        try {
          this.sessionRepo?.save(ctx.runId, sessionId);
        } catch (saveErr) {
          logError("LiveClaudeOrchestrator: failed to persist session_id (resume disabled for this run)", saveErr);
        }
      }

      const text = extractResultText(stdout);
      if (text === undefined || text.trim().length === 0) {
        throw new Error("claude produced no assistant result text");
      }

      // BU-2: FIRST try aidlc-result envelope (§C7.4). Present → drive events
      // from the envelope (questions → QuestionRaised; needs_human → ResultEmitted;
      // done/stalled → RunStateChanged). Parse error → log (原則④) + fall through
      // to the legacy path below (safe fallback: never silently drop output).
      // Absent (ok null) → proceed to the existing paths below, unchanged.
      const resultParseResult = parseAidlcResultBlock(text);
      if (!resultParseResult.ok) {
        logError(
          "LiveClaudeOrchestrator: aidlc-result block parse error — falling back to legacy path",
          { runId: ctx.runId as string, code: resultParseResult.error.code, detail: resultParseResult.error.detail },
        );
        // Fall through to legacy path (aidlc-question then ResultEmitted).
      } else if (resultParseResult.value !== null) {
        // Envelope found and validated → emit events derived from it.
        const events = aidlcResultToEvents(ctx.runId, resultParseResult.value);
        for (const event of events) {
          await this.emit(ctx, event);
        }
        return;
      }

      // Unit-03: check for an aidlc-question block. Present → emit QuestionRaised
      // cards (one per question). Absent → fall through to the existing
      // ResultEmitted→visual_review path. Parse error → log (原則④) + fall through
      // (safe side: never silently misclassify a parse failure as a clean result).
      const questionParseResult = parseQuestionBlock(text);
      if (!questionParseResult.ok) {
        logError(
          "LiveClaudeOrchestrator: aidlc-question block parse error — falling back to ResultEmitted",
          { runId: ctx.runId as string, code: questionParseResult.error.code, detail: questionParseResult.error.detail },
        );
      } else if (questionParseResult.value !== null) {
        // Block found and parsed → emit one QuestionRaised per question (US-03 AC).
        for (const q of questionParseResult.value) {
          await this.emit(ctx, aidlcQuestionToEvent(ctx.runId, q));
        }
        // Questions emitted — do NOT also emit ResultEmitted for this run.
        return;
      }

      // US-04: evaluator runs parse a structured completeness verdict so the SAME
      // app gate runs on the real model output. A parse miss does NOT silently drop
      // it — we log that completeness was expected-but-absent (the app then falls
      // back to visual_review, observably / 原則④).
      let completeness;
      let shotBlock: ReviewBlock | undefined;
      if (parseCompleteness) {
        completeness = extractCompleteness(text);
        if (completeness === undefined) {
          logError("LiveClaudeOrchestrator: evaluator emitted no parseable completeness", {
            runId: ctx.runId as string,
          });
        }
        // US-05: capture the verify-ui screenshot as visual evidence for the review.
        shotBlock = await this.captureVerifyUi(ctx.runId as string);
      }
      const blocks: ReviewBlock[] = [
        { type: "summary", title: `${ctx.step as string} (live Claude)` as Text, body: text as Text },
        ...(shotBlock ? [shotBlock] : []),
      ];
      // SUCCESS: emit ONLY the review. Do NOT emit `done` — the run stays
      // `running` until the human approves the review (resume → done). This keeps
      // the live flow consistent with the scripted model's review→approve gate.
      await this.emit(ctx, {
        type: "ResultEmitted",
        runId: ctx.runId,
        blocks,
        ...(completeness ? { completeness } : {}),
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

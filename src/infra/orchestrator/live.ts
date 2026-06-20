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
import { logError, logInfo } from "../log";
import { existsSync, readFileSync, copyFileSync, realpathSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { parseQuestionBlock, parseReconstructionBlock, type AidlcQuestion } from "../../wire/aidlc-wire";
import { parseAidlcResultBlock, type AidlcResult } from "../../wire/aidlc-result";
import { writeEvidenceManifest, toUtcInstant, type EvidenceFormInput } from "../evidence/evidence-manifest";

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
export function aidlcResultToEvents(
  runId: RunId,
  result: AidlcResult,
  // US-02: the artifact md files' content, pre-read by the live adapter and passed
  // in as `summary` blocks so the human can READ the brief/US in the review without
  // opening files (SCR-03 / 原則③). Empty for the scripted/pure path.
  contentBlocks: readonly ReviewBlock[] = [],
): DomainEvent[] {
  // questions[] non-empty: emit one QuestionRaised per question (highest priority).
  if (result.questions.length > 0) {
    return result.questions.map((q) => aidlcQuestionToEvent(runId, q));
  }

  // F-15: 人間レビューの要否は「ステップ設定(humanGate)」が決めるのであって、ステップ内の
  // AI が status で決めることではない。AI が status:"done"(人間ゲート不要)と主張しても、
  // レビューが設定された工程(S1 等)で人間ゲートをスキップさせてはならない(責務契約②
  // human-gate のみ停止 / Human Inbox の前提)。よって done でも needs_human でも、成果を
  // **レビュー可能な ResultEmitted** として出し、ゲートの可否は下流(ステップ設定)に委ねる。
  // 前進(done への確定・reconstruction 等)は人間が承認して初めて起きる
  // (InboxService.finalizeApprovedReview → RunStateChanged done)。
  // stalled だけは続行不能の報告なので別扱い。
  if (result.status === "needs_human" || result.status === "done") {
    // Build a ResultEmitted that carries the artifact content (md 本文) as blocks
    // PLUS completeness + artifacts + decisions from the envelope (§C7.4). Rendering
    // the body fulfils US-02 (review without opening files).
    const event: DomainEvent = {
      type: "ResultEmitted",
      runId,
      blocks: contentBlocks,
      completeness: result.completeness,
      ...(result.artifacts.length > 0 ? { artifacts: result.artifacts } : {}),
      ...(result.decisions.length > 0 ? { decisions: result.decisions } : {}),
    };
    return [event];
  }

  // status === "stalled"
  return [{
    type: "RunStateChanged",
    runId,
    to: "stalled",
    reason: "AI がスタックを報告しました(aidlc-result status=stalled)。Inbox から retry してください。",
  }];
}

/**
 * S10 F-13: a ```aidlc-result``` fence that is PRESENT but MALFORMED (bad JSON /
 * unclosed fence / schema violation) is a RETRIABLE failure — NOT a reason to dump
 * the raw model text into a summary card. The fence's presence proves the model
 * intended a structured envelope; surfacing the raw text instead would
 *   (a) leak internal JSON / file paths / IDs to the human (契約① 違反),
 *   (b) silently drop any questions the envelope carried, and
 *   (c) skip retry entirely (a broken run shown as a normal review).
 * So we emit `stalled` (the retriable stall surface) with a human-safe reason —
 * the system / human retries and a fresh run typically produces valid JSON. The
 * reason names only the failure CLASS, never the raw JSON (契約① / 原則④).
 * Pure: exported for direct unit testing.
 */
export function malformedResultEvent(runId: RunId): DomainEvent {
  return {
    type: "RunStateChanged",
    runId,
    to: "stalled",
    reason: "AI の出力結果の形式が不正でした(結果データが壊れています)。Inbox から retry してください。",
  };
}

/**
 * F-22 self-repair: how many AUTOMATIC repair turns we feed back into the SAME
 * session before giving up and stalling for the human. A `retry` re-runs the same
 * prompt and reproduces the same malformed shape (that was the real S3 3×-stall),
 * so the durable fix is to tell the model — IN CONTEXT — exactly what was wrong and
 * let it re-emit. Bounded so a model that can't self-correct still ends in a
 * human-retriable stall (the human is the final governor / F-21). 2 = original + 2
 * repairs = 3 envelope attempts within one run, none of which burdens the human.
 */
export const MAX_REPAIR_ATTEMPTS = 2;

/** Which structured fence failed to parse — drives the repair instruction's schema reminder. */
export type RepairFenceKind = "aidlc-result" | "aidlc-question" | "aidlc-reconstruction";

const REPAIR_SCHEMA_HINT: Record<RepairFenceKind, string> = {
  "aidlc-result":
    '{"artifacts":[],"questions":[],"decisions":[],"completeness":{"requirements":[],"addressed":[]},"status":"needs_human"}',
  "aidlc-question":
    '{"questions":[{"id":"Q-01","prompt":"…","options":[{"id":"A","label":"…","recommended":true}],"answerKind":"single"}]}',
  "aidlc-reconstruction":
    '{"scope":"cycle","steps":[{"id":"S2","label":"…","order":0,"skillRef":"aidlc-s2-wireframe","instruction":"…","diff":"keep"}]}',
};

/**
 * F-22 self-repair: build the AI-FACING correction message resumed into the session
 * when a structured fence was present but malformed. NOT shown to the human (it is a
 * resume body that drains through awaitAndEmit; success yields a proper card). It
 * names the failure, echoes the validator's detail, and shows the exact expected
 * shape so the model can re-emit a single valid block. Pure: exported for testing.
 */
export function buildRepairInstruction(kind: RepairFenceKind, detail: string): string {
  return [
    `直前の出力の \`\`\`${kind}\`\`\` ブロックが形式不正で解釈できませんでした。`,
    `理由: ${detail}`,
    "説明文や成果物の作り直しは不要です。**正しい " +
      `\`\`\`${kind}\`\`\` ブロックを 1 つだけ**、有効な minified JSON で出し直してください。`,
    `期待する形(例): ${REPAIR_SCHEMA_HINT[kind]}`,
  ].join("\n");
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
 * F-10 / 契約①: a review block's title is human-facing — it must NOT leak a file path
 * or aidlc-docs directory structure (人間は web カードしか見ず、ファイルを開けない).
 * Derive a business-language title from the artifact's own first markdown heading
 * (already 日本語 per the language contract, e.g. "# US-01 メニュー閲覧" → "US-01 メニュー閲覧");
 * fall back to a de-pathified filename when the body carries no heading.
 */
export function artifactBlockTitle(body: string, rel: string): string {
  for (const line of body.split("\n")) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/)?.[1]?.trim();
    if (heading && heading.length > 0) return heading;
  }
  const base = (rel.split("/").pop() ?? rel).replace(/\.md$/i, "");
  return base.replace(/[-_]/g, " ").trim();
}

/**
 * Caption for a design screenshot block (契約①): de-pathified, de-extensioned,
 * de-slugged label for a screen `.html` artifact — never a path / filename.
 * e.g. "aidlc-docs/v0.0.5/s3/scr-01-browse-menu.html" → "scr 01 browse menu".
 */
export function screenLabel(rel: string): string {
  const base = (rel.split("/").pop() ?? rel).replace(/\.html?$/i, "");
  return base.replace(/[-_]/g, " ").trim();
}

/** A Markdown image reference `![alt](path)` found in the model's prose. */
export interface MarkdownImageRef {
  readonly raw: string; // the full `![alt](path)` match (for replacement)
  readonly alt: string;
  readonly path: string; // the link target (may be a file path or file:// URL)
}

const MD_IMAGE_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)\s*\)/g;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif)$/i;

/**
 * F-23: parse Markdown image references out of the model's prose. The S10 failure:
 * after being told "don't ask visual approval via a text question", the model tried
 * to SHOW the screens by embedding `![alt](/abs/path/scr-01.png)` in its prose AND
 * skipping the aidlc-result envelope — so the review fell to the legacy summary path
 * and rendered raw, unloadable file paths instead of a gallery. The adapter converts
 * these refs to real served screenshot blocks (and de-pathifies the prose). Pure:
 * exported for testing. Only `path` matching an image extension is a candidate.
 */
export function parseMarkdownImageRefs(text: string): MarkdownImageRef[] {
  const refs: MarkdownImageRef[] = [];
  for (const m of text.matchAll(MD_IMAGE_RE)) {
    const alt = m[1] ?? "";
    const path = m[2] ?? "";
    if (!IMAGE_EXT_RE.test(path)) continue; // non-image link → leave it alone
    refs.push({ raw: m[0], alt, path });
  }
  return refs;
}

/**
 * F-23: replace each converted image ref's raw `![alt](path)` with just its caption
 * so the summary prose carries the human-readable label and NEVER the file path
 * (契約① no path leak). Pure: exported for testing.
 */
export function stripImageRefs(
  text: string,
  refs: readonly MarkdownImageRef[],
): string {
  let out = text;
  for (const ref of refs) {
    const caption = ref.alt.trim().length > 0 ? ref.alt.trim() : screenLabel(ref.path);
    out = out.split(ref.raw).join(`【画面: ${caption}】`);
  }
  return out;
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
    // Free-text questions (answerKind="free") carry no options; omit the field
    // entirely so the domain payload reads as "free input only" (question.ts:
    // options 欠落 = 自由入力), not an empty choice list. Choice questions keep theirs.
    payload: { kind: "question", prompt, ...(options.length > 0 ? { options } : {}) },
  };
}

const DEFAULT_CLAUDE_BIN = "claude";
/**
 * Headless isolation (S10 実機 F-10). A live run's cwd is the TARGET repo so the
 * step can write aidlc-docs/. But a default `claude -p` then auto-loads that repo's
 * CLAUDE.md + the user's SessionStart hooks (the prior-session summary that says
 * "MUST NOT re-execute") + auto-memory — which HIJACK the run: the agent answers
 * conversationally in English and refuses the generator prompt as "stale" instead of
 * emitting an aidlc-result envelope. `--setting-sources project` drops that ambient
 * user-level context (CLAUDE.md / auto-memory / session hooks) while keeping the
 * local subscription auth, so the composed prompt is the ONLY instruction.
 */
const SETTING_SOURCES_ARGS = ["--setting-sources", "project"] as const;
/**
 * Dropping user settings also drops the user's tool allowlist, so a headless run's
 * tool use would otherwise block on an un-answerable permission prompt. Grant the
 * step its tools via an EXPLICIT allow-list — an allow rule, NOT
 * `--permission-mode bypassPermissions` / `--dangerously-skip-permissions`, which
 * the operator boundary forbids. These are the tools an AI-DLC step needs to
 * read/write aidlc-docs.
 */
const HEADLESS_TOOL_ALLOW = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "TodoWrite",
  "LS",
] as const;
const HEADLESS_SETTINGS_ARGS = [
  "--settings",
  JSON.stringify({ permissions: { allow: HEADLESS_TOOL_ALLOW } }),
] as const;
/** Appended to every live spawn (launch / retry / eval / resume) — see above. */
const ISOLATION_ARGS: readonly string[] = [
  ...SETTING_SOURCES_ARGS,
  ...HEADLESS_SETTINGS_ARGS,
];
// Wall-clock backstop for a live run producing no result. A real AI-DLC step
// (e.g. S1 generating brief + US docs) routinely runs many minutes, so a short
// cap trips stalls too easily (S10 実機指摘 F-8 / 「上限きびしい」). 60 min default
// gives even long agentic runs plenty of headroom. Override per-deploy via
// AIDLC_STALL_TIMEOUT_MS (server.ts); set timeoutMs <= 0 (env "0"/"off") to DISABLE
// the wall-clock kill entirely (no timer) — the run then only ends on real exit.
const DEFAULT_TIMEOUT_MS = 3_600_000;
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
  // Each run's target repoPath, kept so a resume turn re-spawns `claude --resume`
  // in the SAME cwd the original run used. The Claude CLI scopes sessions per
  // project directory: resuming from a different cwd fails with "No conversation
  // found with session ID". RunContext carries no repoPath, so it is stored here.
  private readonly repoPaths = new Map<string, string>();
  // US-04: each run's cycle version, kept parallel to repoPaths so writeStepEvidence
  // can resolve <repoPath>/aidlc-docs/<version>/_evidence/<step>/ after the run drains.
  // Stored at startAttempt from the launch cmd's version; absent → no auto evidence
  // (scripted / version-less launches stay backward compatible).
  private readonly versions = new Map<string, string>();
  // Unit-04: count resume turns per runId (turns in one hearing). When this
  // exceeds MAX_HEARING_TURNS the run is stalled so the human decides next steps.
  private readonly resumeCounts = new Map<string, number>();
  // F-22: count AUTOMATIC self-repair turns per runId (malformed-envelope fixes
  // fed back into the same session). Separate budget from resumeCounts: a repair is
  // not a hearing turn. Exceeding MAX_REPAIR_ATTEMPTS stalls for the human.
  private readonly repairCounts = new Map<string, number>();

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

  /**
   * US-04 (AC「視覚/動作証拠の自動生成を毎 step 自動実行」): when a run produces a
   * REVIEWABLE result, the platform itself writes the step's live-evidence manifest
   * from REAL run artifacts — so the Unit-01 gate validates platform-produced
   * evidence instead of a hand-faked file. Two forms are written:
   *   - log        = the run's actual stdout (the live 縦経路 trace) → run.log
   *   - screenshot = the real verify-ui png this orchestrator captures → shot.png
   * The manifest's capturedAt = now (UTC), which is AFTER the run started, so the
   * gate's freshness check passes. When a capture isn't available the manifest is
   * written log-only and the gate honestly blocks (no visual evidence = not done).
   *
   * No-op (returns) when version or repoPath is unknown (scripted / version-less
   * launches) — backward compatible. Wrapped in try/catch: a failure here NEVER
   * breaks the run (原則④ — log it, keep going; the gate then blocks visibly).
   */
  private async writeStepEvidence(ctx: RunContext, stdout: string): Promise<void> {
    const repoPath = this.repoPaths.get(ctx.runId as string);
    const version = this.versions.get(ctx.runId as string);
    if (repoPath === undefined || version === undefined) return; // no-op, backward compatible.

    try {
      const step = ctx.step as string;
      const evidenceDir = join(repoPath, "aidlc-docs", version, "_evidence", step);
      mkdirSync(evidenceDir, { recursive: true });

      // log form: the run's real stdout, written to <evidenceDir>/run.log.
      const logPath = join(evidenceDir, "run.log");
      writeFileSync(logPath, stdout, "utf8");
      const forms: EvidenceFormInput[] = [
        { kind: "log", path: `_evidence/${step}/run.log` },
      ];

      // screenshot form: capture the verify-ui png, then copy it into the _evidence
      // dir as shot.png so the manifest path is self-contained (a human can follow it).
      // Include the form ONLY if the png actually exists — otherwise the manifest is
      // log-only and the gate honestly blocks (no faked visual evidence).
      await this.captureVerifyUi(ctx.runId as string);
      const capturedPng = join(this.shotsDir, `${ctx.runId as string}.png`);
      if (existsSync(capturedPng)) {
        const shotPath = join(evidenceDir, "shot.png");
        copyFileSync(capturedPng, shotPath);
        forms.push({ kind: "screenshot", path: `_evidence/${step}/shot.png` });
      }

      writeEvidenceManifest(repoPath, version, step, forms, toUtcInstant(new Date()));
      logInfo("LiveClaude auto-evidence written", {
        runId: ctx.runId as string,
        step,
        forms: forms.map((f) => f.kind).join(","),
      });
    } catch (err) {
      logError("LiveClaudeOrchestrator: writeStepEvidence failed (run continues; gate may block)", {
        runId: ctx.runId as string,
        step: ctx.step as string,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Generator prompt: real composition when a composer is wired, else the stub. */
  private generatorPrompt(cmd: RunLaunch): string {
    if (!this.composer) return this.buildPrompt(cmd);
    // US-08 / O5: a reconstruction-proposal launch composes a bespoke prompt that
    // asks the AI for an aidlc-reconstruction block (not a normal step generator
    // prompt). content-driven detection at emit time handles the block; this is the
    // belt-and-suspenders that makes the AI actually produce it.
    if (cmd.hearingScope === "reconstruction") {
      // US-08 会話で修正: forward the human's revise feedback (if any) so the AI
      // re-proposes taking it into account.
      return this.composer.composeReconstruction(cmd.repoPath, cmd.reconstructionFeedback);
    }
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
      { ...(cmd.version !== undefined ? { version: cmd.version } : {}) },
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
      ...(cmd.version !== undefined ? { version: cmd.version } : {}),
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
      ...(cmd.version !== undefined ? { version: cmd.version } : {}),
      ...(cmd.worktreeRef !== undefined ? { worktreeRef: cmd.worktreeRef } : {}),
    };
    this.startAttempt(
      buildRunContext(cmd, cmd.newRunId),
      this.generatorPrompt(launchLike),
      cmd.repoPath,
      { ...(cmd.version !== undefined ? { version: cmd.version } : {}) },
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
      ...ISOLATION_ARGS,
      ...(this.maxTurns !== undefined ? ["--max-turns", String(this.maxTurns)] : []),
      ...(this.model !== undefined ? ["--model", this.model] : []),
    ];

    // Resume in the SAME cwd the original run used — Claude sessions are scoped
    // per project directory, so resuming from a different cwd fails with "No
    // conversation found with session ID". Fall back to process.cwd() only if the
    // repoPath was lost (e.g. server restart), where resume is best-effort anyway.
    const cwd = this.repoPaths.get(ctx.runId) ?? process.cwd();
    const child = Bun.spawn([this.claudeBin, ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    this.children.set(ctx.runId, child);

    void this.awaitAndEmit(ctx, child, false);
  }

  /**
   * F-22 self-repair: a structured fence was PRESENT but malformed. Instead of
   * immediately stalling (which a fresh `retry` would just reproduce — same prompt,
   * same broken shape), feed the validator's error back into the SAME session and
   * let the model re-emit a valid block in context. Bounded by MAX_REPAIR_ATTEMPTS;
   * once exhausted — or if the session can't be resumed (no session_id) — emit the
   * retriable `stalled` so the HUMAN takes over (the human retry is never capped /
   * F-21). The repair body is AI-facing and never shown to the human.
   */
  private async repairOrStall(
    ctx: RunContext,
    sessionId: string | null,
    kind: RepairFenceKind,
    detail: string,
  ): Promise<void> {
    const attempts = (this.repairCounts.get(ctx.runId as string) ?? 0) + 1;
    this.repairCounts.set(ctx.runId as string, attempts);

    if (sessionId !== null && attempts <= MAX_REPAIR_ATTEMPTS) {
      logInfo(
        "LiveClaudeOrchestrator: malformed fence — self-repair turn (feeding schema error back into the session, NOT stalling yet)",
        { runId: ctx.runId as string, fence: kind, attempt: attempts, max: MAX_REPAIR_ATTEMPTS, detail },
      );
      this.startResumeTurn(ctx, sessionId, buildRepairInstruction(kind, detail));
      return;
    }

    // Budget exhausted, or the run has no session to resume → hand to the human.
    logError(
      "LiveClaudeOrchestrator: self-repair exhausted (or no session) — stalling for human retry",
      { runId: ctx.runId as string, fence: kind, attempts, resumable: sessionId !== null },
    );
    await this.emit(ctx, malformedResultEvent(ctx.runId));
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
    opts: { readonly completeness?: boolean; readonly version?: string } = {},
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
      // Isolate from the target repo's ambient Claude context (CLAUDE.md / hooks /
      // auto-memory) so the composed prompt is the only instruction (F-10).
      ...ISOLATION_ARGS,
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
    // Remember the cwd this run used so a later resume turn resumes in the same
    // project directory (Claude sessions are cwd-scoped — see repoPaths above).
    this.repoPaths.set(ctx.runId, repoPath);
    // US-04: remember the cycle version so writeStepEvidence can locate the step's
    // _evidence dir after the run drains. Absent (scripted/version-less) → skip.
    if (opts.version !== undefined) this.versions.set(ctx.runId, opts.version);

    // Diagnostics (F-8/実機 slow-run 調査): record what was actually launched so a
    // slow/failed run is explainable — prompt size, model, and the wall-clock cap.
    logInfo("LiveClaude run launched", {
      runId: ctx.runId as string,
      step: ctx.step as string,
      pid: child.pid,
      promptChars: prompt.length,
      model: this.model ?? "(claude CLI default)",
      timeoutMs: this.timeoutMs,
    });

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
    const startedAt = Date.now();
    let timedOut = false;
    let hardKillTimer: ReturnType<typeof setTimeout> | undefined;
    // timeoutMs <= 0 = DISABLED: no wall-clock kill, the run only ends on real exit
    // (the human can still cancel/retry from the Inbox). Otherwise arm the backstop.
    const timer =
      this.timeoutMs > 0
        ? setTimeout(() => {
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
          }, this.timeoutMs)
        : undefined;

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
      // Diagnostics: record how the child actually terminated so "slow run" can be
      // attributed — exited cleanly (exitCode) vs killed by the wall-clock timeout
      // (timedOut), how long it took, and whether it produced any output at all
      // (stdoutChars=0 + timedOut ⇒ claude hung/never produced output).
      logInfo("LiveClaude run finished", {
        runId: ctx.runId as string,
        step: ctx.step as string,
        timedOut,
        exitCode,
        durationMs: Date.now() - startedAt,
        stdoutChars: stdout.length,
        stderrChars: stderr.length,
      });
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
      } else if (this.sessionRepo === undefined) {
        // A session_id WAS captured but there is nowhere to persist it — the
        // composition root forgot to wire sessionRepo. Without it the human's
        // answer can't `--resume` and the hearing stalls ("sessionId missing").
        // This was a real S10 実機 wiring gap; make it loud, never a silent no-op (原則④).
        logError("LiveClaudeOrchestrator: sessionRepo not wired — session_id captured but NOT persisted; resume will fail. Wire sessionRepo in the composition root.", {
          runId: ctx.runId as string,
        });
      } else {
        // Unit-04: persist the captured session_id so a later resume turn can
        // pass `--resume <sessionId>`. Writing is best-effort: a failure here
        // does NOT abort the run — we log it and continue (the run's result is
        // still valid; only the resume path becomes unavailable for this run).
        try {
          this.sessionRepo.save(ctx.runId, sessionId);
        } catch (saveErr) {
          logError("LiveClaudeOrchestrator: failed to persist session_id (resume disabled for this run)", saveErr);
        }
      }

      const text = extractResultText(stdout);
      if (text === undefined || text.trim().length === 0) {
        throw new Error("claude produced no assistant result text");
      }

      // US-08 / O5: a reconstruction run emits an ```aidlc-reconstruction``` block.
      // Present → ReconstructionProposalEmitted + RunStateChanged(done), mirroring
      // the scripted adapter (done, NOT ResultEmitted — no visual_review card and no
      // re-trigger of onS1Confirmed). Absent (ok null) → fall through to the normal
      // aidlc-result/question paths.
      const reconParseResult = parseReconstructionBlock(text);
      if (!reconParseResult.ok) {
        // S10 F-13(recon): the ```aidlc-reconstruction``` fence WAS present but its
        // JSON/schema is invalid. Do NOT fall through to the legacy raw-text dump
        // (that leaks the raw envelope to the human / 契約①). F-22: try an in-context
        // self-repair turn first; only stall once the repair budget is exhausted.
        await this.repairOrStall(
          ctx,
          sessionId,
          "aidlc-reconstruction",
          reconParseResult.error.detail,
        );
        return;
      } else if (reconParseResult.value !== null) {
        await this.emit(ctx, {
          type: "ReconstructionProposalEmitted",
          runId: ctx.runId,
          proposal: reconParseResult.value,
        });
        await this.emit(ctx, { type: "RunStateChanged", runId: ctx.runId, to: "done" });
        return;
      }

      // BU-2: FIRST try aidlc-result envelope (§C7.4). Present → drive events
      // from the envelope (questions → QuestionRaised; needs_human → ResultEmitted;
      // done/stalled → RunStateChanged). Parse error → log (原則④) + fall through
      // to the legacy path below (safe fallback: never silently drop output).
      // Absent (ok null) → proceed to the existing paths below, unchanged.
      const resultParseResult = parseAidlcResultBlock(text);
      if (!resultParseResult.ok) {
        // S10 F-13: the fence WAS present but its JSON/schema is malformed. This is
        // NOT "no envelope" (that is ok(null), handled below) — it is a broken run.
        // Do NOT fall through to the legacy raw-text dump: that would leak internal
        // JSON/paths to the human (契約① 違反) and silently drop the envelope's
        // questions. F-22: try an in-context self-repair turn first; stall only once
        // the repair budget is exhausted. 原則④: visible, not silent.
        await this.repairOrStall(
          ctx,
          sessionId,
          "aidlc-result",
          resultParseResult.error.detail,
        );
        return;
      } else if (resultParseResult.value !== null) {
        // Envelope found and validated → emit events derived from it. For a
        // needs_human review, read the artifact md bodies so the review shows the
        // actual brief/US content, not just file links (US-02).
        const result = resultParseResult.value;
        // F-15: done も needs_human も等しくレビュー可能な成果として扱う(ゲートはステップ設定が
        // 決める)。どちらも成果本文/視覚証拠を読み込み、レビューに本文を描画する(US-02)。
        const producesReview =
          result.status === "needs_human" || result.status === "done";
        const contentBlocks = producesReview
          ? this.readArtifactBlocks(ctx.runId as string, result.artifacts)
          : [];
        // 視覚デザイン証拠 (S3 等): render the AI's .html screens to images so the
        // design surfaces in the review gallery — the human judges the UI THROUGH the
        // platform's browser as images, never by opening files (原則#1 視覚確認 / 契約①).
        const designBlocks = producesReview
          ? await this.captureDesignBlocks(ctx.runId as string, result.artifacts)
          : [];
        const events = aidlcResultToEvents(ctx.runId, result, [
          ...contentBlocks,
          ...designBlocks,
        ]);
        // US-04: when this envelope yields a REVIEWABLE result, write the step's auto
        // evidence manifest BEFORE emitting so the manifest exists when the app-layer
        // gate runs on the emission (gate reads _evidence/<step>/manifest.json).
        if (producesReview) {
          await this.writeStepEvidence(ctx, stdout);
        }
        for (const event of events) {
          await this.emit(ctx, event);
        }
        return;
      }

      // Unit-03: check for an aidlc-question block. Present → emit QuestionRaised
      // cards (one per question). Absent → fall through to the existing
      // ResultEmitted→visual_review path.
      const questionParseResult = parseQuestionBlock(text);
      if (!questionParseResult.ok) {
        // S10 F-13(question): the ```aidlc-question``` fence WAS present but malformed —
        // same class as the aidlc-result / reconstruction cases above (T20: fix the whole
        // class, not one instance). Falling through would dump the raw block to the human
        // (契約①) and silently drop the questions. F-22: try an in-context self-repair
        // turn first; stall only once the repair budget is exhausted.
        await this.repairOrStall(
          ctx,
          sessionId,
          "aidlc-question",
          questionParseResult.error.detail,
        );
        return;
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
      // F-23: the model may have embedded `![](path)` image links in this prose
      // (instead of aidlc-result artifacts[]). Convert them to real served
      // screenshot blocks and strip the paths from the summary so the gallery
      // renders and no file path leaks (契約①).
      const { blocks: mdImageBlocks, cleanedText } = this.legacyImageBlocks(
        ctx.runId as string,
        text,
      );
      const blocks: ReviewBlock[] = [
        { type: "summary", title: `${ctx.step as string} (live Claude)` as Text, body: cleanedText as Text },
        ...(shotBlock ? [shotBlock] : []),
        ...mdImageBlocks,
      ];
      // US-04: this legacy path always produces a reviewable ResultEmitted — write
      // the step's auto evidence manifest BEFORE emitting so the manifest is on disk
      // when the app-layer gate runs on the emission.
      await this.writeStepEvidence(ctx, stdout);
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
      if (timer !== undefined) clearTimeout(timer);
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

  /**
   * US-02: read each `.md` artifact's content (resolved against the run's repoPath)
   * into a `summary` ReviewBlock so the review renders the actual brief/US body —
   * the human reviews without opening files (SCR-03 / 原則③). Best-effort: a missing
   * repoPath (server restart) or unreadable file is skipped + logged, never thrown
   * (the review still surfaces via completeness/artifacts).
   */
  private readArtifactBlocks(runId: string, artifacts: readonly string[]): ReviewBlock[] {
    const repoPath = this.repoPaths.get(runId);
    if (repoPath === undefined) return [];
    const blocks: ReviewBlock[] = [];
    for (const rel of artifacts) {
      if (!rel.endsWith(".md")) continue;
      const abs = isAbsolute(rel) ? rel : join(repoPath, rel);
      try {
        if (!existsSync(abs)) continue;
        const body = readFileSync(abs, "utf8");
        if (body.trim().length === 0) continue;
        blocks.push({ type: "summary", title: artifactBlockTitle(body, rel) as Text, body: body as Text });
      } catch (err) {
        logError("LiveClaudeOrchestrator.readArtifactBlocks: read failed", {
          artifact: rel,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return blocks;
  }

  /**
   * 視覚デザイン証拠 (S3 等): the platform renders the AI's design screens THROUGH a
   * browser and shows them to the human as images — the human never opens files
   * (契約①), so visual judgement (原則#1) actually happens in the review. For each
   * `.html` screen artifact, capture a full-page png with the SAME Playwright capturer
   * used for verify-ui (file:// URL), and emit a `screenshot` block so 2+ screens land
   * in the review gallery. Best-effort: missing capturer / repoPath / file, or a
   * capture failure, is logged + skipped — never thrown (the md review still stands).
   */
  private async captureDesignBlocks(
    runId: string,
    artifacts: readonly string[],
  ): Promise<ReviewBlock[]> {
    if (this.capturer === undefined) return [];
    const repoPath = this.repoPaths.get(runId);
    if (repoPath === undefined) return [];
    const htmls = artifacts.filter((a) => a.endsWith(".html"));
    const blocks: ReviewBlock[] = [];
    let i = 0;
    for (const rel of htmls) {
      const abs = isAbsolute(rel) ? rel : join(repoPath, rel);
      if (!existsSync(abs)) continue;
      const file = `${runId}-design-${i++}.png`;
      const outPath = join(this.shotsDir, file);
      let result: CaptureResult;
      try {
        result = await this.capturer.capture({ url: `file://${abs}`, outPath });
      } catch (err) {
        result = { ok: false as const, reason: err instanceof Error ? err.message : String(err) };
      }
      if (!result.ok) {
        logError("LiveClaudeOrchestrator.captureDesignBlocks: capture failed", {
          artifact: rel,
          reason: result.reason,
        });
        continue;
      }
      blocks.push({
        type: "screenshot",
        src: `${this.shotUrlBase}/${file}` as Text,
        caption: screenLabel(rel) as Text,
      });
    }
    return blocks;
  }

  /**
   * F-23 safety net: the model presented screens by embedding `![alt](/abs/scr.png)`
   * Markdown image links in its prose (instead of the aidlc-result artifacts[] path),
   * so the review fell to the legacy summary and showed raw, unloadable file paths.
   * Convert each ref pointing to an existing image UNDER the run's repo into a real
   * served screenshot block (copy into shotsDir → served URL), and return the prose
   * with those refs de-pathified. Refs that don't resolve under the repo are left in
   * place untouched (no copy, no leak-by-serving an arbitrary path). Best-effort: any
   * failure on a single ref skips just that one.
   */
  private legacyImageBlocks(
    runId: string,
    text: string,
  ): { blocks: ReviewBlock[]; cleanedText: string } {
    const repoPath = this.repoPaths.get(runId);
    if (repoPath === undefined) return { blocks: [], cleanedText: text };
    // realpath both sides so the macOS /tmp → /private/tmp symlink (and any other)
    // can't make an in-repo file look out-of-repo. repoPath always exists here.
    let repoRoot: string;
    try {
      repoRoot = realpathSync(repoPath);
    } catch {
      return { blocks: [], cleanedText: text };
    }
    const refs = parseMarkdownImageRefs(text);
    const blocks: ReviewBlock[] = [];
    const converted: MarkdownImageRef[] = [];
    let i = 0;
    for (const ref of refs) {
      const raw = ref.path.replace(/^file:\/\//, "");
      const candidate = isAbsolute(raw) ? raw : join(repoPath, raw);
      if (!existsSync(candidate)) continue;
      // Resolve symlinks before the containment check (security: only serve files
      // that truly live UNDER the run's repo, never an arbitrary path the model names).
      let abs: string;
      try {
        abs = realpathSync(candidate);
      } catch {
        continue;
      }
      if (abs !== repoRoot && !abs.startsWith(repoRoot + "/")) continue;
      const ext = (abs.match(IMAGE_EXT_RE)?.[0] ?? ".png").toLowerCase();
      const file = `${runId}-md-${i++}${ext}`;
      try {
        copyFileSync(abs, join(this.shotsDir, file));
      } catch (err) {
        logError("LiveClaudeOrchestrator.legacyImageBlocks: copy failed", {
          artifact: ref.path,
          reason: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      const caption = ref.alt.trim().length > 0 ? ref.alt.trim() : screenLabel(abs);
      blocks.push({
        type: "screenshot",
        src: `${this.shotUrlBase}/${file}` as Text,
        caption: caption as Text,
      });
      converted.push(ref);
    }
    return { blocks, cleanedText: stripImageRefs(text, converted) };
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

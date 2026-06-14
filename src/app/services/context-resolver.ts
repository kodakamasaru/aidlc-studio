// context-resolver — BU-1 構造化コンテキスト resolver (US-01 AC / S5 BU-1 / §C7.1-C7.3)
//
// BACKWARD COMPAT: resolveContextPaths + stepArtifactDir remain intact (used by
// cycle-service, engine-service, and all existing tests).
//
// NEW: composeStructuredContext — builds the §C7.1 named, ordered sections
// (3=brief, 4=requirements, 5=prior artifacts, 6=decisions/ledger, 7=dialog state,
// 8=output contract, 9=backtrack feedback) from 3 sources:
//   • docs (Fs port) — sections 3 / 4 / 5
//   • file (ledger.yml via Fs port) — section 6
//   • DB (repos port) — sections 7 (answers) / 8 (StepContracts) / 9 (backtrack) [optional]
//
// Sections 1 (role/identity) and 2 (skill body) are handled by PromptComposer.
//
// Key invariants (§C7.3 + BT-01):
//   • Section 3 (brief) is ALWAYS included — not displaced by prior artifacts.
//   • Per-step granularity table: each step declares which priors get index vs detail.
//   • Variable-step resilience: resolves from actual done phases, not fixed S1-S12.
//   • Missing sections are visible markers (原則④), never silent.
//   • Degradation: directly-prior = detail, older = index; invariant/requirements/
//     decisions sections are NOT degraded.
//   • Section 9 (backtrack feedback): present only when a visual_review was rejected
//     with a reason in this cycle — injected after section 4 (requirements) so the
//     AI sees the rejection reason prominently before prior artifacts. Absent when
//     no rejection exists (normal first-run launch). 原則④: if rejected but reason
//     is missing (should not happen given domain invariants), emit visible marker.
import { join } from "node:path";
import type { Cycle } from "../../domain/cycle/cycle";
import type { Step } from "../../domain/shared/vocab";
import type { Fs } from "../ports/sys";
import type { QuestionRepo, CycleRepo, FactRepo } from "../ports/repos";
import { effectiveRevision } from "../../domain/facts/facts";
import type { CycleId, RunId } from "../../domain/shared/ids";

// ── Public types ─────────────────────────────────────────────────────────────

export interface ResolveContextInput {
  /** The cycle currently being executed (contains phases with state + step + order). */
  readonly cycle: Cycle;
  /** The step being launched (current step — excluded from prior context). */
  readonly step: Step;
  /** Absolute repo path of the target project (aidlc-docs lives here). */
  readonly repoPath: string;
  /**
   * When true, apply token-threshold graceful degradation:
   *   - directly-prior step (order = currentOrder − 1): index + declared main artifacts
   *   - older steps: index.md only
   * Default false = all done steps get index + declared dep artifacts.
   */
  readonly applyDegradation?: boolean;
}

/**
 * One named section of the structured context (§C7.1).
 * `content` is the rendered text. `missing` is true when a required section
 * could not be sourced (visible marker present in content / 原則④).
 */
export interface ContextSection {
  readonly id: string;
  readonly label: string;
  readonly content: string;
  readonly missing?: boolean;
}

/**
 * Structured context produced by composeStructuredContext.
 * Sections 1+2 are composed by PromptComposer; this covers 3-9.
 */
export interface StructuredContext {
  /** Section 3: brief body (always present). */
  readonly productInvariant: ContextSection;
  /** Section 4: confirmed requirements (S1 index). Present when S1 is done. */
  readonly requirements?: ContextSection;
  /**
   * Section 9: backtrack feedback — the rejection reason from the most recent
   * visual_review rejection in this cycle. Present only on backtrack-relaunches;
   * absent on normal first-run launches. Rendered immediately after section 4
   * (requirements) so the AI sees WHY it was rejected before any prior artifacts.
   */
  readonly backtrackFeedback?: ContextSection;
  /** Section 5: prior-step artifacts per granularity table. Empty when no prior. */
  readonly priorArtifacts?: ContextSection;
  /** Section 6: decisions + ledger carried items. */
  readonly decisionsLedger?: ContextSection;
  /** Section 7: confirmed Q&A answers (dialog state from DB). */
  readonly dialogState?: ContextSection;
  /** Section 8: output contract for this step. */
  readonly outputContract?: ContextSection;
}

/** Optional DB deps for sections 7+8+9. Pass to enable DB-sourced sections. */
export interface StructuredContextDeps {
  readonly fs: Fs;
  /** For section 7: confirmed answers from current run/cycle. */
  readonly questions?: QuestionRepo;
  /** For section 8: cycle state to look up step contracts. */
  readonly cycles?: CycleRepo;
  /**
   * For section 9 (backtrack feedback): facts from the current cycle, used to
   * find the rejection reason on the most recent visual_review reject.
   * When absent, section 9 is skipped (backward compat).
   */
  readonly facts?: FactRepo;
  /** For section 7: the run being launched (to filter answered questions). */
  readonly runId?: RunId;
  /** For section 8: the cycle id. */
  readonly cycleId?: CycleId;
}

/** Input to composeStructuredContext. */
export interface StructuredContextInput {
  readonly cycle: Cycle;
  readonly step: Step;
  readonly repoPath: string;
  readonly applyDegradation?: boolean;
}

// ── Granularity depth map ────────────────────────────────────────────────────

/**
 * Depth kind for a prior step's artifacts:
 *   "index" = only index.md
 *   "detail" = index.md + declared direct-dep artifact files
 */
type DepthKind = "index" | "detail";

/**
 * Per-step granularity table (§C7.3 / BU-1 / S5 backtrack-context-io-units.md).
 *
 * Key = current step. Value = map of prior-step-id → { depth, artifacts }.
 *   depth "detail" = include artifact files beyond index.md.
 *   artifacts = specific filenames to include (relative to that prior step's dir).
 *
 * Adding a new step's direct dependency = 1 entry in this map. No per-step if-branches.
 */
const STEP_GRANULARITY: Readonly<
  Record<
    string,
    Readonly<Record<string, { readonly depth: DepthKind; readonly artifacts: readonly string[] }>>
  >
> = {
  // S2 (wireframe): S1 index is sufficient
  S2: { S1: { depth: "index", artifacts: [] } },
  // S3 (UI design): S2 index + S1 index
  S3: { S1: { depth: "index", artifacts: [] }, S2: { depth: "index", artifacts: [] } },
  // S4 (tech spec): S3 index + S1 requirements
  S4: { S1: { depth: "index", artifacts: [] }, S3: { depth: "index", artifacts: [] } },
  // S5 (work units): S4 full text + S3 UI design
  S5: { S3: { depth: "index", artifacts: [] }, S4: { depth: "index", artifacts: [] } },
  // S6 (domain model): S5 unit DETAIL files + S1 requirements
  // Per granularity table: "S5 unit 詳細" — include the work-unit detail files.
  S6: {
    S1: { depth: "index", artifacts: [] },
    S5: {
      depth: "detail",
      artifacts: [
        "backtrack-context-io-units.md",
        "unit-01-wire-contract.md",
        "unit-02-prior-context-injection.md",
        "unit-03-question-emit-session-parse.md",
        "unit-04-resume-turn.md",
        "unit-05-markdown-render.md",
        "unit-06-conversation-ui.md",
        "unit-07-variable-step-progress.md",
      ],
    },
  },
  // S7 (domain code): S6 aggregate detail files
  S7: {
    S6: {
      depth: "detail",
      artifacts: ["cycle-run-aggregate.md", "question-aggregate.md"],
    },
  },
  // S8 (integration): S3 mock paths (scr-NN.md) + S5 + S6 + S7 detail
  // S7 outputs a flat file under the version dir (../s7-domain-code.md relative to s7/).
  S8: {
    S3: {
      depth: "detail",
      artifacts: [
        "scr-01-inbox.md",
        "scr-02-conversation-thread.md",
        "scr-03-review-detail.md",
        "scr-04-step-config-readback.md",
        "scr-05-cycle-progress.md",
        "scr-06-step-spec.md",
      ],
    },
    S5: { depth: "index", artifacts: [] },
    S6: {
      depth: "detail",
      artifacts: ["cycle-run-aggregate.md", "question-aggregate.md"],
    },
    S7: { depth: "detail", artifacts: ["../s7-domain-code.md"] },
  },
  // S9 (scenario validation): S3 mocks (path refs) + S1 US + S8 result
  S9: {
    S1: { depth: "index", artifacts: [] },
    S3: {
      depth: "detail",
      artifacts: [
        "scr-01-inbox.md",
        "scr-02-conversation-thread.md",
        "scr-03-review-detail.md",
        "scr-04-step-config-readback.md",
        "scr-05-cycle-progress.md",
        "scr-06-step-spec.md",
      ],
    },
    S8: { depth: "index", artifacts: [] },
  },
  // S10 (human acceptance): S9 results + S1 requirements
  S10: {
    S1: { depth: "index", artifacts: [] },
    S9: { depth: "index", artifacts: [] },
  },
  // S11 (retrospective): all done index + ledger (ledger injected via section 6)
  S11: {},
  // S12 (workflow improvement): S11 retrospective
  S12: { S11: { depth: "index", artifacts: [] } },
} as const;

/**
 * Legacy STEP_DIRECT_DEPS — kept for backward compat with resolveContextPaths.
 * Mirrors the artifact lists from STEP_GRANULARITY.
 */
const STEP_DIRECT_DEPS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  S2: { S1: [] },
  S3: { S1: [], S2: [] },
  S4: { S1: [], S3: [] },
  S5: { S3: [], S4: [] },
  S6: {
    S1: [],
    S5: [
      "backtrack-context-io-units.md",
      "unit-01-wire-contract.md",
      "unit-02-prior-context-injection.md",
      "unit-03-question-emit-session-parse.md",
      "unit-04-resume-turn.md",
      "unit-05-markdown-render.md",
      "unit-06-conversation-ui.md",
      "unit-07-variable-step-progress.md",
    ],
  },
  S7: { S6: ["cycle-run-aggregate.md", "question-aggregate.md"] },
  S8: {
    S5: [],
    S7: ["../s7-domain-code.md"],
    S3: [
      "scr-01-inbox.md",
      "scr-02-conversation-thread.md",
      "scr-03-review-detail.md",
      "scr-04-step-config-readback.md",
      "scr-05-cycle-progress.md",
      "scr-06-step-spec.md",
    ],
  },
  S9: {
    S1: [],
    S3: [
      "scr-01-inbox.md",
      "scr-02-conversation-thread.md",
      "scr-03-review-detail.md",
      "scr-04-step-config-readback.md",
      "scr-05-cycle-progress.md",
      "scr-06-step-spec.md",
    ],
    S8: [],
  },
  S10: { S1: [], S9: [] },
  S11: {},
  S12: { S11: [] },
} as const;

// ── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Canonical artifact directory for a step within the cycle's aidlc-docs version dir.
 * Convention: stepId "SN" → lowercase "sN" directory segment.
 * e.g. stepArtifactDir("/repo", "v0.0.4", "S1") → "/repo/aidlc-docs/v0.0.4/s1"
 */
export function stepArtifactDir(repoPath: string, version: string, stepId: string): string {
  const dir = stepId.toLowerCase(); // "S1" → "s1", "S12" → "s12"
  return join(repoPath, "aidlc-docs", version, dir);
}

/** index.md path for a given step within the cycle's aidlc-docs version dir. */
function indexPath(repoPath: string, version: string, stepId: string): string {
  return join(stepArtifactDir(repoPath, version, stepId), "index.md");
}

/**
 * Direct-dependency artifact paths that the current step declares for a specific prior step.
 * Returns absolute paths (not relative) to the artifact files beyond index.md.
 * Uses the legacy STEP_DIRECT_DEPS map for backward compat.
 */
function directDepPaths(
  currentStepId: string,
  priorStepId: string,
  repoPath: string,
  version: string,
): readonly string[] {
  const currentDeps = STEP_DIRECT_DEPS[currentStepId];
  if (!currentDeps) return [];
  const relPaths = currentDeps[priorStepId];
  if (!relPaths || relPaths.length === 0) return [];

  const dir = stepArtifactDir(repoPath, version, priorStepId);
  return relPaths.map((rel) => join(dir, rel));
}

// ── resolveContextPaths (backward compat) ────────────────────────────────────

/**
 * Resolve context paths for PromptComposer at step launch time.
 *
 * Returns a list of absolute paths to inject as `contextPaths` into ComposeInput.
 * - Empty list → no prior context; caller should pass undefined / use composer default (brief.md).
 * - Non-empty → composer reads each path and renders the context layer; missing files surface
 *   as visible markers (「※ 前段文脈が見つかりません(path)」) — never silently dropped (原則④).
 *
 * Ordering: by phase.order ascending (oldest context first, matching reading order).
 *
 * NOTE: This function is preserved for backward compatibility. New code should use
 * composeStructuredContext() which applies the per-step granularity table (BU-1 / §C7.3).
 */
export function resolveContextPaths(input: ResolveContextInput): readonly string[] {
  const { cycle, step, repoPath, applyDegradation = false } = input;
  const version = cycle.version as string;
  const currentStepId = step as string;

  // Find the current step's phase order to identify "prior" phases.
  const currentPhase = cycle.phases.find((p) => (p.step as string) === currentStepId);
  const currentOrder = currentPhase?.order ?? Infinity;

  // Collect done (or review-pending) prior phases, sorted by order ascending.
  // "review" state means the generator run completed — content is available.
  const donePriorPhases = cycle.phases
    .filter(
      (p) =>
        (p.state === "done" || p.state === "review") &&
        p.order < currentOrder,
    )
    .sort((a, b) => a.order - b.order);

  if (donePriorPhases.length === 0) return [];

  // The directly-prior phase (order = currentOrder - 1), used for degradation rule.
  const directlyPriorOrder = currentOrder - 1;

  const seen = new Set<string>();
  const paths: string[] = [];

  const add = (p: string): void => {
    if (!seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  };

  for (const phase of donePriorPhases) {
    const priorStepId = phase.step as string;
    const isDirectlyPrior = phase.order === directlyPriorOrder;

    // Always include the step's index.md (primary prior-context for every done step).
    add(indexPath(repoPath, version, priorStepId));

    // Include direct-dependency artifact bodies from the declarative map.
    // Under degradation mode, only the directly-prior step gets its extra artifacts;
    // older steps are constrained to index.md only (token-threshold rule / S4 C5/D-04).
    const includeDeps = !applyDegradation || isDirectlyPrior;
    if (includeDeps) {
      for (const p of directDepPaths(currentStepId, priorStepId, repoPath, version)) {
        add(p);
      }
    }
  }

  return paths;
}

// ── composeStructuredContext (BU-1 §C7.1-C7.3) ──────────────────────────────

/** Where the cycle's brief lives, relative to a project repo root. */
export function briefPath(repoPath: string): string {
  return join(repoPath, "aidlc-docs", "brief.md");
}

/** Where the cycle's ledger lives, relative to a project repo root + version. */
export function ledgerPath(repoPath: string, version: string): string {
  return join(repoPath, "aidlc-docs", version, "ledger.yml");
}

/** Read file content via Fs, returning a visible-marker string when missing. */
function readOrMark(fs: Fs, path: string, label: string): { content: string; missing: boolean } {
  const raw = fs.read(path);
  if (raw !== undefined && raw.trim().length > 0) {
    return { content: `【${label}】\n${raw.trim()}`, missing: false };
  }
  return {
    content: `【${label}】※ 前段文脈が見つかりません(${path})`,
    missing: true,
  };
}

/**
 * Compute absolute paths for a prior step per the granularity table.
 * Returns index.md always; adds detail artifacts when depth="detail" and
 * degradation allows it (directly-prior or no degradation).
 */
function priorStepPathsFromGranularity(
  currentStepId: string,
  priorStepId: string,
  repoPath: string,
  version: string,
  applyDegradation: boolean,
  isDirectlyPrior: boolean,
): readonly string[] {
  const paths: string[] = [];
  paths.push(indexPath(repoPath, version, priorStepId));

  // Under degradation: only directly-prior step gets detail; older get index only.
  const canIncludeDetail = !applyDegradation || isDirectlyPrior;
  if (!canIncludeDetail) return paths;

  // Check the granularity table for detail artifacts.
  const granMap = STEP_GRANULARITY[currentStepId];
  const grain = granMap?.[priorStepId];
  if (grain?.depth === "detail" && grain.artifacts.length > 0) {
    const dir = stepArtifactDir(repoPath, version, priorStepId);
    for (const rel of grain.artifacts) {
      paths.push(join(dir, rel));
    }
  }

  return paths;
}

/**
 * BU-1: Build §C7.1 named, ordered sections from 3 sources (DB + docs + file).
 *
 * Returns a StructuredContext with sections 3-8. Sections 1+2 are handled by
 * PromptComposer. All file reads go through the Fs port (deps.fs). DB access
 * goes through deps.questions (section 7) / deps.cycles (section 8) [optional].
 *
 * Invariants:
 *   • Section 3 (brief) is ALWAYS returned — never dropped by prior artifacts.
 *   • Sections 4/5/6/7/8 are conditional: each is undefined when no source is available.
 *   • Missing files surface as visible markers inside the section content (原則④).
 *   • Degradation (§C7.3): older prior steps get index only; directly-prior gets detail.
 *   • No per-step if-branches — all step-specific granularity is in STEP_GRANULARITY.
 */
export function composeStructuredContext(
  input: StructuredContextInput,
  deps: StructuredContextDeps,
): StructuredContext {
  const { cycle, step, repoPath, applyDegradation = false } = input;
  const { fs } = deps;
  const version = cycle.version as string;
  const currentStepId = step as string;

  // ── Section 3: プロダクト不変 (brief — ALWAYS present / BT-01 ②) ─────────
  const bPath = briefPath(repoPath);
  const briefResult = readOrMark(fs, bPath, "brief.md");
  const productInvariant: ContextSection = {
    id: "section-3-product-invariant",
    label: "プロダクト不変(brief)",
    content: briefResult.content,
    ...(briefResult.missing ? { missing: true } : {}),
  };

  // ── Section 4: 要件(S1 index — after S1 is done) ──────────────────────────
  // Only present when S1 exists in the cycle AND is done/review.
  const s1Phase = cycle.phases.find(
    (p) => (p.step as string) === "S1" && (p.state === "done" || p.state === "review"),
  );
  let requirements: ContextSection | undefined;
  if (s1Phase) {
    const s1IndexPath = indexPath(repoPath, version, "S1");
    const s1Result = readOrMark(fs, s1IndexPath, "s1/index.md");
    requirements = {
      id: "section-4-requirements",
      label: "このサイクルの要件(S1 確定 US)",
      content: s1Result.content,
      ...(s1Result.missing ? { missing: true } : {}),
    };
  }

  // ── Section 9: 差し戻しフィードバック(backtrack feedback) ────────────────
  // Present only when a visual_review was rejected with a reason in this cycle.
  // Injected here (after section 4) so the AI sees WHY before reading prior artifacts.
  // Source: questions.listByCycle → visual_review+answered → facts.listByCycle → reject±reason.
  // We pick the most recent rejection by confirmedAt (latest backtrack = most relevant).
  // Design: query by cycleId (not runId) so history across runs is captured; the
  // human-provided reason is what matters regardless of which run raised the question.
  //
  // Logic:
  //  1. Collect all answered visual_review question IDs for this cycle.
  //  2. Find facts for those question IDs. Keep only facts with verdict=reject.
  //  3. If any reject fact has a reason → emit section 9 with the latest reason.
  //  4. If reject fact exists but has NO reason (should not happen per domain
  //     invariant INV-4, but guard defensively) → emit visible marker (原則④).
  //  5. No reject facts at all (approve, or no visual_review) → section 9 absent.
  let backtrackFeedback: ContextSection | undefined;
  if (deps.questions && deps.facts && deps.cycleId) {
    const cycleQuestions = deps.questions.listByCycle(deps.cycleId);
    const answeredReviewIds = new Set(
      cycleQuestions
        .filter((q) => q.kind === "visual_review" && q.state === "answered")
        .map((q) => q.id as string),
    );

    if (answeredReviewIds.size > 0) {
      const cycleFacts = deps.facts.listByCycle(deps.cycleId);
      // Narrow to facts for answered visual_review questions with verdict=reject.
      const factsWithRevs = cycleFacts
        .filter((f) => answeredReviewIds.has(f.questionId as string))
        .map((f) => ({ fact: f, rev: effectiveRevision(f) }))
        .filter(({ rev }) => rev.verdict === "reject");

      if (factsWithRevs.length > 0) {
        // Partition: reject+reason (normal backtrack) vs reject+no-reason (defensive).
        const withReason = factsWithRevs
          .filter(({ rev }) => rev.reason !== undefined && rev.reason.trim().length > 0)
          .sort((a, b) =>
            // Descending by confirmedAt (ISO string lex = chronological order).
            b.fact.confirmedAt > a.fact.confirmedAt ? 1 : b.fact.confirmedAt < a.fact.confirmedAt ? -1 : 0,
          );

        const latestReject = withReason.length > 0 ? withReason[0] : undefined;
        if (latestReject !== undefined) {
          // Normal path: most recent rejection with reason.
          const rev = latestReject.rev;
          const q = cycleQuestions.find(
            (q) => (q.id as string) === (latestReject.fact.questionId as string),
          );
          const stepCtx =
            q?.payload.kind === "visual_review"
              ? `このステップ(${currentStepId})の前回成果物`
              : "前回の成果物";

          backtrackFeedback = {
            id: "section-9-backtrack-feedback",
            label: "【重要】差し戻し理由(前回却下の理由を必ず反映せよ)",
            content: [
              "【差し戻し理由】",
              `${stepCtx}は人間レビューで却下されました。以下の理由を踏まえて今回の成果物を修正せよ。`,
              "",
              `却下理由: ${rev.reason as string}`,
            ].join("\n"),
          };
        } else {
          // Defensive: reject facts exist but all lack a reason (domain invariant violation).
          // Emit visible marker so the AI knows a rejection occurred (原則④).
          backtrackFeedback = {
            id: "section-9-backtrack-feedback",
            label: "【重要】差し戻し理由(前回却下の理由を必ず反映せよ)",
            content:
              "【差し戻し理由】※ 差し戻し記録が存在しますが却下理由が取得できませんでした。慎重に前回との差異を分析せよ。",
            missing: true,
          };
        }
      }
      // No reject facts → all answered visual_reviews were approved → section 9 absent.
    }
  }

  // ── Section 5: 前段の成果物(per-step granularity table / §C7.3) ───────────
  const currentPhase = cycle.phases.find((p) => (p.step as string) === currentStepId);
  const currentOrder = currentPhase?.order ?? Infinity;

  const donePriorPhases = cycle.phases
    .filter(
      (p) =>
        (p.state === "done" || p.state === "review") &&
        p.order < currentOrder,
    )
    .sort((a, b) => a.order - b.order);

  let priorArtifacts: ContextSection | undefined;
  if (donePriorPhases.length > 0) {
    const directlyPriorOrder = currentOrder - 1;
    const seen = new Set<string>();
    const pathParts: string[] = [];

    for (const phase of donePriorPhases) {
      const priorStepId = phase.step as string;
      const isDirectlyPrior = phase.order === directlyPriorOrder;

      const stepPaths = priorStepPathsFromGranularity(
        currentStepId,
        priorStepId,
        repoPath,
        version,
        applyDegradation,
        isDirectlyPrior,
      );

      for (const p of stepPaths) {
        if (seen.has(p)) continue;
        seen.add(p);
        // Use last 2 path segments as label (e.g. "s5/index.md" or "s5/unit-01.md")
        const label = p.split("/").slice(-2).join("/");
        const r = readOrMark(fs, p, label);
        pathParts.push(r.content);
      }
    }

    if (pathParts.length > 0) {
      priorArtifacts = {
        id: "section-5-prior-artifacts",
        label: "前段の成果物",
        content: pathParts.join("\n\n"),
      };
    }
  }

  // ── Section 6: 決定・引き継ぎ(ledger + confirmed D-NN) ────────────────────
  const lPath = ledgerPath(repoPath, version);
  const ledgerRaw = fs.read(lPath);
  let decisionsLedger: ContextSection | undefined;
  if (ledgerRaw !== undefined && ledgerRaw.trim().length > 0) {
    decisionsLedger = {
      id: "section-6-decisions-ledger",
      label: "決定・引き継ぎ(ledger)",
      content: `【ledger.yml】\n${ledgerRaw.trim()}`,
    };
  }

  // ── Section 7: 対話状態(DB: confirmed Q&A answers) ───────────────────────
  // DB is optional — when not provided, this section is omitted.
  let dialogState: ContextSection | undefined;
  if (deps.questions && deps.runId) {
    const runQuestions = deps.questions.listByRun(deps.runId);
    const answeredQuestions = runQuestions.filter(
      (q) => q.state === "answered" && q.kind === "question",
    );
    if (answeredQuestions.length > 0) {
      const lines = answeredQuestions.map((q) => {
        const prompt =
          q.payload.kind === "question" ? (q.payload.prompt as string) : "(不明)";
        return `- Q: ${prompt} → answered`;
      });
      dialogState = {
        id: "section-7-dialog-state",
        label: "対話状態(確定 Q&A)",
        content: `【confirmed Q&A — この run での確定回答】\n${lines.join("\n")}`,
      };
    }
  }

  // ── Section 8: 出力契約(StepContracts from DB / cycle snapshot) ───────────
  // Omitted when repos not provided or no contracts found.
  let outputContract: ContextSection | undefined;
  if (deps.cycles && deps.cycleId) {
    const cycleSnap = deps.cycles.findById(deps.cycleId);
    if (cycleSnap) {
      const phase = cycleSnap.phases.find((p) => (p.step as string) === currentStepId);
      // Phase may have a stepDef with contracts attached (cycle snapshot pattern).
      const stepDef = (phase as { readonly stepDef?: Record<string, unknown> } | undefined)
        ?.stepDef;
      if (stepDef && stepDef["contracts"] !== undefined) {
        outputContract = {
          id: "section-8-output-contract",
          label: "出力契約(StepContracts)",
          content: `【StepContracts】\n${JSON.stringify(stepDef["contracts"], null, 2)}`,
        };
      }
    }
  }

  return {
    productInvariant,
    ...(requirements !== undefined ? { requirements } : {}),
    ...(backtrackFeedback !== undefined ? { backtrackFeedback } : {}),
    ...(priorArtifacts !== undefined ? { priorArtifacts } : {}),
    ...(decisionsLedger !== undefined ? { decisionsLedger } : {}),
    ...(dialogState !== undefined ? { dialogState } : {}),
    ...(outputContract !== undefined ? { outputContract } : {}),
  };
}

/**
 * Render a StructuredContext to a flat string for prompt injection.
 * Sections are rendered in order: 3 (brief) → 4 (requirements) →
 * 9 (backtrack feedback, if present) → 5 (prior artifacts) →
 * 6 (decisions/ledger) → 7 (dialog state) → 8 (output contract).
 *
 * Section 9 is placed immediately after requirements so the AI sees
 * the rejection reason prominently before reading prior artifacts.
 */
export function renderStructuredContext(ctx: StructuredContext): string {
  const sections: ContextSection[] = [
    ctx.productInvariant,
    ...(ctx.requirements !== undefined ? [ctx.requirements] : []),
    ...(ctx.backtrackFeedback !== undefined ? [ctx.backtrackFeedback] : []),
    ...(ctx.priorArtifacts !== undefined ? [ctx.priorArtifacts] : []),
    ...(ctx.decisionsLedger !== undefined ? [ctx.decisionsLedger] : []),
    ...(ctx.dialogState !== undefined ? [ctx.dialogState] : []),
    ...(ctx.outputContract !== undefined ? [ctx.outputContract] : []),
  ];

  return sections
    .map((s) => `── ${s.label} ──\n${s.content}`)
    .join("\n\n");
}

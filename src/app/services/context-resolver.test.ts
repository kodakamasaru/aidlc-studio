// context-resolver — BU-1 構造化コンテキスト resolver (US-01 AC / §C7.1-C7.3)
// Tests follow TDD (RED → GREEN → IMPROVE).
//
// Invariants tested (resolveContextPaths — backward compat):
//   1. Done prior steps → each resolves to its sN/index.md (or step-specific flat path).
//   2. Current step's direct-dependency artifact bodies are included (declarative map).
//   3. Declarative map, not per-step if-branches — custom/unknown step still resolves via fallback.
//   4. Missing path → included as-is (composer surfaces the visible marker / 原則④).
//   5. Token-threshold graceful degradation:
//        directly-prior step: index + main-artifacts from map
//        older steps: index only
//   6. No done prior steps → empty list (composer default takes over).
//
// BU-1 invariants (composeStructuredContext):
//   7. Section 3 (brief) is ALWAYS present — even for S2+ steps with prior artifacts (BT-01 ②).
//   8. Section 5 granularity table: S6 gets S5 unit DETAIL files (not just index).
//   9. Section 7 dialog-state is populated from DB (QuestionRepo) answered questions.
//  10. renderStructuredContext produces named section headers in §C7.1 order.
//  11. Missing brief → visible marker in productInvariant (never silent / 原則④).
//
// F-5 invariants (backtrack feedback — section 9):
//  12. backtrack(reject+reason) → section 9 present with reason text.
//  13. Normal launch (no rejection in cycle) → section 9 absent.
//  14. Rejection exists but Fact has no reason → section 9 emits visible marker (原則④).
//  15. renderStructuredContext: section 9 appears between section 4 and section 5.
//  16. Section 4 (requirements) is still present on a backtrack relaunch (S1 done).
import { describe, test, expect } from "bun:test";
import {
  resolveContextPaths,
  stepArtifactDir,
  composeStructuredContext,
  renderStructuredContext,
  briefPath,
  ledgerPath,
  type ResolveContextInput,
  type StructuredContextInput,
  type StructuredContextDeps,
} from "./context-resolver";
import { Step } from "../../domain/shared/vocab";
import type { Cycle, Phase } from "../../domain/cycle/cycle";
import { FakeFs } from "../../infra/sys/fakes";
import type { QuestionRepo, FactRepo } from "../ports/repos";
import type { Question } from "../../domain/question/question";
import type { Fact } from "../../domain/facts/facts";
import type { CycleId, PhaseId, RunId, ProjectId, QuestionId, FactId } from "../../domain/shared/ids";

// ── helpers ──────────────────────────────────────────────────────────────────

function makePhase(step: string, state: Phase["state"], order: number): Phase {
  return {
    id: `ph-${step}` as PhaseId,
    step: Step(step),
    order,
    state,
    runs:
      state === "done" || state === "review"
        ? [
            {
              id: `run-${step}` as RunId,
              attempt: 1,
              state: "done" as const,
              startedAt: "2026-01-01T00:00:00Z" as never,
            },
          ]
        : state === "running"
          ? [
              {
                id: `run-${step}` as RunId,
                attempt: 1,
                state: "running" as const,
                startedAt: "2026-01-01T00:00:00Z" as never,
              },
            ]
          : [],
  };
}

function makeCycle(version: string, phases: Phase[]): Cycle {
  return {
    id: "cyc-1" as CycleId,
    projectId: "proj-1" as ProjectId,
    version: version as never,
    title: "テスト" as never,
    taskIds: [],
    state: "active",
    createdAt: "2026-01-01T00:00:00Z" as never,
    phases,
  };
}

const REPO = "/repo";

// ── stepArtifactDir ───────────────────────────────────────────────────────────

describe("stepArtifactDir", () => {
  test("maps S1 → s1 directory segment", () => {
    expect(stepArtifactDir(REPO, "v0.0.4", "S1")).toBe("/repo/aidlc-docs/v0.0.4/s1");
  });

  test("maps S6 → s6 directory segment", () => {
    expect(stepArtifactDir(REPO, "v0.0.4", "S6")).toBe("/repo/aidlc-docs/v0.0.4/s6");
  });

  test("maps S12 → s12 directory segment", () => {
    expect(stepArtifactDir(REPO, "v0.0.4", "S12")).toBe("/repo/aidlc-docs/v0.0.4/s12");
  });
});

// ── resolveContextPaths — core behavior ──────────────────────────────────────

describe("resolveContextPaths", () => {
  test("returns empty list when no done prior steps exist", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S1", "running", 0)]);
    const input: ResolveContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    expect(resolveContextPaths(input)).toEqual([]);
  });

  test("single done prior step resolves to its index.md", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "running", 1),
    ]);
    const input: ResolveContextInput = { cycle, step: Step("S2"), repoPath: REPO };
    const paths = resolveContextPaths(input);
    expect(paths).toContain("/repo/aidlc-docs/v0.0.4/s1/index.md");
  });

  test("multiple done prior steps all resolve to their index.md", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "done", 1),
      makePhase("S3", "done", 2),
      makePhase("S4", "running", 3),
    ]);
    const input: ResolveContextInput = { cycle, step: Step("S4"), repoPath: REPO };
    const paths = resolveContextPaths(input);
    expect(paths).toContain("/repo/aidlc-docs/v0.0.4/s1/index.md");
    expect(paths).toContain("/repo/aidlc-docs/v0.0.4/s2/index.md");
    expect(paths).toContain("/repo/aidlc-docs/v0.0.4/s3/index.md");
  });

  test("pending steps are NOT included as prior context", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "pending", 1),
      makePhase("S3", "running", 2),
    ]);
    const input: ResolveContextInput = { cycle, step: Step("S3"), repoPath: REPO };
    const paths = resolveContextPaths(input);
    expect(paths).toContain("/repo/aidlc-docs/v0.0.4/s1/index.md");
    expect(paths.some(p => p.includes("/s2/"))).toBe(false);
  });

  test("running steps are NOT included as prior context", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "running", 1),
      makePhase("S3", "pending", 2),
    ]);
    // Launching S2, S1 is done prior
    const input: ResolveContextInput = { cycle, step: Step("S2"), repoPath: REPO };
    const paths = resolveContextPaths(input);
    expect(paths).toContain("/repo/aidlc-docs/v0.0.4/s1/index.md");
    // S2 itself is the current step — not a prior
    expect(paths.filter(p => p.includes("/s2/")).length).toBe(0);
  });

  test("review-state phase is treated as done context (generator completed)", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "review", 0),
      makePhase("S2", "running", 1),
    ]);
    const input: ResolveContextInput = { cycle, step: Step("S2"), repoPath: REPO };
    const paths = resolveContextPaths(input);
    expect(paths).toContain("/repo/aidlc-docs/v0.0.4/s1/index.md");
  });

  test("does NOT include the current step's own paths as prior context", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "done", 1),
      makePhase("S3", "running", 2),
    ]);
    const input: ResolveContextInput = { cycle, step: Step("S3"), repoPath: REPO };
    const paths = resolveContextPaths(input);
    expect(paths.filter(p => p.includes("/s3/"))).toEqual([]);
  });

  // ── declarative map (not if-chains) ──────────────────────────────────────

  test("declarative map — unknown/custom step gets fallback index resolution for done priors", () => {
    // If a step is not in the canonical 12-step map, resolveContextPaths still
    // resolves done prior steps to their index.md (no crash, no per-step if-chain).
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("CUSTOM", "running", 1),
    ]);
    const input: ResolveContextInput = { cycle, step: Step("CUSTOM"), repoPath: REPO };
    const paths = resolveContextPaths(input);
    expect(paths).toContain("/repo/aidlc-docs/v0.0.4/s1/index.md");
  });

  test("declarative map — current step with direct deps includes those artifact paths", () => {
    // S8 (integration) directly depends on S7 domain code artifact.
    // With all prior steps done, S8's direct deps for S7 appear beyond just index.md.
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "done", 1),
      makePhase("S3", "done", 2),
      makePhase("S4", "done", 3),
      makePhase("S5", "done", 4),
      makePhase("S6", "done", 5),
      makePhase("S7", "done", 6),
      makePhase("S8", "running", 7),
    ]);
    const input: ResolveContextInput = { cycle, step: Step("S8"), repoPath: REPO };
    const paths = resolveContextPaths(input);
    // S8 declares S7 body as a direct dependency — must appear
    expect(paths.some(p => p.includes("s7") && !p.endsWith("index.md"))).toBe(true);
    // Also includes older steps' index.md
    expect(paths).toContain("/repo/aidlc-docs/v0.0.4/s1/index.md");
  });

  // ── path ordering ────────────────────────────────────────────────────────

  test("paths are ordered by phase order ascending (oldest context first)", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "done", 1),
      makePhase("S3", "running", 2),
    ]);
    const input: ResolveContextInput = { cycle, step: Step("S3"), repoPath: REPO };
    const paths = resolveContextPaths(input);
    const s1Idx = paths.findIndex(p => p.includes("/s1/"));
    const s2Idx = paths.findIndex(p => p.includes("/s2/"));
    expect(s1Idx).toBeGreaterThanOrEqual(0);
    expect(s2Idx).toBeGreaterThanOrEqual(0);
    expect(s1Idx).toBeLessThan(s2Idx);
  });

  // ── graceful degradation ─────────────────────────────────────────────────

  test("applyDegradation: older steps (not directly prior) get index only", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0), // older — index only under degradation
      makePhase("S2", "done", 1), // directly prior (order = currentOrder - 1)
      makePhase("S3", "running", 2), // current
    ]);
    const input: ResolveContextInput = {
      cycle,
      step: Step("S3"),
      repoPath: REPO,
      applyDegradation: true,
    };
    const paths = resolveContextPaths(input);

    // S1 (older): only index.md
    const s1Paths = paths.filter(p => p.includes("/s1/"));
    expect(s1Paths).toEqual(["/repo/aidlc-docs/v0.0.4/s1/index.md"]);

    // S2 (directly prior): index.md present (may also have extra artifact bodies from map)
    expect(paths).toContain("/repo/aidlc-docs/v0.0.4/s2/index.md");
  });

  test("applyDegradation false (default): all done steps get index + declared dep artifacts", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "running", 1),
    ]);
    const input: ResolveContextInput = { cycle, step: Step("S2"), repoPath: REPO };
    const paths = resolveContextPaths(input);
    // Without degradation, S1 gets at least index.md
    expect(paths).toContain("/repo/aidlc-docs/v0.0.4/s1/index.md");
  });

  // ── missing-path / marker behavior ───────────────────────────────────────
  // resolveContextPaths does NOT do FS existence checks — it emits the expected path.
  // If the file is missing on disk, the PromptComposer's contextLayer renders
  // 「※ 前段文脈が見つかりません(path)」 — ensuring missing context is never silent.

  test("emits expected paths even for steps whose artifact files may not exist yet", () => {
    // S5's index.md might not exist on disk in all test envs, but we still emit the path
    const cycle = makeCycle("v0.0.4", [
      makePhase("S5", "done", 0),
      makePhase("S6", "running", 1),
    ]);
    const input: ResolveContextInput = { cycle, step: Step("S6"), repoPath: REPO };
    const paths = resolveContextPaths(input);
    // Path emitted regardless of disk existence — composer handles missing-marker
    expect(paths).toContain("/repo/aidlc-docs/v0.0.4/s5/index.md");
  });
});

// ── BU-1: composeStructuredContext + renderStructuredContext ──────────────────

const BRIEF_CONTENT = "# brief\n\nこのPJはボード型 AI-DLC スタジオを作る(VISION-TOKEN-BU1)。";
const S1_INDEX_CONTENT = "# S1 index\n\nUS-01: 前段文脈注入";
const S5_UNIT_CONTENT = "# S5 unit詳細\n\nBU-1 構造化コンテキスト";
const LEDGER_CONTENT = "- id: BT-01\n  state: carried\n  into: v0.0.4";

/** Build a FakeFs with the brief at the canonical path, plus optional extras. */
function makeFsWithBrief(extra: Record<string, string> = {}): FakeFs {
  return new FakeFs(undefined, {
    [briefPath(REPO)]: BRIEF_CONTENT,
    ...extra,
  });
}

/** Build a minimal QuestionRepo stub that returns a fixed list of questions. */
function makeQuestionRepo(questions: readonly Question[]): QuestionRepo {
  return {
    save: () => {},
    findById: () => undefined,
    listOpenByProject: () => [],
    listByRun: (runId) => questions.filter((q) => q.runId === runId),
    listByCycle: () => questions,
  };
}

/** Build a minimal answered Question for testing section 7. */
function makeAnsweredQuestion(runId: RunId, prompt: string): Question {
  return {
    id: "q-1" as QuestionId,
    runId,
    cycleId: "cyc-1" as CycleId,
    taskId: null,
    kind: "question",
    state: "answered",
    payload: { kind: "question", prompt: prompt as never },
    createdAt: "2026-01-01T00:00:00Z" as never,
  };
}

describe("composeStructuredContext — BU-1", () => {
  // ── Section 3: brief ALWAYS present ────────────────────────────────────────

  test("section 3 (brief) is present when no prior steps exist (S1 launch)", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S1", "running", 0)]);
    const fs = makeFsWithBrief();
    const input: StructuredContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    const deps: StructuredContextDeps = { fs };
    const ctx = composeStructuredContext(input, deps);

    expect(ctx.productInvariant.content).toContain("VISION-TOKEN-BU1");
    expect(ctx.productInvariant.missing).toBeUndefined();
  });

  test("section 3 (brief) is ALWAYS present for S2+ steps even when prior artifacts exist (BT-01 ②)", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "running", 1),
    ]);
    const s1IndexPath = `/repo/aidlc-docs/v0.0.4/s1/index.md`;
    const fs = makeFsWithBrief({ [s1IndexPath]: S1_INDEX_CONTENT });
    const input: StructuredContextInput = { cycle, step: Step("S2"), repoPath: REPO };
    const deps: StructuredContextDeps = { fs };
    const ctx = composeStructuredContext(input, deps);

    // Brief must still be there even though S1 is a done prior step
    expect(ctx.productInvariant.content).toContain("VISION-TOKEN-BU1");
    // Prior artifacts from S1 should also be present
    expect(ctx.priorArtifacts?.content).toContain("S1 index");
  });

  test("section 3 (brief) shows visible marker when brief.md is missing (原則④)", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S1", "running", 0)]);
    // No brief pinned in FakeFs → missing
    const fs = new FakeFs();
    const input: StructuredContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    const deps: StructuredContextDeps = { fs };
    const ctx = composeStructuredContext(input, deps);

    expect(ctx.productInvariant.missing).toBe(true);
    expect(ctx.productInvariant.content).toContain("見つかりません");
  });

  // ── Section 4: requirements (S1 index) ─────────────────────────────────────

  test("section 4 (requirements) is absent when S1 is not done", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S1", "running", 0)]);
    const fs = makeFsWithBrief();
    const input: StructuredContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    const ctx = composeStructuredContext(input, { fs });

    expect(ctx.requirements).toBeUndefined();
  });

  test("section 4 (requirements) is present when S1 is done", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "running", 1),
    ]);
    const s1IndexPath = `/repo/aidlc-docs/v0.0.4/s1/index.md`;
    const fs = makeFsWithBrief({ [s1IndexPath]: S1_INDEX_CONTENT });
    const input: StructuredContextInput = { cycle, step: Step("S2"), repoPath: REPO };
    const ctx = composeStructuredContext(input, { fs });

    expect(ctx.requirements?.content).toContain("US-01");
  });

  // ── Section 5 granularity: S6 gets S5 DETAIL files ─────────────────────────

  test("section 5 granularity — S6 gets S5 unit detail files (not just index.md)", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S5", "done", 1),
      makePhase("S6", "running", 2),
    ]);
    const s5IndexPath = `/repo/aidlc-docs/v0.0.4/s5/index.md`;
    const s5Unit1Path = `/repo/aidlc-docs/v0.0.4/s5/unit-01-wire-contract.md`;
    const s5BacktrackPath = `/repo/aidlc-docs/v0.0.4/s5/backtrack-context-io-units.md`;
    const s1IndexPath = `/repo/aidlc-docs/v0.0.4/s1/index.md`;
    const fs = makeFsWithBrief({
      [s5IndexPath]: "# S5 index",
      [s5Unit1Path]: "# S5 unit-01 wire",
      [s5BacktrackPath]: S5_UNIT_CONTENT,
      [s1IndexPath]: S1_INDEX_CONTENT,
    });
    const input: StructuredContextInput = { cycle, step: Step("S6"), repoPath: REPO };
    const ctx = composeStructuredContext(input, { fs });

    // S5 detail files must appear in section 5
    expect(ctx.priorArtifacts?.content).toContain("S5 unit-01 wire");
    expect(ctx.priorArtifacts?.content).toContain("BU-1 構造化コンテキスト");
    // Not just index.md (which would miss the unit details)
    expect(ctx.priorArtifacts?.content).toContain("unit-01-wire-contract.md");
  });

  test("section 5 granularity — S2 only gets S1 index (no extra artifacts)", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "running", 1),
    ]);
    const s1IndexPath = `/repo/aidlc-docs/v0.0.4/s1/index.md`;
    const fs = makeFsWithBrief({ [s1IndexPath]: S1_INDEX_CONTENT });
    const input: StructuredContextInput = { cycle, step: Step("S2"), repoPath: REPO };
    const ctx = composeStructuredContext(input, { fs });

    // S2 only wants index for S1 — no extra artifact paths
    expect(ctx.priorArtifacts?.content).toContain("s1/index.md");
  });

  // ── Section 6: ledger ───────────────────────────────────────────────────────

  test("section 6 (ledger) appears when ledger.yml exists", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S1", "running", 0)]);
    const lPath = ledgerPath(REPO, "v0.0.4");
    const fs = makeFsWithBrief({ [lPath]: LEDGER_CONTENT });
    const input: StructuredContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    const ctx = composeStructuredContext(input, { fs });

    expect(ctx.decisionsLedger?.content).toContain("BT-01");
    expect(ctx.decisionsLedger?.content).toContain("carried");
  });

  test("section 6 (ledger) is absent when ledger.yml does not exist", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S1", "running", 0)]);
    const fs = makeFsWithBrief(); // no ledger
    const input: StructuredContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    const ctx = composeStructuredContext(input, { fs });

    expect(ctx.decisionsLedger).toBeUndefined();
  });

  // ── Section 7: dialog state from DB ────────────────────────────────────────

  test("section 7 (dialog state) is populated from DB answered questions", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S1", "running", 0)]);
    const fs = makeFsWithBrief();
    const runId = "run-1" as RunId;
    const answeredQ = makeAnsweredQuestion(runId, "どのスコープを優先しますか?");
    const questions = makeQuestionRepo([answeredQ]);
    const input: StructuredContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    const deps: StructuredContextDeps = { fs, questions, runId };
    const ctx = composeStructuredContext(input, deps);

    expect(ctx.dialogState).toBeDefined();
    expect(ctx.dialogState?.content).toContain("どのスコープを優先しますか?");
    expect(ctx.dialogState?.content).toContain("answered");
  });

  test("section 7 (dialog state) is absent when no DB deps provided", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S1", "running", 0)]);
    const fs = makeFsWithBrief();
    const input: StructuredContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    const ctx = composeStructuredContext(input, { fs }); // no questions repo

    expect(ctx.dialogState).toBeUndefined();
  });

  test("section 7 (dialog state) is absent when no answered questions exist", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S1", "running", 0)]);
    const fs = makeFsWithBrief();
    const runId = "run-1" as RunId;
    const questions = makeQuestionRepo([]); // empty
    const input: StructuredContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    const deps: StructuredContextDeps = { fs, questions, runId };
    const ctx = composeStructuredContext(input, deps);

    expect(ctx.dialogState).toBeUndefined();
  });

  // ── renderStructuredContext ─────────────────────────────────────────────────

  test("renderStructuredContext emits section headers in §C7.1 order (3→8)", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "running", 1),
    ]);
    const s1IndexPath = `/repo/aidlc-docs/v0.0.4/s1/index.md`;
    const lPath = ledgerPath(REPO, "v0.0.4");
    const fs = makeFsWithBrief({
      [s1IndexPath]: S1_INDEX_CONTENT,
      [lPath]: LEDGER_CONTENT,
    });
    const input: StructuredContextInput = { cycle, step: Step("S2"), repoPath: REPO };
    const ctx = composeStructuredContext(input, { fs });
    const rendered = renderStructuredContext(ctx);

    // Section 3 brief label
    expect(rendered).toContain("プロダクト不変(brief)");
    // Section 4 requirements label
    expect(rendered).toContain("このサイクルの要件");
    // Section 5 prior artifacts label
    expect(rendered).toContain("前段の成果物");
    // Section 6 ledger label
    expect(rendered).toContain("決定・引き継ぎ");
    // Section 3 (brief) appears BEFORE section 5 (prior artifacts)
    const briefIdx = rendered.indexOf("プロダクト不変(brief)");
    const priorIdx = rendered.indexOf("前段の成果物");
    expect(briefIdx).toBeLessThan(priorIdx);
  });

  // ── briefPath + ledgerPath helpers ─────────────────────────────────────────

  test("briefPath returns canonical aidlc-docs/brief.md path", () => {
    expect(briefPath(REPO)).toBe("/repo/aidlc-docs/brief.md");
  });

  test("ledgerPath returns canonical aidlc-docs/{version}/ledger.yml path", () => {
    expect(ledgerPath(REPO, "v0.0.4")).toBe("/repo/aidlc-docs/v0.0.4/ledger.yml");
  });
});

// ── F-5: backtrack feedback (section 9) ──────────────────────────────────────
//
// Helpers for section-9 tests.

/** Minimal FactRepo stub. */
function makeFactRepo(facts: readonly Fact[]): FactRepo {
  return {
    save: () => {},
    findById: () => undefined,
    listByCycle: () => facts,
  };
}

/** A synthetic Fact representing a visual_review rejection with a reason. */
function makeRejectFact(
  questionId: QuestionId,
  reason: string,
  opts: { confirmedAt?: string } = {},
): Fact {
  return {
    id: `fact-${questionId as string}` as FactId,
    questionId,
    cycleId: "cyc-1" as CycleId,
    source: "human",
    confirmedAt: (opts.confirmedAt ?? "2026-01-01T00:00:00Z") as never,
    currentVersion: 1,
    revisions: [
      {
        version: 1,
        verdict: "reject",
        statement: `visual_review:reject — ${reason}` as never,
        reason: reason as never,
        editedBy: "human",
        at: (opts.confirmedAt ?? "2026-01-01T00:00:00Z") as never,
      },
    ],
  };
}

/** A synthetic answered visual_review Question (the reject case). */
function makeRejectedVisualReviewQuestion(
  id: QuestionId,
  runId: RunId,
  step: Step = Step("S8"),
): Question {
  return {
    id,
    runId,
    cycleId: "cyc-1" as CycleId,
    taskId: null,
    kind: "visual_review",
    state: "answered",
    payload: {
      kind: "visual_review",
      review: {
        runId,
        cycleId: "cyc-1" as CycleId,
        step,
        taskId: null,
        blocks: [{ type: "summary", title: "前回成果物" as never, body: "内容" as never }],
        producedAt: "2026-01-01T00:00:00Z" as never,
      },
    },
    createdAt: "2026-01-01T00:00:00Z" as never,
  };
}

describe("composeStructuredContext — F-5 backtrack feedback (section 9)", () => {
  const RUN_ID = "run-s8-1" as RunId;
  const Q_ID = "q-review-1" as QuestionId;
  const CYCLE_ID = "cyc-1" as CycleId;
  const REJECT_REASON = "ヘッダーの文字色がモックと異なる。修正せよ。";

  // ── invariant 12: reject+reason → section 9 present ───────────────────────

  test("section 9 (backtrack feedback) is present when a visual_review was rejected with reason", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S8", "running", 1),
    ]);
    const fs = makeFsWithBrief();
    const q = makeRejectedVisualReviewQuestion(Q_ID, RUN_ID);
    const fact = makeRejectFact(Q_ID, REJECT_REASON);
    const questions = makeQuestionRepo([q]);
    const facts = makeFactRepo([fact]);
    const deps: StructuredContextDeps = { fs, questions, facts, cycleId: CYCLE_ID };

    const ctx = composeStructuredContext(
      { cycle, step: Step("S8"), repoPath: REPO },
      deps,
    );

    expect(ctx.backtrackFeedback).toBeDefined();
    expect(ctx.backtrackFeedback?.content).toContain(REJECT_REASON);
    expect(ctx.backtrackFeedback?.missing).toBeUndefined();
  });

  // ── invariant 13: no rejection → section 9 absent ─────────────────────────

  test("section 9 (backtrack feedback) is absent on a normal (first-run) launch", () => {
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S8", "running", 1),
    ]);
    const fs = makeFsWithBrief();
    // No questions in cycle → no rejection history.
    const questions = makeQuestionRepo([]);
    const facts = makeFactRepo([]);
    const deps: StructuredContextDeps = { fs, questions, facts, cycleId: CYCLE_ID };

    const ctx = composeStructuredContext(
      { cycle, step: Step("S8"), repoPath: REPO },
      deps,
    );

    expect(ctx.backtrackFeedback).toBeUndefined();
  });

  test("section 9 is absent when questions+facts repos are not provided (no backtrack deps)", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S8", "running", 0)]);
    const fs = makeFsWithBrief();
    // No repos at all → backward compat.
    const ctx = composeStructuredContext({ cycle, step: Step("S8"), repoPath: REPO }, { fs });

    expect(ctx.backtrackFeedback).toBeUndefined();
  });

  // ── invariant 14: answered visual_review that was APPROVED → no section 9 ──
  //
  // Only rejections trigger backtrack feedback. An approved visual_review means
  // the run passed — no reason to inject feedback on the next run.

  test("section 9 is absent when the visual_review was approved (not rejected)", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S8", "running", 0)]);
    const fs = makeFsWithBrief();
    // Answered visual_review where the human approved.
    const approvedQ: Question = {
      id: Q_ID,
      runId: RUN_ID,
      cycleId: CYCLE_ID,
      taskId: null,
      kind: "visual_review",
      state: "answered",
      payload: {
        kind: "visual_review",
        review: {
          runId: RUN_ID,
          cycleId: CYCLE_ID,
          step: Step("S8"),
          taskId: null,
          blocks: [],
          producedAt: "2026-01-01T00:00:00Z" as never,
        },
      },
      createdAt: "2026-01-01T00:00:00Z" as never,
    };
    // Corresponding fact has approve verdict — no reason (approve doesn't require one).
    const approveFact: Fact = {
      id: `fact-${Q_ID as string}` as FactId,
      questionId: Q_ID,
      cycleId: CYCLE_ID,
      source: "human",
      confirmedAt: "2026-01-01T00:00:00Z" as never,
      currentVersion: 1,
      revisions: [
        {
          version: 1,
          verdict: "approve",
          statement: "visual_review:approve" as never,
          editedBy: "human",
          at: "2026-01-01T00:00:00Z" as never,
        },
      ],
    };
    const questions = makeQuestionRepo([approvedQ]);
    const facts = makeFactRepo([approveFact]);
    const deps: StructuredContextDeps = { fs, questions, facts, cycleId: CYCLE_ID };

    const ctx = composeStructuredContext(
      { cycle, step: Step("S8"), repoPath: REPO },
      deps,
    );

    // Approve verdict → no backtrack feedback.
    expect(ctx.backtrackFeedback).toBeUndefined();
  });

  test("section 9 emits visible marker when rejection fact is present but has no reason (原則④)", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S8", "running", 0)]);
    const fs = makeFsWithBrief();
    const q = makeRejectedVisualReviewQuestion(Q_ID, RUN_ID);
    // A reject fact with an empty reason — domain normally forbids this but guard defensively.
    const rejectFactNoReason: Fact = {
      id: `fact-${Q_ID as string}` as FactId,
      questionId: Q_ID,
      cycleId: CYCLE_ID,
      source: "human",
      confirmedAt: "2026-01-01T00:00:00Z" as never,
      currentVersion: 1,
      revisions: [
        {
          version: 1,
          verdict: "reject",
          statement: "visual_review:reject" as never,
          // reason intentionally omitted (or empty) — domain prevents this in practice
          editedBy: "human",
          at: "2026-01-01T00:00:00Z" as never,
        },
      ],
    };
    const questions = makeQuestionRepo([q]);
    const facts = makeFactRepo([rejectFactNoReason]);
    const deps: StructuredContextDeps = { fs, questions, facts, cycleId: CYCLE_ID };

    const ctx = composeStructuredContext(
      { cycle, step: Step("S8"), repoPath: REPO },
      deps,
    );

    // Reject exists but no reason → visible marker (原則④).
    expect(ctx.backtrackFeedback).toBeDefined();
    expect(ctx.backtrackFeedback?.missing).toBe(true);
    expect(ctx.backtrackFeedback?.content).toContain("取得できませんでした");
  });

  test("section 9 accumulates ALL rejection reasons (not just the latest) in chronological order + ledger directive", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S8", "running", 0)]);
    const fs = makeFsWithBrief();

    const Q_ID_OLD = "q-review-old" as QuestionId;
    const Q_ID_NEW = "q-review-new" as QuestionId;
    const OLD_REASON = "古い差し戻し理由";
    const NEW_REASON = "最新の差し戻し理由";

    const qOld = makeRejectedVisualReviewQuestion(Q_ID_OLD, RUN_ID);
    const qNew = makeRejectedVisualReviewQuestion(Q_ID_NEW, RUN_ID);
    const factOld = makeRejectFact(Q_ID_OLD, OLD_REASON, { confirmedAt: "2026-01-01T00:00:00Z" });
    const factNew = makeRejectFact(Q_ID_NEW, NEW_REASON, { confirmedAt: "2026-06-01T00:00:00Z" });

    const questions = makeQuestionRepo([qOld, qNew]);
    const facts = makeFactRepo([factOld, factNew]);
    const deps: StructuredContextDeps = { fs, questions, facts, cycleId: CYCLE_ID };

    const ctx = composeStructuredContext(
      { cycle, step: Step("S8"), repoPath: REPO },
      deps,
    );

    const content = ctx.backtrackFeedback?.content ?? "";
    // 全件累積: BOTH reasons present (older one is not dropped).
    expect(content).toContain(OLD_REASON);
    expect(content).toContain(NEW_REASON);
    // Chronological: older reason appears before the newer one.
    expect(content.indexOf(OLD_REASON)).toBeLessThan(content.indexOf(NEW_REASON));
    // ledger 昇格 directive is delivered IN the prompt text.
    expect(content).toContain("ledger");
    expect(content).toContain("恒久化");
  });

  test("section 9 attributes each rejection to its own step (no mislabel onto the current step)", () => {
    // S8 was rejected; we are now launching S9. The S8 reason must be labelled [S8],
    // never "このステップ(S9)" — an unrelated step's rejection must not be mis-owned.
    const cycle = makeCycle("v0.0.4", [
      makePhase("S8", "done", 0),
      makePhase("S9", "running", 1),
    ]);
    const fs = makeFsWithBrief();

    const Q_ID = "q-review-s8" as QuestionId;
    const S8_REASON = "S8 の配線が未実装";
    const qS8 = makeRejectedVisualReviewQuestion(Q_ID, RUN_ID, Step("S8"));
    const factS8 = makeRejectFact(Q_ID, S8_REASON, { confirmedAt: "2026-03-01T00:00:00Z" });

    const questions = makeQuestionRepo([qS8]);
    const facts = makeFactRepo([factS8]);
    const deps: StructuredContextDeps = { fs, questions, facts, cycleId: CYCLE_ID };

    const ctx = composeStructuredContext(
      { cycle, step: Step("S9"), repoPath: REPO },
      deps,
    );

    const content = ctx.backtrackFeedback?.content ?? "";
    expect(content).toContain(S8_REASON);
    expect(content).toContain("[S8]");
    // Must NOT mislabel the S8 rejection as belonging to the current step S9.
    expect(content).not.toContain("このステップ(S9)");
  });

  // ── invariant 15: renderStructuredContext ordering ─────────────────────────

  test("renderStructuredContext places section 9 between section 4 (requirements) and section 5 (prior artifacts)", () => {
    const s1IndexPath = `/repo/aidlc-docs/v0.0.4/s1/index.md`;
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S8", "running", 1),
    ]);
    const fs = makeFsWithBrief({ [s1IndexPath]: "# S1 requirements" });
    const q = makeRejectedVisualReviewQuestion(Q_ID, RUN_ID);
    const fact = makeRejectFact(Q_ID, REJECT_REASON);
    const questions = makeQuestionRepo([q]);
    const facts = makeFactRepo([fact]);
    const deps: StructuredContextDeps = {
      fs,
      questions,
      facts,
      cycleId: CYCLE_ID,
    };

    const ctx = composeStructuredContext(
      { cycle, step: Step("S8"), repoPath: REPO },
      deps,
    );
    const rendered = renderStructuredContext(ctx);

    const sec4Idx = rendered.indexOf("このサイクルの要件");
    const sec9Idx = rendered.indexOf("差し戻し理由");
    const sec5Idx = rendered.indexOf("前段の成果物");

    // Section 9 must exist and be between section 4 and section 5.
    expect(sec9Idx).toBeGreaterThan(-1);
    expect(sec4Idx).toBeLessThan(sec9Idx);
    expect(sec9Idx).toBeLessThan(sec5Idx);
  });

  // ── invariant 16: section 4 (requirements) is still present on backtrack ───

  test("section 4 (requirements) is present on a backtrack relaunch when S1 is done", () => {
    const s1IndexPath = `/repo/aidlc-docs/v0.0.4/s1/index.md`;
    const S1_CONTENT = "# S1 index\n\nUS-01: バックトラック後も要件が見える";
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S8", "running", 1),
    ]);
    const fs = makeFsWithBrief({ [s1IndexPath]: S1_CONTENT });
    const q = makeRejectedVisualReviewQuestion(Q_ID, RUN_ID);
    const fact = makeRejectFact(Q_ID, REJECT_REASON);
    const questions = makeQuestionRepo([q]);
    const facts = makeFactRepo([fact]);
    const deps: StructuredContextDeps = { fs, questions, facts, cycleId: CYCLE_ID };

    const ctx = composeStructuredContext(
      { cycle, step: Step("S8"), repoPath: REPO },
      deps,
    );

    // Both section 4 (requirements) and section 9 (backtrack feedback) must be present.
    expect(ctx.requirements).toBeDefined();
    expect(ctx.requirements?.content).toContain("US-01");
    expect(ctx.backtrackFeedback).toBeDefined();
    expect(ctx.backtrackFeedback?.content).toContain(REJECT_REASON);
  });
});

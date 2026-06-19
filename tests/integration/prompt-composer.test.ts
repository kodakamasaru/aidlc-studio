// US-03 / BU-1 PromptComposer — deterministic checks that:
//   [Legacy] compose(): carries the 3 canonical sources (skill 本文 + step identity +
//     verification observations) and fails LOUDLY on a missing 本文 (no silent fallback / 原則④).
//   [Structured] composeWithStructuredContext(): renders §C7.1 named sections, brief
//     always present, output-contract instruction present (§C7.4).
//
// The real-AI path is the additive live test; this pins the composition shape with a FakeFs fixture.
import { test, expect, describe } from "bun:test";
import { FakeFs } from "../../src/infra/sys/fakes";
import {
  PromptComposer,
  PromptComposerError,
  OUTPUT_CONTRACT_INSTRUCTION,
  skillBodyPath,
  briefBodyPath,
} from "../../src/app/services/prompt-composer";
import {
  composeStructuredContext,
  briefPath,
  type StructuredContextInput,
  type StructuredContextDeps,
} from "../../src/app/services/context-resolver";
import { Step, skillRefOf } from "../../src/domain/shared/vocab";
import type { Text } from "../../src/domain/shared/primitives";
import type { Cycle, Phase } from "../../src/domain/cycle/cycle";
import type { CycleId, PhaseId, RunId, ProjectId } from "../../src/domain/shared/ids";

const REPO = "/repo";
const S1_BODY = "# AI-DLC S1: 要件\n\nあなたは要件ヒアリング担当。完了条件: US が展開済み。";
const BRIEF = "# brief\n\nこのPJはボード型 AI-DLC スタジオを作る(VISION-TOKEN-XYZ)。";

/** Pins all 3 sources: skill 本文 + brief(前段の文脈). */
function composerWithS1(extra: Record<string, string> = {}): PromptComposer {
  const skillP = skillBodyPath(REPO, skillRefOf(Step("S1"))!);
  return new PromptComposer(
    new FakeFs(undefined, { [skillP]: S1_BODY, [briefBodyPath(REPO)]: BRIEF, ...extra }),
  );
}

describe("PromptComposer (US-03)", () => {
  test("generator prompt embeds ALL 3 sources: skill 本文 + 契約 + brief(前段の文脈)", () => {
    const out = composerWithS1().compose({ role: "generator", step: Step("S1"), repoPath: REPO });
    expect(out).toContain("aidlc-s1-requirements"); // real dir skillRef (not aidlc-S1)
    expect(out).toContain("S1");
    expect(out).toContain("生成者");
    expect(out).toContain(S1_BODY.trim()); // ② 本文 included verbatim
    expect(out).toContain("VISION-TOKEN-XYZ"); // ④ 3rd source = brief content
    expect(out).toContain("前段の文脈"); // labeled layer present
  });

  test("evaluator prompt embeds verification 観点 + brief(3rd source) + addressed/gap instruction", () => {
    const verification = ["一覧が表示される", "空状態が出る"] as unknown as Text[];
    const out = composerWithS1().compose({
      role: "evaluator",
      step: Step("S1"),
      repoPath: REPO,
      verification,
    });
    expect(out).toContain("評価者");
    expect(out).toContain("一覧が表示される"); // ③ 契約(観点)
    expect(out).toContain("空状態が出る");
    expect(out).toContain("VISION-TOKEN-XYZ"); // ④ brief(3rd source)
    expect(out).toContain("addressed");
    expect(out).toContain("gap");
  });

  test("missing 前段文脈 is surfaced as a visible marker (not silently dropped / 原則④)", () => {
    // skill 本文 present but NO brief pinned → context layer shows the marker, not silence.
    const skillP = skillBodyPath(REPO, skillRefOf(Step("S1"))!);
    const composer = new PromptComposer(new FakeFs(undefined, { [skillP]: S1_BODY }));
    const out = composer.compose({ role: "generator", step: Step("S1"), repoPath: REPO });
    expect(out).toContain("前段の文脈");
    expect(out).toContain("見つかりません"); // marker, not empty
  });

  test("contextPaths: [] opts out of the 前段文脈 layer (no layer content rendered)", () => {
    const out = composerWithS1().compose({
      role: "generator",
      step: Step("S1"),
      repoPath: REPO,
      contextPaths: [],
    });
    expect(out).not.toContain("VISION-TOKEN-XYZ"); // brief NOT injected
    expect(out).not.toContain("【brief.md】"); // context layer not rendered
    expect(out).toContain(S1_BODY.trim()); // skill 本文 still present
  });

  test("throws PromptComposerError when the skill 本文 is missing (loud, no fallback)", () => {
    const composer = new PromptComposer(new FakeFs()); // FakeFs.read → undefined
    expect(() =>
      composer.compose({ role: "generator", step: Step("S1"), repoPath: REPO }),
    ).toThrow(PromptComposerError);
  });

  test("throws for a step with no canonical skillRef (e.g. retired S2.5)", () => {
    const composer = composerWithS1();
    expect(() =>
      composer.compose({ role: "generator", step: Step("S2.5"), repoPath: REPO }),
    ).toThrow(PromptComposerError);
  });

  test("skillBodyPath points at kit/skills/{skillRef}/SKILL.md under the repo", () => {
    expect(skillBodyPath(REPO, skillRefOf(Step("S6"))!)).toBe(
      "/repo/kit/skills/aidlc-s6-domain-model/SKILL.md",
    );
  });
});

// ── BU-1: composeWithStructuredContext (§C7.1-C7.4) ──────────────────────────

/** Helper: build a minimal Cycle with a single running phase. */
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

function makePhase(step: string, state: Phase["state"], order: number): Phase {
  return {
    id: `ph-${step}` as PhaseId,
    step: Step(step),
    order,
    state,
    runs: [],
  };
}

const BRIEF_CONTENT_BU1 = "# brief\n\nBU1-VISION-TOKEN テスト用ビジョン";

/** Build FakeFs with skill 本文 + brief + optional extras. */
function makeStructuredFs(extra: Record<string, string> = {}): FakeFs {
  const skillP = skillBodyPath(REPO, skillRefOf(Step("S1"))!);
  return new FakeFs(undefined, {
    [skillP]: S1_BODY,
    [briefPath(REPO)]: BRIEF_CONTENT_BU1,
    ...extra,
  });
}

describe("PromptComposer.composeWithStructuredContext (BU-1 §C7.1-C7.4)", () => {
  test("output-contract instruction is present in structured generator prompt (§C7.4)", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S1", "running", 0)]);
    const fs = makeStructuredFs();
    const ctxInput: StructuredContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    const ctx = composeStructuredContext(ctxInput, { fs });
    const composer = new PromptComposer(fs);
    const out = composer.composeWithStructuredContext(
      { role: "generator", step: Step("S1"), repoPath: REPO },
      ctx,
    );

    expect(out).toContain("aidlc-result");
    expect(out).toContain("出力契約");
    expect(out).toContain("needs_human");
    expect(out).toContain("artifacts");
  });

  test("output-contract instruction is present in structured evaluator prompt (§C7.4)", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S1", "running", 0)]);
    const fs = makeStructuredFs();
    const ctxInput: StructuredContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    const ctx = composeStructuredContext(ctxInput, { fs });
    const composer = new PromptComposer(fs);
    const out = composer.composeWithStructuredContext(
      { role: "evaluator", step: Step("S1"), repoPath: REPO, verification: ["AC 一覧が表示される" as Text] },
      ctx,
    );

    expect(out).toContain("aidlc-result");
    expect(out).toContain("出力契約");
    expect(out).toContain("AC 一覧が表示される"); // verification obs still present
  });

  test("brief (section 3) is ALWAYS present in the structured output for S2+ steps (BT-01 ②)", () => {
    // Build a cycle where S1 is done and S2 is the current step.
    // The composer is called for S1 (since we have S1 skill body pinned) to
    // verify the structured context carries the brief even when prior steps exist.
    // We use S1 as the compose step so the skill body is available in the FakeFs.
    const cycle = makeCycle("v0.0.4", [
      makePhase("S1", "done", 0),
      makePhase("S2", "running", 1),
    ]);
    const s1IndexPath = `/repo/aidlc-docs/v0.0.4/s1/index.md`;
    // We compose for S2 context but run the composer for S1 (where we have the skill body)
    // to isolate the "brief always present" invariant from skill-body availability.
    // The S1 skill body is in makeStructuredFs; S2 context is built from the cycle.
    const fs = makeStructuredFs({ [s1IndexPath]: "# S1 index — US-01 確定" });
    // Context: what S2 would see (S1 is done prior)
    const ctxInput: StructuredContextInput = { cycle, step: Step("S2"), repoPath: REPO };
    const ctx = composeStructuredContext(ctxInput, { fs });

    // The structured context must have brief (section 3)
    expect(ctx.productInvariant.content).toContain("BU1-VISION-TOKEN");
    // And prior artifacts from S1 (section 5)
    expect(ctx.priorArtifacts?.content).toContain("S1 index");

    // Now compose with S1 step (where we have skill body) using S2's context
    // to confirm the composer renders both brief AND prior artifacts.
    const composer = new PromptComposer(fs);
    const out = composer.composeWithStructuredContext(
      { role: "generator", step: Step("S1"), repoPath: REPO },
      ctx,
    );

    // Brief must appear even though S1 is a done prior step
    expect(out).toContain("BU1-VISION-TOKEN");
    // "プロダクト不変" section header
    expect(out).toContain("プロダクト不変");
    // Prior artifact section also present (S1 index was in the context)
    expect(out).toContain("前段の成果物");
    // Output-contract instruction present
    expect(out).toContain("aidlc-result");
  });

  test("throws PromptComposerError when skill 本文 is missing in structured path", () => {
    const cycle = makeCycle("v0.0.4", [makePhase("S1", "running", 0)]);
    const fs = new FakeFs(undefined, { [briefPath(REPO)]: BRIEF_CONTENT_BU1 }); // no skill body
    const ctxInput: StructuredContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    const ctx = composeStructuredContext(ctxInput, { fs });
    const composer = new PromptComposer(fs);

    expect(() =>
      composer.composeWithStructuredContext(
        { role: "generator", step: Step("S1"), repoPath: REPO },
        ctx,
      ),
    ).toThrow(PromptComposerError);
  });

  test("OUTPUT_CONTRACT_INSTRUCTION export contains required aidlc-result schema markers", () => {
    expect(OUTPUT_CONTRACT_INSTRUCTION).toContain("aidlc-result");
    expect(OUTPUT_CONTRACT_INSTRUCTION).toContain("artifacts");
    expect(OUTPUT_CONTRACT_INSTRUCTION).toContain("questions");
    expect(OUTPUT_CONTRACT_INSTRUCTION).toContain("decisions");
    expect(OUTPUT_CONTRACT_INSTRUCTION).toContain("completeness");
    expect(OUTPUT_CONTRACT_INSTRUCTION).toContain("status");
    expect(OUTPUT_CONTRACT_INSTRUCTION).toContain("needs_human");
  });
});

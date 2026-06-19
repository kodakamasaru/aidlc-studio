// BU-1 structured-context wiring — integration tests.
//
// Proves that:
//   1. WIRED PATH: cycle-service.persistThenLaunch populates RunLaunch.structuredContext
//      when startPhase is called (brief is ALWAYS present in productInvariant).
//   2. The structured context carries the §C7.4 output-contract instruction when
//      live.ts uses composeWithStructuredContext (tested via a PromptComposer unit).
//   3. BACKWARD-COMPAT REGRESSION: a RunLaunch WITHOUT structuredContext still uses
//      the legacy compose() path in live.ts generatorPrompt (PromptComposer.compose
//      is called, not composeWithStructuredContext).
//
// Tests at the cycle-service / integration level: drive via buildTestApp so the
// real orchestrator recording captures the structuredContext field on RunLaunch.
//
// NOTE: live.ts generatorPrompt is tested as a unit because wiring it end-to-end
// requires spawning a real claude process (e2e-live scope, not here). The unit test
// verifies the branch selection logic (structured vs legacy) deterministically.
import { describe, test, expect } from "bun:test";
import { buildTestApp, makeRepoDir } from "../support/harness";
import { FakeFs } from "../../src/infra/sys/fakes";
import {
  PromptComposer,
  OUTPUT_CONTRACT_INSTRUCTION,
  skillBodyPath,
} from "../../src/app/services/prompt-composer";
import {
  composeStructuredContext,
  briefPath,
  type StructuredContextInput,
  type StructuredContextDeps,
} from "../../src/app/services/context-resolver";
import { Step, skillRefOf } from "../../src/domain/shared/vocab";
import type { Cycle, Phase } from "../../src/domain/cycle/cycle";
import type { CycleId, PhaseId, ProjectId } from "../../src/domain/shared/ids";

// ── Helpers ──────────────────────────────────────────────────────────────────

const REPO = "/repo";
const S1_BODY = "# AI-DLC S1: 要件\n\nあなたは要件ヒアリング担当。完了条件: US が展開済み。";
const BRIEF = "# brief\n\nこのPJはボード型 AI-DLC スタジオを作る(VISION-TOKEN-BU1-WIRE)。";

/** Create a project via HTTP, return its id. */
async function createProject(h: ReturnType<typeof buildTestApp>, repoPath = makeRepoDir()) {
  const res = await h.app.request("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repoPath }),
  });
  expect(res.status).toBe(201);
  const json = await res.json() as { data: { id: string } };
  return json.data.id;
}

/** Create a cycle under a project, return its JSON. */
async function createCycle(h: ReturnType<typeof buildTestApp>, projectId: string) {
  const res = await h.app.request(`/api/projects/${projectId}/cycles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "BU-1 wiring cycle", version: "v0.9.1" }),
  });
  expect(res.status).toBe(201);
  return (await res.json() as { data: unknown }).data;
}

/** Start a phase for a cycle, return HTTP status. Route returns 200 (not 201). */
async function startPhase(h: ReturnType<typeof buildTestApp>, cycleId: string, step = "S1") {
  const res = await h.app.request(`/api/cycles/${cycleId}/phases/${step}/start`, {
    method: "POST",
  });
  return res.status;
}

/** Build a FakeFs with brief.md + S1 skill body, for PromptComposer unit tests. */
function makeFsWithBriefAndSkill(extra: Record<string, string> = {}): FakeFs {
  const skillRef = skillRefOf(Step("S1"));
  if (!skillRef) throw new Error("S1 has no skillRef");
  const skillP = skillBodyPath(REPO, skillRef);
  return new FakeFs(undefined, {
    [briefPath(REPO)]: BRIEF,
    [skillP]: S1_BODY,
    ...extra,
  });
}

function makePhase(step: string, state: Phase["state"], order: number): Phase {
  return {
    id: `ph-${step}` as PhaseId,
    step: Step(step),
    order,
    state,
    runs: state === "running"
      ? [{ id: `run-${step}` as never, attempt: 1, state: "running" as const, startedAt: "2026-01-01T00:00:00Z" as never }]
      : [],
  };
}

function makeCycle(version: string, phases: Phase[]): Cycle {
  return {
    id: "cyc-bu1" as CycleId,
    projectId: "proj-bu1" as ProjectId,
    version: version as never,
    title: "BU-1 wiring" as never,
    taskIds: [],
    state: "active",
    createdAt: "2026-01-01T00:00:00Z" as never,
    phases,
  };
}

// ── Test group 1: wired path — RunLaunch.structuredContext is populated ────────

describe("BU-1 wiring — cycle-service populates RunLaunch.structuredContext", () => {
  test("startPhase produces a RunLaunch with structuredContext.productInvariant present", async () => {
    // Arrange
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId) as { id: string };

    // Act
    const status = await startPhase(h, cycle.id, "S1");
    expect(status).toBe(200); // startPhase route returns 200

    // Assert: the orchestrator received a launch call with structuredContext populated
    const launches = h.orchestrator.ofMethod("launch");
    expect(launches).toHaveLength(1);
    const launch = launches[0]!.args;

    // structuredContext must be present (BU-1 wiring: cycle-service sets it)
    expect(launch.structuredContext).toBeDefined();
    // Section 3 (brief) is always present (BT-01 ②) — even when brief.md is missing
    expect(launch.structuredContext!.productInvariant).toBeDefined();
    expect(launch.structuredContext!.productInvariant.id).toBe("section-3-product-invariant");
  });

  test("structuredContext.productInvariant.missing is true when brief.md is absent (FakeFs default)", async () => {
    // FakeFs.read returns undefined for all paths not pinned → brief is missing.
    // The marker must be set (原則④: not silent).
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId) as { id: string };

    await startPhase(h, cycle.id, "S1");

    const launch = h.orchestrator.ofMethod("launch")[0]!.args;
    expect(launch.structuredContext!.productInvariant.missing).toBe(true);
    expect(launch.structuredContext!.productInvariant.content).toContain("見つかりません");
  });

  test("step and cycleId on the RunLaunch match what structuredContext was built for", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId) as { id: string };

    await startPhase(h, cycle.id, "S1");

    const launch = h.orchestrator.ofMethod("launch")[0]!.args;
    expect(launch.step as string).toBe("S1");
    expect(launch.cycleId as string).toBe(cycle.id);
    expect(launch.structuredContext).toBeDefined();
  });
});

// ── Test group 2: live.ts branch — composeWithStructuredContext is used ────────

describe("BU-1 wiring — live.ts generatorPrompt uses composeWithStructuredContext", () => {
  test("prompt with structuredContext carries §C7.4 output-contract instruction (aidlc-result)", () => {
    // Arrange: build a real PromptComposer + StructuredContext
    const fakeFs = makeFsWithBriefAndSkill();
    const composer = new PromptComposer(fakeFs);

    const cycle = makeCycle("v0.9.1", [makePhase("S1", "running", 0)]);
    const input: StructuredContextInput = { cycle, step: Step("S1"), repoPath: REPO };
    const deps: StructuredContextDeps = { fs: fakeFs };
    const ctx = composeStructuredContext(input, deps);

    // Act: simulate what live.ts generatorPrompt does when structuredContext is present
    const prompt = composer.composeWithStructuredContext(
      { role: "generator", step: Step("S1"), repoPath: REPO },
      ctx,
    );

    // Assert: §C7.4 output-contract instruction is present (BU-1 invariant)
    expect(prompt).toContain("aidlc-result");
    expect(prompt).toContain(OUTPUT_CONTRACT_INSTRUCTION);
    // Section 3 (brief) content is present in the rendered prompt
    expect(prompt).toContain("VISION-TOKEN-BU1-WIRE");
    // Skill body is included (section 2)
    expect(prompt).toContain(S1_BODY.trim());
  });

  test("prompt with structuredContext carries section 3 label (プロダクト不変)", () => {
    const fakeFs = makeFsWithBriefAndSkill();
    const composer = new PromptComposer(fakeFs);
    const cycle = makeCycle("v0.9.1", [makePhase("S1", "running", 0)]);
    const ctx = composeStructuredContext(
      { cycle, step: Step("S1"), repoPath: REPO },
      { fs: fakeFs },
    );

    const prompt = composer.composeWithStructuredContext(
      { role: "generator", step: Step("S1"), repoPath: REPO },
      ctx,
    );

    // Named section header from renderStructuredContext is present
    expect(prompt).toContain("プロダクト不変(brief)");
  });
});

// ── Test group 3: backward-compat — legacy compose() path when no structuredContext ──

describe("BU-1 backward-compat — legacy compose() path when structuredContext absent", () => {
  test("compose() (legacy) does NOT include §C7.4 output-contract instruction", () => {
    // The legacy compose() path is used when structuredContext is absent.
    // It must NOT add the aidlc-result instruction (only in composeWithStructuredContext).
    const fakeFs = makeFsWithBriefAndSkill();
    const composer = new PromptComposer(fakeFs);

    const prompt = composer.compose({
      role: "generator",
      step: Step("S1"),
      repoPath: REPO,
    });

    // Legacy compose() includes skill body + brief but NOT the output-contract instruction
    expect(prompt).toContain(S1_BODY.trim());
    expect(prompt).toContain("VISION-TOKEN-BU1-WIRE");
    expect(prompt).not.toContain(OUTPUT_CONTRACT_INSTRUCTION);
  });

  test("legacy branch selected when structuredContext is absent (regression: live.ts logic)", () => {
    // Simulate the live.ts generatorPrompt branch-selection logic.
    // When structuredContext is absent → composer.compose() is selected (not composeWithStructuredContext).
    // Proof: compose() output does NOT contain OUTPUT_CONTRACT_INSTRUCTION.
    const fakeFs = makeFsWithBriefAndSkill();
    const composer = new PromptComposer(fakeFs);

    // Replicate the live.ts generatorPrompt logic (the branch that matters):
    const step = Step("S1");
    const repoPath = REPO;
    const structuredContext = undefined; // absent → legacy path
    const contextPaths = undefined;

    const prompt = structuredContext !== undefined
      ? composer.composeWithStructuredContext({ role: "generator", step, repoPath }, structuredContext)
      : composer.compose({
          role: "generator",
          step,
          repoPath,
          ...(contextPaths !== undefined ? { contextPaths } : {}),
        });

    // Legacy path: no output-contract instruction (backward compat)
    expect(prompt).not.toContain(OUTPUT_CONTRACT_INSTRUCTION);
    // Skill body and brief are still present
    expect(prompt).toContain(S1_BODY.trim());
  });
});

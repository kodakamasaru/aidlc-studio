// US-01 / Unit-01 — live-evidence hard gate (S8 integration).
// The evaluator's allow-done is a technical step's self-reported completion.
// Before the step is presented to the human (visual_review), EngineService.allowDone
// machine-verifies that the step's live evidence exists on disk via the injected
// EvidenceGatePort. Missing/stale/incomplete evidence → the run STALLS loud and NO
// review card is raised; valid evidence → the review is raised exactly as before.
//
// Driven end-to-end through the real services + ScriptedOrchestrator + EngineService,
// with a real FsEvidenceGate over a pinned FakeFs (so the adapter's parse/validation
// is exercised too). The deterministic harness omits the gate by default, so this is
// purely additive — it does not relax any existing gen→eval assertion.
import { describe, test, expect } from "bun:test";
import { buildLoopTestApp } from "../support/harness";
import { CycleService } from "../../src/app/services/cycle-service";
import { FakeFs } from "../../src/infra/sys/fakes";
import {
  FsEvidenceGate,
  evidenceManifestPath,
} from "../../src/infra/evidence/fs-evidence-gate";
import { openProject } from "../../src/domain/project/project";
import type { VisionRef, SkillRef } from "../../src/domain/project/project";
import { Step } from "../../src/domain/shared/vocab";
import { ProjectId } from "../../src/domain/shared/ids";
import { instant } from "../../src/domain/shared/primitives";
import { unwrap } from "../../src/domain/shared/result";

const PID = "p-evgate";
const REPO = "/repo/target";
const VERSION = "v0.0.2";
const MANIFEST_PATH = evidenceManifestPath(REPO, VERSION, "S1");

// Evidence captured well after the (2026-01-01) run start → time-valid.
const FRESH = "2026-06-20T00:00:00.000Z";
// Evidence captured before any run start → rejected as stale (reused old shot).
const STALE = "2025-01-01T00:00:00.000Z";

function manifest(forms: { kind: string; path: string; capturedAt: string }[]): string {
  return JSON.stringify({ step: "S1", forms });
}

function seedProjectWithVerification(
  ports: ReturnType<typeof buildLoopTestApp>["ports"],
): void {
  const project = unwrap(
    openProject({
      id: ProjectId(PID),
      repoPath: REPO,
      vision: "vision/brief.md" as unknown as VisionRef,
      pipelineDef: [
        {
          id: Step("S1"),
          label: "S1",
          order: 0,
          skillRef: "kit/skills/aidlc-s1" as unknown as SkillRef,
          contracts: {
            verification: { observations: ["一覧が表示される", "空状態が表示される"] },
            humanGate: { mode: "visual_review" },
            requiresLiveEvidence: true,
          },
        },
      ],
      env: {
        modelName: "claude",
        worktreeRoot: "/wt",
        stallTimeoutMin: 30,
        maxAttempt: 3,
      },
      createdAt: unwrap(instant("2026-06-11T00:00:00.000Z")),
    }),
  );
  ports.uow.run(() => ports.repos.projects.save(project));
}

/** Run gen→gate→eval to the evaluator's allow-done with a gate over `contents`. */
async function runToEval(contents?: Record<string, string>) {
  const gate =
    contents !== undefined
      ? new FsEvidenceGate(new FakeFs(undefined, contents))
      : undefined;
  const harness = buildLoopTestApp("gen-eval-complete", gate);
  seedProjectWithVerification(harness.ports);
  const cycles = new CycleService(harness.ports);
  const cycle = cycles.createCycle(PID, { title: "evgate", version: VERSION });
  await cycles.startPhase(cycle.id, "S1");
  return { harness, cycle: cycles.getCycle(cycle.id) };
}

function evaluator(cycle: Awaited<ReturnType<typeof runToEval>>["cycle"]) {
  return cycle.phases[0]!.runs.find((r) => r.role === "evaluator")!;
}

describe("US-01 live-evidence hard gate", () => {
  test("valid manifest (log + screenshot, fresh) → review raised, evaluator NOT stalled", async () => {
    const { harness, cycle } = await runToEval({
      [MANIFEST_PATH]: manifest([
        { kind: "log", path: "_evidence/S1/run.log", capturedAt: FRESH },
        { kind: "screenshot", path: "_evidence/S1/shot.png", capturedAt: FRESH },
      ]),
    });
    const ev = evaluator(cycle);
    expect(ev.state).not.toBe("stalled");
    const open = harness.ports.repos.questions
      .listByRun(ev.id)
      .filter((q) => q.state === "open");
    expect(open.some((q) => q.kind === "visual_review")).toBe(true);
  });

  test("missing manifest → evaluator stalls loud, NO review card", async () => {
    const { harness, cycle } = await runToEval({}); // gate installed, no manifest file
    const ev = evaluator(cycle);
    expect(ev.state).toBe("stalled");
    expect(ev.failureReason ?? "").toContain("live 証拠が不足");
    const reviews = harness.ports.repos.questions
      .listByRun(ev.id)
      .filter((q) => q.kind === "visual_review" && q.state === "open");
    expect(reviews.length).toBe(0);
  });

  test("log-only manifest → stalled, reason names the missing visual/operational form", async () => {
    const { cycle } = await runToEval({
      [MANIFEST_PATH]: manifest([
        { kind: "log", path: "_evidence/S1/run.log", capturedAt: FRESH },
      ]),
    });
    const ev = evaluator(cycle);
    expect(ev.state).toBe("stalled");
    expect(ev.failureReason ?? "").toContain("visual-or-operational");
  });

  test("stale evidence (captured before run start) → stalled (no reuse of old shots)", async () => {
    const { cycle } = await runToEval({
      [MANIFEST_PATH]: manifest([
        { kind: "log", path: "_evidence/S1/run.log", capturedAt: STALE },
        { kind: "screenshot", path: "_evidence/S1/shot.png", capturedAt: STALE },
      ]),
    });
    expect(evaluator(cycle).state).toBe("stalled");
  });

  test("no gate installed (deterministic harness) → review raised unchanged", async () => {
    const { harness, cycle } = await runToEval(undefined);
    const ev = evaluator(cycle);
    expect(ev.state).not.toBe("stalled");
    const open = harness.ports.repos.questions
      .listByRun(ev.id)
      .filter((q) => q.state === "open");
    expect(open.some((q) => q.kind === "visual_review")).toBe(true);
  });
});

// ── US-01 role-less done path (the default dogfood path) ────────────────────
// Default pipeline steps run role-less (no verification contract). The gate must
// fire on the role-less RunStateChanged→done too, scoped by requiresLiveEvidence.
import { EventApplier } from "../../src/app/services/event-applier";
import type { RunContext } from "../../src/app/ports/orchestrator";
import { startPhase as domainStartPhase } from "../../src/domain/cycle/cycle";
import { RunId } from "../../src/domain/shared/ids";

/**
 * Start S1 role-less, bypassing CycleService.generatorRoleFor (which now assigns
 * a generator role to any requiresLiveEvidence step). These tests exercise the
 * ROLE-LESS evidence gate in EventApplier in isolation, so the run must be
 * role-less even though the step carries requiresLiveEvidence — start it via the
 * domain command with no role and persist directly (no orchestrator launch).
 */
function startRoleLessS1(
  ports: ReturnType<typeof buildLoopTestApp>["ports"],
  cycleId: string,
): RunId {
  const cycle = ports.repos.cycles.findById(cycleId as never)!;
  const runId = ports.ids.runId();
  const started = unwrap(
    domainStartPhase(cycle, {
      step: Step("S1"),
      runId,
      startedAt: ports.clock.now(),
    }),
  );
  ports.uow.run(() => ports.repos.cycles.save(started));
  return runId;
}

function seedRoleLessProject(
  ports: ReturnType<typeof buildLoopTestApp>["ports"],
  requiresLiveEvidence: boolean,
): void {
  const project = unwrap(
    openProject({
      id: ProjectId(PID),
      repoPath: REPO,
      vision: "vision/brief.md" as unknown as VisionRef,
      pipelineDef: [
        {
          id: Step("S1"),
          label: "S1",
          order: 0,
          skillRef: "kit/skills/aidlc-s1" as unknown as SkillRef,
          // NO verification → role-less; technical-step flag toggles the gate.
          contracts: {
            humanGate: { mode: "device_check" },
            ...(requiresLiveEvidence ? { requiresLiveEvidence: true } : {}),
          },
        },
      ],
      env: { modelName: "claude", worktreeRoot: "/wt", stallTimeoutMin: 30, maxAttempt: 3 },
      createdAt: unwrap(instant("2026-06-11T00:00:00.000Z")),
    }),
  );
  ports.uow.run(() => ports.repos.projects.save(project));
}

async function roleLessRunReachingDone(opts: {
  contents?: Record<string, string>;
  requiresLiveEvidence: boolean;
}) {
  const gate =
    opts.contents !== undefined
      ? new FsEvidenceGate(new FakeFs(undefined, opts.contents))
      : undefined;
  const harness = buildLoopTestApp("happy", gate);
  seedRoleLessProject(harness.ports, opts.requiresLiveEvidence);
  const cycles = new CycleService(harness.ports);
  const cycle = cycles.createCycle(PID, { title: "roleless", version: VERSION });
  startRoleLessS1(harness.ports, cycle.id); // role-less running run
  const started = cycles.getCycle(cycle.id);
  const phase = started.phases[0]!;
  const run = phase.runs[0]!;
  const ctx: RunContext = {
    runId: run.id,
    projectId: ProjectId(PID),
    cycleId: cycle.id,
    phaseId: phase.id,
    step: Step("S1"),
  };
  // Simulate the orchestrator self-reporting done (no ResultEmitted).
  await new EventApplier(harness.ports).apply({
    ctx,
    event: { type: "RunStateChanged", runId: run.id, to: "done" },
  });
  const after = cycles.getCycle(cycle.id).phases[0]!.runs.find((r) => r.id === run.id)!;
  return after;
}

async function roleLessResultEmitted(opts: {
  contents?: Record<string, string>;
  requiresLiveEvidence: boolean;
}) {
  const gate =
    opts.contents !== undefined
      ? new FsEvidenceGate(new FakeFs(undefined, opts.contents))
      : undefined;
  const harness = buildLoopTestApp("happy", gate);
  seedRoleLessProject(harness.ports, opts.requiresLiveEvidence);
  const cycles = new CycleService(harness.ports);
  const cycle = cycles.createCycle(PID, { title: "roleless-review", version: VERSION });
  startRoleLessS1(harness.ports, cycle.id);
  const started = cycles.getCycle(cycle.id);
  const phase = started.phases[0]!;
  const run = phase.runs[0]!;
  const ctx: RunContext = {
    runId: run.id,
    projectId: ProjectId(PID),
    cycleId: cycle.id,
    phaseId: phase.id,
    step: Step("S1"),
  };
  // Role-less step emits its output → would raise a visual_review card.
  await new EventApplier(harness.ports).apply({
    ctx,
    event: { type: "ResultEmitted", runId: run.id, blocks: [] },
  });
  const after = cycles.getCycle(cycle.id).phases[0]!.runs.find((r) => r.id === run.id)!;
  const reviews = harness.ports.repos.questions
    .listByRun(run.id)
    .filter((q) => q.kind === "visual_review" && q.state === "open");
  return { run: after, reviewCount: reviews.length };
}

describe("US-01 role-less review gate (no review card without evidence)", () => {
  test("requiresLiveEvidence + no manifest → run stalls, NO review card raised", async () => {
    const { run, reviewCount } = await roleLessResultEmitted({
      contents: {},
      requiresLiveEvidence: true,
    });
    expect(run.state).toBe("stalled");
    expect(run.failureReason ?? "").toContain("live 証拠が不足");
    expect(reviewCount).toBe(0);
  });

  test("requiresLiveEvidence + valid manifest → review card raised", async () => {
    const { run, reviewCount } = await roleLessResultEmitted({
      contents: {
        [MANIFEST_PATH]: manifest([
          { kind: "log", path: "_evidence/S1/run.log", capturedAt: FRESH },
          { kind: "screenshot", path: "_evidence/S1/shot.png", capturedAt: FRESH },
        ]),
      },
      requiresLiveEvidence: true,
    });
    expect(run.state).not.toBe("stalled");
    expect(reviewCount).toBe(1);
  });

  test("non-technical step (no requiresLiveEvidence) → review raised, no gating", async () => {
    const { reviewCount } = await roleLessResultEmitted({
      contents: {},
      requiresLiveEvidence: false,
    });
    expect(reviewCount).toBe(1);
  });
});

describe("US-01 role-less done gate (event-applier / dogfood path)", () => {
  test("requiresLiveEvidence step + no manifest → done REJECTED (stalled)", async () => {
    const run = await roleLessRunReachingDone({ contents: {}, requiresLiveEvidence: true });
    expect(run.state).toBe("stalled");
    expect(run.failureReason ?? "").toContain("live 証拠が不足");
  });

  test("requiresLiveEvidence step + valid manifest → done allowed", async () => {
    const run = await roleLessRunReachingDone({
      contents: {
        [MANIFEST_PATH]: manifest([
          { kind: "log", path: "_evidence/S1/run.log", capturedAt: FRESH },
          { kind: "test-report", path: "_evidence/S1/report.json", capturedAt: FRESH },
        ]),
      },
      requiresLiveEvidence: true,
    });
    expect(run.state).toBe("done");
  });

  test("step NOT requiring evidence → done allowed even with no manifest (hearing/design)", async () => {
    const run = await roleLessRunReachingDone({ contents: {}, requiresLiveEvidence: false });
    expect(run.state).toBe("done");
  });
});

describe("FsEvidenceGate adapter (manifest parse/validation)", () => {
  const startedAt = unwrap(instant("2026-01-01T00:00:00.000Z"));
  const check = (raw: string | undefined) =>
    new FsEvidenceGate(
      new FakeFs(undefined, raw !== undefined ? { [MANIFEST_PATH]: raw } : {}),
    ).check({ repoPath: REPO, version: VERSION, step: "S1", runStartedAt: startedAt });

  test("missing file → blocked [manifest]", () => {
    expect(check(undefined)).toEqual({ eligibility: "blocked", missing: ["manifest"] });
  });

  test("invalid JSON → blocked [manifest-invalid]", () => {
    expect(check("{not json")).toEqual({
      eligibility: "blocked",
      missing: ["manifest-invalid"],
    });
  });

  test("forms not an array → blocked [manifest-invalid]", () => {
    expect(check(JSON.stringify({ step: "S1", forms: "nope" }))).toEqual({
      eligibility: "blocked",
      missing: ["manifest-invalid"],
    });
  });

  test("unknown evidence kind → blocked [manifest-invalid]", () => {
    expect(
      check(manifest([{ kind: "sketch", path: "x", capturedAt: FRESH }])),
    ).toEqual({ eligibility: "blocked", missing: ["manifest-invalid"] });
  });

  test("valid log + test-report (fresh) → eligible", () => {
    expect(
      check(
        manifest([
          { kind: "log", path: "_evidence/S1/run.log", capturedAt: FRESH },
          { kind: "test-report", path: "_evidence/S1/report.json", capturedAt: FRESH },
        ]),
      ),
    ).toEqual({ eligibility: "eligible", missing: [] });
  });
});

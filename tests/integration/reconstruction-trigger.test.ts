// Regression: reconstruction proposal auto-launch (US-08 AC-2) must fire ONLY on
// S1 確定 (the run reaching `done` = human approved) and NEVER from a reconstruction
// run itself. The live infinite loop was: a reconstruction run is itself a role-less
// S1 run, so its own role-less ResultEmitted re-triggered onRolelessResult → launch
// → ResultEmitted → … forever. (Scripted side-stepped it by emitting
// RunStateChanged(done) from a single-shot scenario; live emitted a plain
// ResultEmitted and recursed.) These tests pin the fixed trigger + recursion guard.
import { describe, test, expect } from "bun:test";
import { buildTestApp } from "../support/harness";
import { buildProject } from "./builders";
import { EngineService } from "../../src/app/services/engine-service";
import { ProjectId, CycleId, PhaseId, RunId } from "../../src/domain/shared/ids";
import { Step } from "../../src/domain/shared/vocab";
import { unwrap } from "../../src/domain/shared/result";
import { instant } from "../../src/domain/shared/primitives";
import {
  createCycle as domainCreateCycle,
  startPhase as domainStartPhase,
  version,
} from "../../src/domain/cycle/cycle";
import type { RunContext } from "../../src/app/ports/orchestrator";

const T0 = unwrap(instant("2026-01-01T00:00:00.000Z"));

/**
 * Seed a project + a cycle whose S1 phase has a single ROLE-LESS running run
 * (domainStartPhase assigns no role — the app layer is what tags generator/eval).
 * Returns the EngineService, the S1 run's RunContext, and a reconstruction-launch
 * counter reading the RecordingOrchestrator.
 */
function setup() {
  const { ports, orchestrator } = buildTestApp();
  const PID = "proj-recon-trig";
  ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));

  const CID = CycleId("cyc-recon-trig");
  const cycle = unwrap(
    domainCreateCycle({
      id: CID,
      projectId: ProjectId(PID),
      version: unwrap(version("v1.0.0")),
      title: "recon trigger",
      taskIds: [],
      createdAt: T0,
      pipeline: [
        { phaseId: PhaseId("ph-s1-rt"), step: Step("S1") },
        { phaseId: PhaseId("ph-s6-rt"), step: Step("S6") },
      ],
    }),
  );
  const started = unwrap(
    domainStartPhase(cycle, { step: Step("S1"), runId: RunId("run-s1-orig"), startedAt: T0 }),
  );
  ports.uow.run(() => ports.repos.cycles.save(started));

  const engine = new EngineService(ports);
  const ctx: RunContext = {
    runId: RunId("run-s1-orig"),
    projectId: ProjectId(PID),
    cycleId: CID,
    phaseId: PhaseId("ph-s1-rt"),
    step: Step("S1"),
  };
  const reconLaunches = () =>
    orchestrator
      .ofMethod("launch")
      .filter((c) => c.args.hearingScope === "reconstruction");
  return { engine, ctx, reconLaunches };
}

describe("reconstruction trigger — S1 確定 only + recursion guard (live loop fix)", () => {
  test("role-less S1 ResultEmitted does NOT launch reconstruction (pre-approval)", async () => {
    const { engine, ctx, reconLaunches } = setup();

    // The pre-approval review-waiting result must not start a reconstruction run —
    // that (plus self-recursion) was the live loop.
    await engine.handle({
      ctx,
      event: { type: "ResultEmitted", runId: ctx.runId, blocks: [] },
    });

    expect(reconLaunches()).toHaveLength(0);
  });

  test("S1 確定 (RunStateChanged done) launches reconstruction exactly once", async () => {
    const { engine, ctx, reconLaunches } = setup();

    await engine.handle({
      ctx,
      event: { type: "RunStateChanged", runId: ctx.runId, to: "done" },
    });

    expect(reconLaunches()).toHaveLength(1);
    expect(reconLaunches()[0]!.args.step).toBe(Step("S1"));
  });

  test("a reconstruction run reaching done does NOT re-launch (recursion guard)", async () => {
    const { engine, ctx, reconLaunches } = setup();

    // S1 確定 → exactly one reconstruction run launched.
    await engine.handle({
      ctx,
      event: { type: "RunStateChanged", runId: ctx.runId, to: "done" },
    });
    expect(reconLaunches()).toHaveLength(1);
    const reconRunId = reconLaunches()[0]!.args.runId;

    // The reconstruction run is itself a role-less S1 run; when the human approves
    // it, it reaches done. It must NOT spawn another reconstruction (the loop).
    await engine.handle({
      ctx: { ...ctx, runId: reconRunId },
      event: { type: "RunStateChanged", runId: reconRunId, to: "done" },
    });

    expect(reconLaunches()).toHaveLength(1); // still 1 — guard held
  });
});

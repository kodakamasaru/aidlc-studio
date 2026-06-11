import { test, expect, describe } from "bun:test";
import { unwrap } from "../shared/result";
import { instant } from "../shared/primitives";
import { Step } from "../shared/vocab";
import { CycleId, ProjectId, PhaseId, RunId } from "../shared/ids";
import {
  type Cycle,
  createCycle,
  startPhase,
  advanceRun,
  launchEval,
  version,
  latestRun,
} from "./cycle";

const at = unwrap(instant("2026-06-11T00:00:00Z"));

const newCycle = (): Cycle =>
  unwrap(
    createCycle({
      id: CycleId("c1"),
      projectId: ProjectId("p1"),
      version: unwrap(version("v0.0.2")),
      title: "S7 cycle",
      taskIds: [],
      createdAt: at,
      pipeline: [{ phaseId: PhaseId("ph1"), step: Step("S7") }],
    }),
  );

describe("Run.role is optional (backward compatible)", () => {
  test("startPhase without role leaves role undefined (従来動作)", () => {
    const c = unwrap(startPhase(newCycle(), { step: Step("S7"), runId: RunId("r1"), startedAt: at }));
    expect(c.phases[0]!.runs[0]!.role).toBeUndefined();
  });

  test("startPhase tags the generator run when role is given", () => {
    const c = unwrap(
      startPhase(newCycle(), {
        step: Step("S7"),
        runId: RunId("r1"),
        startedAt: at,
        role: "generator",
      }),
    );
    expect(c.phases[0]!.runs[0]!.role).toBe("generator");
  });
});

describe("launchEval (S6 run-role: gen と eval は別 Run、runs[] に並ぶ)", () => {
  test("appends a running evaluator run after the generator is done", () => {
    let c = unwrap(
      startPhase(newCycle(), { step: Step("S7"), runId: RunId("gen"), startedAt: at, role: "generator" }),
    );
    c = unwrap(advanceRun(c, { runId: RunId("gen"), to: "done", at })); // gate pass は app 前提
    c = unwrap(launchEval(c, { step: Step("S7"), runId: RunId("ev"), startedAt: at }));

    const phase = c.phases[0]!;
    expect(phase.runs).toHaveLength(2);
    expect(phase.runs.map((r) => r.role)).toEqual(["generator", "evaluator"]);
    expect(latestRun(phase)!.id as string).toBe("ev");
    expect(latestRun(phase)!.state).toBe("running");
    expect(phase.state).toBe("running");
  });

  test("rejects when a run is still running (INV-2: running は高々 1)", () => {
    const c = unwrap(
      startPhase(newCycle(), { step: Step("S7"), runId: RunId("gen"), startedAt: at, role: "generator" }),
    );
    const res = launchEval(c, { step: Step("S7"), runId: RunId("ev"), startedAt: at });
    expect(res).toEqual({ ok: false, error: "PhaseAlreadyRunning" });
  });

  test("rejects when there is no prior generator run (RunNotFound)", () => {
    const res = launchEval(newCycle(), { step: Step("S7"), runId: RunId("ev"), startedAt: at });
    expect(res).toEqual({ ok: false, error: "RunNotFound" });
  });
});

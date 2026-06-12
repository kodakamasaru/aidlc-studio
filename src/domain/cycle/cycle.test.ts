import { test, expect, describe } from "bun:test";
import { unwrap, isErr } from "../shared/result";
import { instant } from "../shared/primitives";
import { Step, SkillRef, sameStep } from "../shared/vocab";
import type { StepDefSnapshot } from "../project/project";
import { CycleId, ProjectId, PhaseId, RunId } from "../shared/ids";
import {
  type Cycle,
  version,
  createCycle,
  startPhase,
  relaunchPhase,
  advanceRun,
  resumeRun,
  retryRun,
  approvePhase,
  backtrackTo,
  pauseCycle,
  resumeCycle,
  completeCycle,
  latestRun,
  runningPhase,
} from "./cycle";

const at = (h: number) =>
  unwrap(instant(`2026-06-06T0${h}:00:00Z`));

const pipeline = [
  { phaseId: PhaseId("ph-s5"), step: Step("S5") },
  { phaseId: PhaseId("ph-s6"), step: Step("S6") },
  { phaseId: PhaseId("ph-s7"), step: Step("S7") },
];

const fresh = (): Cycle =>
  unwrap(
    createCycle({
      id: CycleId("cyc-1"),
      projectId: ProjectId("prj-1"),
      version: unwrap(version("v0.0.1")),
      title: "first cycle",
      taskIds: [],
      createdAt: at(0),
      pipeline,
    }),
  );

/** S5/S6 を done まで進めた Cycle(S7 が pending、prev=S6 done)。 */
const advancedToS7Pending = (): Cycle => {
  let c = fresh();
  c = unwrap(startPhase(c, { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }));
  c = unwrap(advanceRun(c, { runId: RunId("r1"), to: "done", at: at(2) }));
  c = unwrap(approvePhase(c, { phaseId: PhaseId("ph-s5"), allTaskReviewsApproved: true }));
  c = unwrap(startPhase(c, { step: Step("S6"), runId: RunId("r2"), startedAt: at(3) }));
  c = unwrap(advanceRun(c, { runId: RunId("r2"), to: "done", at: at(4) }));
  c = unwrap(approvePhase(c, { phaseId: PhaseId("ph-s6"), allTaskReviewsApproved: true }));
  return c;
};

describe("createCycle", () => {
  test("instantiates pending phases from the pipeline in order, planned", () => {
    const c = fresh();
    expect(c.state).toBe("planned");
    expect(c.phases.map((p) => p.step as string)).toEqual(["S5", "S6", "S7"]);
    expect(c.phases.map((p) => p.order)).toEqual([0, 1, 2]);
    expect(c.phases.every((p) => p.state === "pending")).toBe(true);
  });

  test("omitting stepDef leaves Phase.stepDef undefined (backward compatible / INV-S3)", () => {
    const c = fresh();
    expect(c.phases.every((p) => p.stepDef === undefined)).toBe(true);
  });

  test("pins the provided StepDef snapshot onto the matching Phase (INV-S1, copy-through)", () => {
    const snapshot: StepDefSnapshot = {
      label: "ドメインモデル",
      order: 0,
      skillRef: SkillRef("aidlc-s6-domain-model"),
      contracts: { humanGate: { mode: "none" } },
    };
    const c = unwrap(
      createCycle({
        id: CycleId("cyc-2"),
        projectId: ProjectId("prj-1"),
        version: unwrap(version("v0.0.3")),
        title: "snapshot cycle",
        taskIds: [],
        createdAt: at(0),
        pipeline: [
          { phaseId: PhaseId("ph-s6"), step: Step("S6"), stepDef: snapshot },
          { phaseId: PhaseId("ph-s7"), step: Step("S7") },
        ],
      }),
    );
    const s6 = c.phases.find((p) => sameStep(p.step, Step("S6")));
    const s7 = c.phases.find((p) => sameStep(p.step, Step("S7")));
    expect(s6?.stepDef).toEqual(snapshot);
    expect(s7?.stepDef).toBeUndefined();
  });

  test("rejects empty title and empty pipeline", () => {
    const base = {
      id: CycleId("c"),
      projectId: ProjectId("p"),
      version: unwrap(version("v1.0.0")),
      taskIds: [],
      createdAt: at(0),
    };
    expect(createCycle({ ...base, title: "  ", pipeline })).toEqual({
      ok: false,
      error: "EmptyTitle",
    });
    expect(createCycle({ ...base, title: "ok", pipeline: [] })).toEqual({
      ok: false,
      error: "EmptyPipeline",
    });
  });

  test("version VO rejects non-SemVer form", () => {
    expect(isErr(version("1.0"))).toBe(true);
    expect(isErr(version("v1.2"))).toBe(true);
    expect(unwrap(version("v10.20.30")) as string).toBe("v10.20.30");
  });
});

describe("startPhase (INV-2 / INV-4)", () => {
  test("starts first phase, creates attempt=1 run, activates cycle", () => {
    const c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    expect(c.state).toBe("active");
    const s5 = c.phases[0]!;
    expect(s5.state).toBe("running");
    expect(latestRun(s5)).toMatchObject({ attempt: 1, state: "running" });
    expect(runningPhase(c)?.step as string).toBe("S5");
  });

  test("cannot start a phase whose previous phase is not done (PrevPhaseNotDone)", () => {
    expect(
      startPhase(fresh(), { step: Step("S6"), runId: RunId("r"), startedAt: at(1) }),
    ).toEqual({ ok: false, error: "PrevPhaseNotDone" });
  });

  test("cannot start an already-running phase (PhaseAlreadyRunning)", () => {
    const c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    expect(
      startPhase(c, { step: Step("S5"), runId: RunId("r1b"), startedAt: at(2) }),
    ).toEqual({ ok: false, error: "PhaseAlreadyRunning" });
  });

  test("cannot start when cycle is paused (CyclePaused)", () => {
    let c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    c = unwrap(pauseCycle(c));
    expect(
      startPhase(c, { step: Step("S6"), runId: RunId("r2"), startedAt: at(2) }),
    ).toEqual({ ok: false, error: "CyclePaused" });
  });

  test("unknown step is StepNotInPipeline", () => {
    expect(
      startPhase(fresh(), { step: Step("SX"), runId: RunId("r"), startedAt: at(1) }),
    ).toEqual({ ok: false, error: "StepNotInPipeline" });
  });
});

describe("advanceRun (INV-5)", () => {
  test("running->done moves phase to review and records endedAt", () => {
    let c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    c = unwrap(advanceRun(c, { runId: RunId("r1"), to: "done", at: at(2) }));
    const s5 = c.phases[0]!;
    expect(s5.state).toBe("review");
    expect(latestRun(s5)).toMatchObject({ state: "done", endedAt: at(2) });
  });

  test("running->stalled keeps phase running (waiting != stalled)", () => {
    let c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    c = unwrap(advanceRun(c, { runId: RunId("r1"), to: "stalled", at: at(2) }));
    expect(c.phases[0]!.state).toBe("running");
    expect(latestRun(c.phases[0]!)?.endedAt).toBeUndefined();
  });

  test("done->running is rejected (IllegalTransition)", () => {
    let c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    c = unwrap(advanceRun(c, { runId: RunId("r1"), to: "done", at: at(2) }));
    expect(advanceRun(c, { runId: RunId("r1"), to: "failed", at: at(3) })).toEqual({
      ok: false,
      error: "IllegalTransition",
    });
  });

  test("unknown run is RunNotFound", () => {
    expect(
      advanceRun(fresh(), { runId: RunId("nope"), to: "done", at: at(2) }),
    ).toEqual({ ok: false, error: "RunNotFound" });
  });
});

describe("resumeRun vs retryRun (cycle Q-02)", () => {
  test("resumeRun continues the SAME run (stalled->running), no new attempt", () => {
    let c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    c = unwrap(advanceRun(c, { runId: RunId("r1"), to: "stalled", at: at(2) }));
    c = unwrap(resumeRun(c, RunId("r1")));
    expect(c.phases[0]!.runs).toHaveLength(1);
    expect(latestRun(c.phases[0]!)).toMatchObject({ attempt: 1, state: "running" });
  });

  test("resumeRun rejects a non-stalled run (RunNotResumable)", () => {
    const c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    expect(resumeRun(c, RunId("r1"))).toEqual({ ok: false, error: "RunNotResumable" });
  });

  test("retryRun spawns attempt+1 as a NEW run, old run stays terminal", () => {
    let c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    c = unwrap(advanceRun(c, { runId: RunId("r1"), to: "failed", at: at(2) }));
    c = unwrap(
      retryRun(c, { runId: RunId("r1"), newRunId: RunId("r1b"), startedAt: at(3), maxAttempt: 3 }),
    );
    const s5 = c.phases[0]!;
    expect(s5.runs).toHaveLength(2);
    expect(s5.runs[0]).toMatchObject({ attempt: 1, state: "failed" });
    expect(latestRun(s5)).toMatchObject({ attempt: 2, state: "running" });
    expect(s5.state).toBe("running");
  });

  test("retryRun on a running run is rejected (RunNotFailedOrStalled)", () => {
    const c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    expect(
      retryRun(c, { runId: RunId("r1"), newRunId: RunId("x"), startedAt: at(2), maxAttempt: 3 }),
    ).toEqual({ ok: false, error: "RunNotFailedOrStalled" });
  });

  test("retryRun enforces maxAttempt (MaxAttemptExceeded)", () => {
    let c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    c = unwrap(advanceRun(c, { runId: RunId("r1"), to: "failed", at: at(2) }));
    expect(
      retryRun(c, { runId: RunId("r1"), newRunId: RunId("x"), startedAt: at(3), maxAttempt: 1 }),
    ).toEqual({ ok: false, error: "MaxAttemptExceeded" });
  });
});

describe("approvePhase (INV-10: review gate)", () => {
  test("review->done only when all task reviews approved", () => {
    let c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    c = unwrap(advanceRun(c, { runId: RunId("r1"), to: "done", at: at(2) }));
    expect(
      approvePhase(c, { phaseId: PhaseId("ph-s5"), allTaskReviewsApproved: false }),
    ).toEqual({ ok: false, error: "TaskReviewsPending" });
    c = unwrap(approvePhase(c, { phaseId: PhaseId("ph-s5"), allTaskReviewsApproved: true }));
    expect(c.phases[0]!.state).toBe("done");
  });

  test("approving a phase not in review is rejected (PhaseNotInReview)", () => {
    expect(
      approvePhase(fresh(), { phaseId: PhaseId("ph-s5"), allTaskReviewsApproved: true }),
    ).toEqual({ ok: false, error: "PhaseNotInReview" });
  });
});

describe("backtrackTo (INV-7: rewind + preserve history)", () => {
  test("target step -> running, subsequent -> pending, prior runs preserved", () => {
    const c = advancedToS7Pending();
    // S5 done, S6 done, S7 pending. Backtrack to S5.
    const back = unwrap(backtrackTo(c, { step: Step("S5"), reason: "redo domain" }));
    expect(back.phases[0]!.state).toBe("running"); // S5
    expect(back.phases[1]!.state).toBe("pending"); // S6 rewound
    expect(back.phases[2]!.state).toBe("pending"); // S7
    // history preserved: S5's run is still there
    expect(back.phases[0]!.runs).toHaveLength(1);
    expect(back.phases[1]!.runs).toHaveLength(1);
    expect(back.state).toBe("active");
  });

  test("unknown step is StepNotInPipeline", () => {
    expect(backtrackTo(fresh(), { step: Step("SX"), reason: "x" })).toEqual({
      ok: false,
      error: "StepNotInPipeline",
    });
  });
});

describe("relaunchPhase (re-run a backtrack-rewound phase)", () => {
  /** S5 done → backtrack to S5: S5 is "running" with only a terminal run. */
  const rewoundAtS5 = (): Cycle => {
    let c = fresh();
    c = unwrap(startPhase(c, { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }));
    c = unwrap(advanceRun(c, { runId: RunId("r1"), to: "done", at: at(2) }));
    return unwrap(backtrackTo(c, { step: Step("S5"), reason: "redo S5" }));
  };

  test("appends a fresh attempt run and keeps history on the rewound phase", () => {
    const out = unwrap(
      relaunchPhase(rewoundAtS5(), {
        step: Step("S5"),
        runId: RunId("r1b"),
        startedAt: at(3),
      }),
    );
    const s5 = out.phases[0]!;
    expect(s5.state).toBe("running");
    expect(s5.runs).toHaveLength(2); // history preserved + the new run
    const fresh2 = latestRun(s5)!;
    expect(fresh2.id).toBe(RunId("r1b"));
    expect(fresh2.attempt).toBe(2);
    expect(fresh2.state).toBe("running");
    expect(out.state).toBe("active");
  });

  test("rejects a phase that still has a live run (PhaseAlreadyRunning)", () => {
    // S5 freshly started: phase running WITH a running run — not a rewind.
    const c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    expect(
      relaunchPhase(c, { step: Step("S5"), runId: RunId("r1b"), startedAt: at(2) }),
    ).toEqual({ ok: false, error: "PhaseAlreadyRunning" });
  });

  test("rejects a non-rewound (pending) phase (PhaseNotRewound)", () => {
    expect(
      relaunchPhase(fresh(), { step: Step("S5"), runId: RunId("r"), startedAt: at(1) }),
    ).toEqual({ ok: false, error: "PhaseNotRewound" });
  });

  test("unknown step is StepNotInPipeline", () => {
    expect(
      relaunchPhase(rewoundAtS5(), { step: Step("SX"), runId: RunId("r"), startedAt: at(3) }),
    ).toEqual({ ok: false, error: "StepNotInPipeline" });
  });
});

describe("pause / resume / complete", () => {
  test("pause then resume toggles state, double-pause is AlreadyInState", () => {
    let c = unwrap(
      startPhase(fresh(), { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) }),
    );
    c = unwrap(pauseCycle(c));
    expect(c.state).toBe("paused");
    expect(pauseCycle(c)).toEqual({ ok: false, error: "AlreadyInState" });
    c = unwrap(resumeCycle(c));
    expect(c.state).toBe("active");
  });

  test("completeCycle requires all phases done (PhasesNotAllDone)", () => {
    const c = advancedToS7Pending();
    expect(completeCycle(c)).toEqual({ ok: false, error: "PhasesNotAllDone" });
  });

  test("completeCycle succeeds once every phase is done", () => {
    let c = advancedToS7Pending();
    c = unwrap(startPhase(c, { step: Step("S7"), runId: RunId("r3"), startedAt: at(5) }));
    c = unwrap(advanceRun(c, { runId: RunId("r3"), to: "done", at: at(6) }));
    c = unwrap(approvePhase(c, { phaseId: PhaseId("ph-s7"), allTaskReviewsApproved: true }));
    c = unwrap(completeCycle(c));
    expect(c.state).toBe("done");
  });
});

describe("immutability (D-03)", () => {
  test("commands never mutate the input cycle", () => {
    const c0 = fresh();
    const snapshot = JSON.stringify(c0);
    startPhase(c0, { step: Step("S5"), runId: RunId("r1"), startedAt: at(1) });
    expect(JSON.stringify(c0)).toBe(snapshot);
  });
});

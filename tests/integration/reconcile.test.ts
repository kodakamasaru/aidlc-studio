// Startup reconcile (real-DB): a run left "running" at boot is orphaned — its
// in-process stall timer died with the previous process — so reconcileRunningRuns
// must drive it to "stalled" (retriable), leaving done/pending runs untouched.
import { test, expect, describe, beforeEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { openDb } from "../../src/infra/db/open";
import { buildStore } from "../../src/infra/db/store";
import type { Store } from "../../src/infra/db/store";
import { SystemClock } from "../../src/infra/sys/clock";
import { reconcileRunningRuns } from "../../src/app/services/reconcile";
import {
  createCycle,
  startPhase,
  latestRun,
  version,
  type Cycle,
} from "../../src/domain/cycle/cycle";
import { ProjectId, CycleId, PhaseId, RunId } from "../../src/domain/shared/ids";
import { Step } from "../../src/domain/shared/vocab";
import { T0 } from "./builders";

function unwrap<T>(
  r: { ok: true; value: T } | { ok: false; error: unknown },
): T {
  if (!r.ok) throw new Error(`unwrap: ${String(r.error)}`);
  return r.value;
}

/** A cycle whose first phase has a single "running" run (S1 started, not advanced). */
function cycleWithRunningRun(cycleId: string): Cycle {
  const created = unwrap(
    createCycle({
      id: CycleId(cycleId),
      projectId: ProjectId("p1"),
      version: unwrap(version("v0.1.4")),
      title: "stuck cycle",
      taskIds: [],
      createdAt: T0,
      pipeline: [
        { phaseId: PhaseId(`${cycleId}-p1`), step: Step("S1") },
        { phaseId: PhaseId(`${cycleId}-p2`), step: Step("S6") },
      ],
    }),
  );
  return unwrap(
    startPhase(created, {
      step: Step("S1"),
      runId: RunId(`${cycleId}-r1`),
      startedAt: T0,
    }),
  );
}

let db: Database;
let store: Store;

beforeEach(() => {
  db = openDb(":memory:");
  store = buildStore(db);
});

const ports = () => ({
  clock: new SystemClock(),
  uow: store.uow,
  repos: store.repos,
});

describe("reconcileRunningRuns", () => {
  test("drives an orphaned running run to stalled with a reason", () => {
    store.repos.cycles.save(cycleWithRunningRun("c-stuck"));

    const recovered = reconcileRunningRuns(ports());

    expect(recovered).toBe(1);
    const after = store.repos.cycles.findById(CycleId("c-stuck"))!;
    const phase = after.phases.find((p) => p.step === ("S1" as Step))!;
    const run = latestRun(phase)!;
    expect(run.state).toBe("stalled");
    expect(run.failureReason ?? "").toContain("サーバ再起動");
    // The phase itself stays "running" (only the run stalled) — same shape as a
    // live timeout, so the existing stall→retry surface applies unchanged.
    expect(phase.state).toBe("running");
  });

  test("no-ops when nothing is running (idempotent on a clean DB)", () => {
    expect(reconcileRunningRuns(ports())).toBe(0);

    // Re-running after a recovery finds nothing left to do.
    store.repos.cycles.save(cycleWithRunningRun("c-stuck"));
    expect(reconcileRunningRuns(ports())).toBe(1);
    expect(reconcileRunningRuns(ports())).toBe(0);
  });
});

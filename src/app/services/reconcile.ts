// reconcileRunningRuns — startup recovery for orphaned "running" runs.
//
// Live stall/error detection is an IN-PROCESS setTimeout inside the orchestrator
// (infra/orchestrator/live.ts): on timeout it kills the child and emits
// `stalled`. If the server process dies mid-run — a crash, or `bun --watch`
// restarting on a source edit — that timer AND the spawned child vanish, but the
// DB row stays "running" with no live process behind it. Nothing remains to drive
// it to a terminal/stall state, so the run is stuck forever and the UI offers no
// retry (retry only surfaces on stalled/failed). compensate.ts covers the
// launch-throw phantom; this is its startup analogue: on boot EVERY "running" run
// is by definition orphaned (a fresh process holds no live children), so we drive
// them all to "stalled" — the retriable surface — in their own transaction.
import type { Ports } from "../ports/composition";
import { advanceRun, type Cycle } from "../../domain/cycle/cycle";
import { isOk } from "../../domain/shared/result";
import { logError, logInfo } from "../../infra/log";

type ReconcilePorts = Pick<Ports, "clock" | "uow" | "repos">;

/** Human-readable cause attached to each recovered run, shown on the stall card. */
const STALL_REASON =
  "サーバ再起動により実行が中断されました。retry で再開してください。";

/**
 * Drive every "running" run to "stalled". Returns the count recovered.
 * Best-effort: a per-cycle domain/save error is logged and skipped, never thrown
 * — one bad cycle must not block the server from starting.
 */
export function reconcileRunningRuns(ports: ReconcilePorts): number {
  const at = ports.clock.now();
  let recovered = 0;

  for (const cycle of ports.repos.cycles.listAll()) {
    const runningRunIds = cycle.phases.flatMap((p) =>
      p.runs.filter((r) => r.state === "running").map((r) => r.id),
    );
    if (runningRunIds.length === 0) continue;

    let next: Cycle = cycle;
    let changed = 0;
    for (const runId of runningRunIds) {
      const advanced = advanceRun(next, {
        runId,
        to: "stalled",
        at,
        reason: STALL_REASON,
      });
      if (isOk(advanced)) {
        next = advanced.value;
        changed++;
      } else {
        logError("reconcileRunningRuns: advanceRun failed", {
          cycleId: cycle.id,
          runId,
          error: advanced.error,
        });
      }
    }
    if (changed === 0) continue;

    try {
      ports.uow.run(() => ports.repos.cycles.save(next));
      recovered += changed;
    } catch (err) {
      logError("reconcileRunningRuns: save failed", { cycleId: cycle.id, err });
    }
  }

  if (recovered > 0) {
    logInfo("reconcileRunningRuns: recovered orphaned running runs", {
      recovered,
    });
  }
  return recovered;
}

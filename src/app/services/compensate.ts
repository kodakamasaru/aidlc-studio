// compensateRun — best-effort saga compensation. Orchestrator calls happen AFTER
// the DB commit (S7 D-04), so if the orchestrator throws the run is already
// persisted as "running" with no live process behind it. This drives that run to
// a recoverable terminal/stall state ("failed" | "stalled") in its OWN
// transaction, so the loop never gets stuck on a phantom "running". Secondary
// errors (cycle vanished, illegal transition) are swallowed+logged: compensation
// is best-effort and must not mask the original 502. The optional `reason` is
// recorded on the run as `failureReason` so the UI shows the REAL cause of the
// launch/retry failure instead of a generic "Run が失敗しました。".
import type { Ports } from "../ports/composition";
import { advanceRun } from "../../domain/cycle/cycle";
import type { CycleId, RunId } from "../../domain/shared/ids";
import { isOk } from "../../domain/shared/result";
import { logError } from "../../infra/log";

type CompensatePorts = Pick<Ports, "clock" | "uow" | "repos">;

export function compensateRun(
  ports: CompensatePorts,
  cycleId: CycleId,
  runId: RunId,
  to: "failed" | "stalled",
  reason?: string,
): void {
  try {
    const cycle = ports.repos.cycles.findById(cycleId);
    if (!cycle) {
      logError("compensateRun: cycle not found", { cycleId, runId });
      return;
    }
    const advanced = advanceRun(cycle, {
      runId,
      to,
      at: ports.clock.now(),
      ...(reason !== undefined ? { reason } : {}),
    });
    if (isOk(advanced)) {
      ports.uow.run(() => ports.repos.cycles.save(advanced.value));
    } else {
      logError("compensateRun: advanceRun failed", {
        runId,
        to,
        error: advanced.error,
      });
    }
  } catch (err) {
    logError("compensateRun: unexpected failure", err);
  }
}

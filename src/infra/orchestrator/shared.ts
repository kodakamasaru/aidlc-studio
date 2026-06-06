// Shared building blocks for the OrchestratorPort adapters (scripted + live).
// Both adapters derive a context-tagged RunContext from a launch/retry command;
// this is the single source of that mapping so the two stay in lockstep.
import type { RetryLaunch, RunContext } from "../../app/ports/orchestrator";
import type { RunId } from "../../domain/shared/ids";

/** A launch/retry command minus its id fields — the shared context source. */
export type LaunchLike = Omit<RetryLaunch, "newRunId" | "runId">;

/** Build the RunContext for `runId` from the command's project/cycle/phase/step. */
export function buildRunContext(cmd: LaunchLike, runId: RunId): RunContext {
  return {
    runId,
    projectId: cmd.projectId,
    cycleId: cmd.cycleId,
    phaseId: cmd.phaseId,
    step: cmd.step,
  };
}

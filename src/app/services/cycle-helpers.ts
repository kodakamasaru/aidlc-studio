// Shared cycle navigation helpers used by more than one service.
import { fail } from "./errors";
import type { Cycle, Phase } from "../../domain/cycle/cycle";
import type { RunId } from "../../domain/shared/ids";

/**
 * Find the phase that currently owns `runId` (for orchestrator phaseId/step).
 * Throws a 404 RunNotFound ServiceError when no phase holds the run.
 */
export function locatePhaseOfRun(cycle: Cycle, runId: RunId): Phase {
  const phase = cycle.phases.find((p) => p.runs.some((r) => r.id === runId));
  if (!phase) throw fail(404, "RunNotFound");
  return phase;
}

// US-08: launch the reconstruction-proposal run when S1 is 確定. SHARED by the two
// confirmation paths so reconstruction fires no matter how S1 concludes:
//   - EngineService.react      — the AI emits aidlc-result status:"done"
//   - InboxService.finalizeApprovedReview — the human approves the S1 visual_review
// finalizeApprovedReview writes the cycle straight to the DB (restart-safe) and does
// NOT go through the engine sink, so without this shared call reconstruction would
// only fire on the AI-done path and never in the normal human-in-the-loop flow
// (S10 実機 F-12: 人間が S1 を承認しても再構成が起動しない).
//
// Idempotency / recursion guard is DB-based (restart-safe and self-recursion-proof):
// a reconstruction run emits ReconstructionProposalEmitted — which SAVES a proposal
// for the cycle — BEFORE its terminal `done`. So by the time that `done` re-enters a
// confirmation path, a proposal already exists for the cycle and the launch is
// skipped. No in-memory per-run set needed.
import type { Ports } from "../ports/composition";
import type { Cycle } from "../../domain/cycle/cycle";
import { sameStep, type Step } from "../../domain/shared/vocab";
import type { PhaseId } from "../../domain/shared/ids";
import { logError } from "../../infra/log";

export async function launchReconstructionForS1(
  ports: Ports,
  cycle: Cycle,
  step: Step,
  fallbackPhaseId: PhaseId,
): Promise<void> {
  // Reconstruction is the S1-確定 trigger only (US-08 AC-2).
  if (!sameStep(step, "S1" as Step)) return;
  // Idempotency + recursion guard: a proposal already exists → it already ran.
  if (ports.repos.reconstructionProposals.find(cycle.id) !== undefined) return;

  const project = ports.repos.projects.findById(cycle.projectId);
  if (!project) return;

  const runId = ports.ids.runId();
  const phaseId =
    cycle.phases.find((p) => sameStep(p.step, "S1" as Step))?.id ?? fallbackPhaseId;
  try {
    await ports.orchestrator.launch({
      runId,
      projectId: cycle.projectId,
      cycleId: cycle.id,
      phaseId,
      step,
      repoPath: project.repoPath,
      hearingScope: "reconstruction",
    });
  } catch (err) {
    // Best-effort: a failed reconstruction launch must not break S1 completion.
    logError("launchReconstructionForS1: reconstruction launch failed", {
      cycleId: cycle.id as string,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

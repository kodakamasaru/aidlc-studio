// US-01 live-evidence gate — shared check used at BOTH done chokepoints:
//   - event-applier: role-less run reaching done (RunStateChanged→done)
//   - engine-service: gen→eval evaluator allow-done
// so a technical step (contracts.requiresLiveEvidence) cannot be presented as done
// without live evidence, regardless of which path it took. Steps that opt out
// (hearing/design: requiresLiveEvidence falsy) are never gated.
import type { Ports } from "../ports/composition";
import type { RunContext } from "../ports/orchestrator";
import type { Cycle } from "../../domain/cycle/cycle";
import type { Instant } from "../../domain/shared/primitives";
import { readPipeline } from "../../domain/project/project";
import { resolveContracts } from "../../domain/project/step-contracts";
import { sameStep } from "../../domain/shared/vocab";

/**
 * Returns a human-facing stall reason when the live-evidence gate blocks this
 * step's done, or undefined when it may proceed (not a gated step / eligible /
 * no gate wired / repo unresolvable).
 */
export function evidenceGateBlockReason(
  ports: Pick<Ports, "evidence" | "repos">,
  cycle: Cycle,
  ctx: RunContext,
): string | undefined {
  const gate = ports.evidence;
  if (!gate) return undefined; // no gate installed (deterministic harness / scripted)

  const project = ports.repos.projects.findById(cycle.projectId);
  if (!project) return undefined; // can't resolve repo → can't read evidence (defensive)

  const stepDef = readPipeline(project).find((sd) => sameStep(sd.id, ctx.step));
  const contracts = stepDef ? resolveContracts(stepDef) : undefined;
  if (!contracts?.requiresLiveEvidence) return undefined; // step opts out of the gate

  let startedAt: Instant | undefined;
  for (const phase of cycle.phases) {
    const run = phase.runs.find((r) => r.id === ctx.runId);
    if (run) {
      startedAt = run.startedAt;
      break;
    }
  }
  if (startedAt === undefined) return undefined;

  const result = gate.check({
    repoPath: project.repoPath,
    version: cycle.version,
    step: ctx.step,
    runStartedAt: startedAt,
  });
  if (result.eligibility === "eligible") return undefined;
  return `live 証拠が不足のため done を拒否しました(不足: ${result.missing.join(", ")})。当該 step の live 縦経路ログ + 視覚/動作証拠(screenshot/動画/test-report)を生成してから再試行してください。`;
}

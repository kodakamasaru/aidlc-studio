// deterministic-gate — the AI-independent gate that runs BEFORE the evaluator
// (S5 Unit-03 §4 / D-01, scope.md item D). Two existence checks only — no AI,
// no semantic judgement (that is the evaluator's job, Unit-05):
//   (1) every BriefOut artifact path exists on disk (via injected Fs port),
//   (2) the task's Profile required block types are all present in the emitted
//       blocks (reuses the pure domain coerceBlocks → forward-compatible).
// Fail → caller does NOT launch the evaluator (generator is re-worked instead).
import { coerceBlocks, type Profile } from "../../domain/review/profile";
import type { ReviewBlockType } from "../../domain/review/review";
import type { Fs } from "../ports/sys";

/**
 * What the gate inspects: the produced artifact paths (BriefOut.artifacts) and
 * the emitted review blocks (ResultEmitted.blocks). Kept as a narrow structural
 * type so the gate never depends on the full BriefOut/Review aggregates.
 */
export interface GateInput {
  readonly artifacts: readonly string[];
  readonly blocks: readonly { readonly type: string }[];
}

export type GateResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly missingPaths: readonly string[];
      readonly missingBlocks: readonly ReviewBlockType[];
    };

/**
 * runDeterministicGate(profile, input, fs): pure + deterministic existence gate.
 * Unknown block types are dropped by coerceBlocks (forward-compat) and never
 * cause a failure on their own; only Profile-required types that are absent do.
 */
export const runDeterministicGate = (
  profile: Profile,
  input: GateInput,
  fs: Fs,
): GateResult => {
  const missingPaths = input.artifacts.filter((p) => !fs.exists(p));
  const { missing: missingBlocks } = coerceBlocks(profile, input.blocks);
  if (missingPaths.length === 0 && missingBlocks.length === 0) {
    return { ok: true };
  }
  return { ok: false, missingPaths, missingBlocks };
};

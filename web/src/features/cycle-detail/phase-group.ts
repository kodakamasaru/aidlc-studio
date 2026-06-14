// phase-group.ts — Step → PhaseGroup mapping (SCR-05 / US-07).
// Pure declarative map: no if-chains, no mutation.
// 5 PhaseGroups per AI-DLC v2 (CLAUDE.md):
//   Discovery: S1 S2
//   Design:    S3 S4
//   Build:     S5 S6 S7 S8
//   Validation: S9 S10
//   Improvement: S11 S12

export type PhaseGroupKey =
  | "discovery"
  | "design"
  | "build"
  | "validation"
  | "improvement";

export interface PhaseGroupMeta {
  readonly key: PhaseGroupKey;
  /** Display label (Japanese, matches SCR-05 mock) */
  readonly label: string;
  /** Ordered set of canonical step IDs that belong to this group. */
  readonly steps: readonly string[];
}

/** Ordered list of the 5 PhaseGroups (Discovery → Improvement). */
export const PHASE_GROUPS: readonly PhaseGroupMeta[] = [
  { key: "discovery", label: "要件", steps: ["S1", "S2"] },
  { key: "design", label: "設計", steps: ["S3", "S4"] },
  { key: "build", label: "実装", steps: ["S5", "S6", "S7", "S8"] },
  { key: "validation", label: "検証", steps: ["S9", "S10"] },
  { key: "improvement", label: "改善", steps: ["S11", "S12"] },
] as const;

/** Reverse lookup: step ID → PhaseGroupKey. Built once at module load. */
const STEP_TO_GROUP: Readonly<Record<string, PhaseGroupKey>> = (() => {
  const map: Record<string, PhaseGroupKey> = {};
  for (const group of PHASE_GROUPS) {
    for (const step of group.steps) {
      map[step] = group.key;
    }
  }
  return map;
})();

/**
 * Returns the PhaseGroupKey for a step ID (e.g. "S3" → "design").
 * Unknown steps (not in S1–S12) fall back to "build" so they render
 * rather than vanish silently.
 */
export function phaseGroupOf(step: string): PhaseGroupKey {
  return STEP_TO_GROUP[step] ?? "build";
}

// Evidence gate port (S5 Unit-01 / US-01) — the app-layer contract for the
// live-evidence hard gate. A technical step may only be presented to the human
// as done once its live-evidence manifest exists with the required forms
// (縦経路ログ + 視覚/動作証拠), all captured AT OR AFTER the run started.
//
// The DOMAIN decision (evaluateStepDoneEligibility) is pure; this port is the
// I/O seam: a concrete adapter (FsEvidenceGate) reads the manifest off disk and
// delegates the verdict to the domain. Injected as an OPTIONAL Ports field so
// the deterministic test harness can omit it (no gate) while the composition
// root (server.ts) always installs the real Fs-backed gate (hard gate in prod).
import type { EligibilityResult } from "../../domain/evidence/evidence";
import type { Instant } from "../../domain/shared/primitives";

/** What the gate needs to locate + time-validate a step's evidence manifest. */
export interface EvidenceGateQuery {
  /** Target project repo root (the project's aidlc-docs lives under here). */
  readonly repoPath: string;
  /** Cycle version, e.g. "v0.0.5" — selects aidlc-docs/<version>/. */
  readonly version: string;
  /** Step id, e.g. "S8" — selects _evidence/<step>/manifest.json. */
  readonly step: string;
  /** The completing run's start time; evidence older than this is rejected. */
  readonly runStartedAt: Instant;
}

export interface EvidenceGatePort {
  /**
   * Read the step's live-evidence manifest and evaluate done-eligibility.
   * A missing/invalid manifest is `blocked` (self-reported done is refused) —
   * never silently treated as eligible (原則④ / US-01: 機械ハードゲート).
   */
  check(query: EvidenceGateQuery): EligibilityResult;
}

// Evidence manifest writer (S5 Unit-04 / US-04). Produces the
// _evidence/<step>/manifest.json that the Unit-01 hard gate consumes. Forms carry
// the step's live evidence (縦経路ログ + 視覚/動作証拠); capturedAt is normalized to
// UTC (`Z`) so it compares lexicographically against the run's startedAt
// (evidence.ts D-03). Keeping the writer here (infra) lets both the seeded harness
// and any future in-run generator share one canonical manifest shape.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { evidenceManifestPath } from "./fs-evidence-gate";
import type {
  EvidenceForm,
  EvidenceKind,
  EvidenceManifest,
} from "../../domain/evidence/evidence";
import type { Instant } from "../../domain/shared/primitives";

export interface EvidenceFormInput {
  readonly kind: EvidenceKind;
  /** Relative path (under the step's _evidence dir) the human can later follow. */
  readonly path: string;
  /** Capture time; normalized to UTC. Defaults to `now` when omitted. */
  readonly capturedAt?: string;
}

/** Normalize an ISO-8601 (or Date) to UTC `Z`. Throws on an unparseable string. */
export function toUtcInstant(value: string | Date): Instant {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`toUtcInstant: invalid date ${String(value)}`);
  }
  return d.toISOString() as Instant; // toISOString is always UTC `Z`.
}

/** Pure: assemble a manifest, defaulting + UTC-normalizing each form's capturedAt. */
export function buildEvidenceManifest(
  step: string,
  forms: readonly EvidenceFormInput[],
  now: Instant,
): EvidenceManifest {
  const normalized: EvidenceForm[] = forms.map((f) => ({
    kind: f.kind,
    path: f.path,
    capturedAt: toUtcInstant(f.capturedAt ?? now),
  }));
  return { step, forms: normalized };
}

/**
 * Write _evidence/<step>/manifest.json under <repoPath>/aidlc-docs/<version>/.
 * Returns the manifest path. The directory is created if absent.
 */
export function writeEvidenceManifest(
  repoPath: string,
  version: string,
  step: string,
  forms: readonly EvidenceFormInput[],
  now: Instant,
): string {
  const manifest = buildEvidenceManifest(step, forms, now);
  const path = evidenceManifestPath(repoPath, version, step);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2), "utf8");
  return path;
}

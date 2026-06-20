// FsEvidenceGate — the Fs-backed adapter for the live-evidence hard gate
// (S5 Unit-01 / US-01). It reads a step's evidence manifest off disk and hands
// the verdict to the pure domain (evaluateStepDoneEligibility). Missing/invalid
// manifest → blocked (the orchestrator's self-reported done is refused).
//
// Manifest location: <repoPath>/aidlc-docs/<version>/_evidence/<step>/manifest.json
// Manifest shape (written by Unit-04): EvidenceManifest
//   { step: "S8", forms: [{ kind, path, capturedAt }] }
//   capturedAt is ISO-8601 UTC (`Z`) so it compares lexicographically against
//   the run's startedAt (evidence.ts D-03).
import { join } from "node:path";
import type { Fs } from "../../app/ports/sys";
import type {
  EvidenceGatePort,
  EvidenceGateQuery,
} from "../../app/ports/evidence-gate";
import {
  evaluateStepDoneEligibility,
  type EligibilityResult,
  type EvidenceForm,
  type EvidenceKind,
  type EvidenceManifest,
} from "../../domain/evidence/evidence";
import type { Instant } from "../../domain/shared/primitives";

/** Resolve the on-disk manifest path for a (repo, version, step) triple. */
export const evidenceManifestPath = (
  repoPath: string,
  version: string,
  step: string,
): string => join(repoPath, "aidlc-docs", version, "_evidence", step, "manifest.json");

const VALID_KINDS: ReadonlySet<string> = new Set([
  "screenshot",
  "video",
  "test-report",
  "log",
]);

/**
 * Parse + validate untrusted manifest JSON at the I/O boundary (validate
 * external data). Returns undefined when the shape is not a valid manifest —
 * the caller treats undefined as "blocked".
 */
const parseManifest = (raw: string, step: string): EvidenceManifest | undefined => {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof data !== "object" || data === null) return undefined;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.forms)) return undefined;

  const forms: EvidenceForm[] = [];
  for (const f of obj.forms) {
    if (typeof f !== "object" || f === null) return undefined;
    const form = f as Record<string, unknown>;
    if (typeof form.kind !== "string" || !VALID_KINDS.has(form.kind)) return undefined;
    if (typeof form.path !== "string" || form.path.length === 0) return undefined;
    if (typeof form.capturedAt !== "string" || form.capturedAt.length === 0) {
      return undefined;
    }
    forms.push({
      kind: form.kind as EvidenceKind,
      path: form.path,
      capturedAt: form.capturedAt as Instant,
    });
  }

  // manifest.step is informational; the authoritative step is the caller's.
  const manifestStep = typeof obj.step === "string" ? obj.step : step;
  return { step: manifestStep, forms };
};

export class FsEvidenceGate implements EvidenceGatePort {
  constructor(private readonly fs: Fs) {}

  check(query: EvidenceGateQuery): EligibilityResult {
    const path = evidenceManifestPath(query.repoPath, query.version, query.step);
    const raw = this.fs.read(path);
    if (raw === undefined || raw.trim().length === 0) {
      // No manifest on disk → no live evidence was generated for this step.
      return { eligibility: "blocked", missing: ["manifest"] };
    }
    const manifest = parseManifest(raw, query.step);
    if (manifest === undefined) {
      return { eligibility: "blocked", missing: ["manifest-invalid"] };
    }
    return evaluateStepDoneEligibility(manifest, {
      runStartedAt: query.runStartedAt,
    });
  }
}

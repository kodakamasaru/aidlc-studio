/**
 * HearingService — BU-3 config-hearing write mechanism (§C7.6 / s4-tech-spec.md).
 *
 * `applyHearingAnswerToContracts` takes a config-hearing question's target
 * (step + dotted field path) and the human's answer (choiceId for enum fields,
 * note for free fields) and writes it DETERMINISTICALLY into the correct
 * StepContracts field:
 *   - scope="global"      → project.pipelineDef StepDef.contracts
 *   - scope="cycle:{id}"  → cycle phase snapshot StepDefSnapshot.contracts
 *
 * Write rules per field (§C7.6 / parseStepContracts parity):
 *   output.profileKind        → choiceId / note → string (SAFE_IDENT validated)
 *   output.artifactGlob       → note → string (no ".." / no control chars)
 *   humanGate.mode            → choiceId → "visual_review" | "device_check" | "none"
 *   escalation.onStall        → choiceId → "retry" | "backtrack" | "human"
 *   escalation.maxRetry       → note → integer ≥ 0
 *   verification.observations → note → appended to the existing list
 *
 * Reuses the same enum-set constants as the HTTP PATCH validator (no duplication).
 * Invalid target.field or invalid answer value → visible ServiceError (原則④).
 */

import type { Ports } from "../ports/composition";
import { fail } from "./errors";
import type { StepContracts } from "../../domain/project/step-contracts";
import type { Text } from "../../domain/shared/primitives";
import { Step, sameStep } from "../../domain/shared/vocab";
import { ProjectId, CycleId } from "../../domain/shared/ids";
import { customizePipeline, readPipeline } from "../../domain/project/project";
import type { StepDef, StepDefSnapshot } from "../../domain/project/project";
import type { Phase } from "../../domain/cycle/cycle";
import { isErr } from "../../domain/shared/result";
import { ALLOWED_TARGET_FIELDS } from "../../wire/aidlc-wire";

// ── Enum / identifier constraints (mirrors projects.ts PATCH validator) ──────

const HUMAN_GATE_MODES = new Set(["visual_review", "device_check", "none"]);
const ESCALATION_ONST_KINDS = new Set(["retry", "backtrack", "human"]);
/** Identifier-shaped: no shell metacharacters, path separators, or whitespace. */
const SAFE_IDENT_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_GLOB_LEN = 256;

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

// ── Answer value extraction ──────────────────────────────────────────────────

/**
 * Resolve the effective string value from the human's answer.
 * Config-hearing questions use choiceId for enum fields and note for free fields.
 */
function resolveValue(choiceId: string | undefined, note: string | undefined): string | undefined {
  if (choiceId !== undefined && choiceId.trim().length > 0) return choiceId.trim();
  if (note !== undefined && note.trim().length > 0) return note.trim();
  return undefined;
}

// ── Per-field contract merge ─────────────────────────────────────────────────

/**
 * Merge one config-hearing answer into an existing StepContracts snapshot.
 * Each field follows the same validation rules as the HTTP PATCH endpoint.
 * Returns the updated contracts or throws a ServiceError on invalid input.
 */
function applyFieldToContracts(
  field: string,
  choiceId: string | undefined,
  note: string | undefined,
  current: StepContracts,
): StepContracts {
  switch (field) {
    case "output.profileKind": {
      const val = resolveValue(choiceId, note);
      if (val === undefined) throw fail(400, "HearingAnswer: output.profileKind requires a value");
      if (!SAFE_IDENT_RE.test(val)) throw fail(400, "HearingAnswer: output.profileKind contains invalid characters");
      return { ...current, output: { ...(current.output ?? {}), profileKind: val } };
    }
    case "output.artifactGlob": {
      const val = resolveValue(choiceId, note);
      if (val === undefined) throw fail(400, "HearingAnswer: output.artifactGlob requires a value");
      if (val.includes("..") || val.length > MAX_GLOB_LEN || hasControlChar(val)) {
        throw fail(400, "HearingAnswer: output.artifactGlob is invalid");
      }
      return { ...current, output: { ...(current.output ?? {}), artifactGlob: val as Text } };
    }
    case "humanGate.mode": {
      const val = resolveValue(choiceId, note);
      if (val === undefined || !HUMAN_GATE_MODES.has(val)) {
        throw fail(400, `HearingAnswer: humanGate.mode must be one of: ${[...HUMAN_GATE_MODES].join(", ")}`);
      }
      return {
        ...current,
        humanGate: {
          ...(current.humanGate ?? {}),
          mode: val as "visual_review" | "device_check" | "none",
        },
      };
    }
    case "escalation.onStall": {
      const val = resolveValue(choiceId, note);
      if (val === undefined || !ESCALATION_ONST_KINDS.has(val)) {
        throw fail(400, `HearingAnswer: escalation.onStall must be one of: ${[...ESCALATION_ONST_KINDS].join(", ")}`);
      }
      return {
        ...current,
        escalation: {
          ...(current.escalation ?? {}),
          onStall: val as "retry" | "backtrack" | "human",
        },
      };
    }
    case "escalation.maxRetry": {
      const val = resolveValue(choiceId, note);
      if (val === undefined) throw fail(400, "HearingAnswer: escalation.maxRetry requires a value");
      const n = parseInt(val, 10);
      if (!Number.isInteger(n) || n < 0) {
        throw fail(400, "HearingAnswer: escalation.maxRetry must be a non-negative integer");
      }
      // EscalationContract requires onStall. If not yet set, default to "retry"
      // (the safest value) so the partial update is still a valid contract.
      const onStall = current.escalation?.onStall ?? "retry";
      return {
        ...current,
        escalation: { ...(current.escalation ?? {}), onStall, maxRetry: n },
      };
    }
    case "verification.observations": {
      const val = resolveValue(choiceId, note);
      if (val === undefined) throw fail(400, "HearingAnswer: verification.observations requires a value");
      const existing = current.verification?.observations ?? [];
      return {
        ...current,
        verification: { observations: [...existing, val as Text] },
      };
    }
    default:
      // Should not reach here after ALLOWED_TARGET_FIELDS guard — but surface clearly.
      throw fail(400, `HearingAnswer: unknown contract field "${field}"`);
  }
}

// ── Scope parsing ────────────────────────────────────────────────────────────

export type HearingScope =
  | { readonly kind: "global" }
  | { readonly kind: "cycle"; readonly cycleId: string };

/** Parse "global" | "cycle:{id}" into a typed discriminated union. */
export function parseScope(raw: string): HearingScope {
  if (raw === "global") return { kind: "global" };
  if (raw.startsWith("cycle:")) {
    const id = raw.slice("cycle:".length).trim();
    if (id.length === 0) throw fail(400, "HearingAnswer: cycle scope requires a non-empty cycleId");
    return { kind: "cycle", cycleId: id };
  }
  throw fail(400, `HearingAnswer: invalid scope "${raw}" — must be "global" or "cycle:{id}"`);
}

// ── applyHearingAnswerToContracts ────────────────────────────────────────────

export interface HearingAnswerInput {
  /**
   * "global" or "cycle:{cycleId}".
   * global  → writes to project.pipelineDef (applies to next cycle).
   * cycle   → writes to the cycle's phase snapshot (current cycle only).
   */
  readonly scope: string;
  readonly projectId: string;
  readonly target: { readonly step: string; readonly field: string };
  /**
   * choiceId: the option.id the human selected (for enum fields).
   * note: free-text answer (for free fields like observations / artifactGlob).
   * At least one must be non-empty for the call to succeed.
   */
  readonly choiceId?: string;
  readonly note?: string;
}

/**
 * Apply one config-hearing answer to the correct StepContracts field and persist.
 *
 * Write path:
 *   global → project.pipelineDef StepDef.contracts → projects repo
 *   cycle  → cycle phase StepDefSnapshot.contracts  → cycles repo
 *
 * Throws a ServiceError (visible to the human / 原則④) on:
 *   - invalid scope
 *   - unknown step in the target pipeline
 *   - invalid field (not in ALLOWED_TARGET_FIELDS)
 *   - invalid answer value for the field type
 */
export function applyHearingAnswerToContracts(
  input: HearingAnswerInput,
  ports: Pick<Ports, "repos" | "uow">,
): void {
  // 1. Validate field early (before any DB load).
  if (!ALLOWED_TARGET_FIELDS.has(input.target.field)) {
    throw fail(400, `HearingAnswer: field "${input.target.field}" is not an allowed contract field`);
  }

  const scope = parseScope(input.scope);
  const stepId = Step(input.target.step);

  if (scope.kind === "global") {
    // Write to project.pipelineDef
    const project = ports.repos.projects.findById(ProjectId(input.projectId));
    if (!project) throw fail(404, "ProjectNotFound");

    const pipeline = readPipeline(project);
    const stepDef = pipeline.find((sd) => sameStep(sd.id, stepId));
    if (!stepDef) throw fail(404, `StepNotInPipeline: ${input.target.step}`);

    const current = stepDef.contracts ?? {};
    const updated = applyFieldToContracts(input.target.field, input.choiceId, input.note, current);

    const newPipeline: StepDef[] = pipeline.map((sd) =>
      sameStep(sd.id, stepId) ? { ...sd, contracts: updated } : sd,
    );
    const result = customizePipeline(project, newPipeline);
    if (isErr(result)) throw fail(400, result.error);
    ports.uow.run(() => ports.repos.projects.save(result.value));
  } else {
    // scope.kind === "cycle"
    // Write to the cycle's phase snapshot
    const cycle = ports.repos.cycles.findById(CycleId(scope.cycleId));
    if (!cycle) throw fail(404, "CycleNotFound");

    const phase = cycle.phases.find((p) => sameStep(p.step, stepId));
    if (!phase) throw fail(404, `StepNotInPipeline: ${input.target.step}`);

    // stepDef is optional (backward-compat for cycles created before snapshot
    // was introduced). Guard and treat missing snapshot as empty contracts.
    const existingSnapshot = phase.stepDef;
    const current: StepContracts = existingSnapshot?.contracts ?? {};
    const updated = applyFieldToContracts(input.target.field, input.choiceId, input.note, current);

    // Build the updated snapshot. When no snapshot existed yet, we can only
    // persist the contracts (label/order/skillRef are required on StepDefSnapshot
    // but we have no values to fill them with). In practice every phase created
    // by CycleService has a stepDef; the guard is for type safety.
    if (existingSnapshot === undefined) {
      // Cannot write without a snapshot base — surface clearly (原則④).
      throw fail(409, `HearingAnswer: phase ${input.target.step} has no stepDef snapshot; cannot write contracts`);
    }

    const newSnapshot: StepDefSnapshot = { ...existingSnapshot, contracts: updated };

    // Immutable update: rebuild the cycle with the patched phase.
    const newPhases: readonly Phase[] = cycle.phases.map((p) =>
      sameStep(p.step, stepId)
        ? { ...p, stepDef: newSnapshot }
        : p,
    );
    const updatedCycle = { ...cycle, phases: newPhases };
    ports.uow.run(() => ports.repos.cycles.save(updatedCycle));
  }
}

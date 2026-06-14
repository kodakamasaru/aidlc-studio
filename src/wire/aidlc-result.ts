/**
 * aidlc-result — wire-format conversion for the aidlc-result fenced envelope.
 *
 * PURE module: no I/O, no framework imports, no side effects.
 * Imports from ../domain/shared/result and reuses types/helpers from aidlc-wire.
 *
 * §C7.4 of s4-tech-spec.md: the single unified AI-output format.
 * AI emits one ```aidlc-result``` minified JSON block per run covering
 * artifacts, questions, decisions, completeness, and status.
 */

import { type Result, ok, err } from "../domain/shared/result";
import { type AidlcQuestion, type WireError, validateAidlcQuestion } from "./aidlc-wire";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AidlcDecision = {
  readonly id: string;
  readonly decision: string;
  readonly reason: string;
};

export type AidlcRequirement = {
  readonly key: string;
  readonly text: string;
};

export type AidlcCompleteness = {
  readonly requirements: readonly AidlcRequirement[];
  readonly addressed: readonly string[];
};

export type AidlcResultStatus = "done" | "needs_human" | "stalled";

export type AidlcResult = {
  readonly artifacts: readonly string[];
  readonly questions: readonly AidlcQuestion[];
  readonly decisions: readonly AidlcDecision[];
  readonly completeness: AidlcCompleteness;
  readonly status: AidlcResultStatus;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESULT_FENCE_OPEN = "```aidlc-result";
const FENCE_CLOSE = "```";

const VALID_STATUSES: readonly AidlcResultStatus[] = ["done", "needs_human", "stalled"];

// ---------------------------------------------------------------------------
// Internal fence extraction (mirrors aidlc-wire scanFence, same 3-state logic)
// ---------------------------------------------------------------------------

type FenceScan =
  | { readonly kind: "absent" }
  | { readonly kind: "unclosed" }
  | { readonly kind: "content"; readonly content: string };

const scanFence = (text: string, openTag: string): FenceScan => {
  const lines = text.split("\n");
  let inBlock = false;
  const contentLines: string[] = [];

  for (const line of lines) {
    if (!inBlock) {
      if (line.trimEnd() === openTag) {
        inBlock = true;
      }
      continue;
    }
    if (line.trimEnd() === FENCE_CLOSE) {
      return { kind: "content", content: contentLines.join("\n") };
    }
    contentLines.push(line);
  }

  return inBlock ? { kind: "unclosed" } : { kind: "absent" };
};

// ---------------------------------------------------------------------------
// Internal validators
// ---------------------------------------------------------------------------

const validateDecision = (d: unknown, index: number): Result<AidlcDecision, WireError> => {
  if (typeof d !== "object" || d === null || Array.isArray(d)) {
    return err({ code: "schema", detail: `decisions[${index}] must be a non-null object` });
  }

  const raw = d as Record<string, unknown>;

  if (typeof raw["id"] !== "string" || raw["id"].length === 0) {
    return err({ code: "schema", detail: `decisions[${index}].id must be a non-empty string` });
  }
  if (typeof raw["decision"] !== "string" || raw["decision"].length === 0) {
    return err({
      code: "schema",
      detail: `decisions[${index}].decision must be a non-empty string`,
    });
  }
  if (typeof raw["reason"] !== "string" || raw["reason"].length === 0) {
    return err({
      code: "schema",
      detail: `decisions[${index}].reason must be a non-empty string`,
    });
  }

  return ok({
    id: raw["id"] as string,
    decision: raw["decision"] as string,
    reason: raw["reason"] as string,
  });
};

const validateRequirement = (
  r: unknown,
  index: number,
): Result<AidlcRequirement, WireError> => {
  if (typeof r !== "object" || r === null || Array.isArray(r)) {
    return err({
      code: "schema",
      detail: `completeness.requirements[${index}] must be a non-null object`,
    });
  }

  const raw = r as Record<string, unknown>;

  if (typeof raw["key"] !== "string" || raw["key"].length === 0) {
    return err({
      code: "schema",
      detail: `completeness.requirements[${index}].key must be a non-empty string`,
    });
  }
  if (typeof raw["text"] !== "string" || raw["text"].length === 0) {
    return err({
      code: "schema",
      detail: `completeness.requirements[${index}].text must be a non-empty string`,
    });
  }

  return ok({ key: raw["key"] as string, text: raw["text"] as string });
};

const validateCompleteness = (c: unknown): Result<AidlcCompleteness, WireError> => {
  if (typeof c !== "object" || c === null || Array.isArray(c)) {
    return err({ code: "schema", detail: "completeness must be a non-null object" });
  }

  const raw = c as Record<string, unknown>;

  // requirements
  if (!Array.isArray(raw["requirements"])) {
    return err({
      code: "schema",
      detail: "completeness.requirements must be an array",
    });
  }
  const requirements: AidlcRequirement[] = [];
  for (let i = 0; i < raw["requirements"].length; i++) {
    const reqResult = validateRequirement(raw["requirements"][i], i);
    if (!reqResult.ok) return reqResult;
    requirements.push(reqResult.value);
  }

  // addressed — must be array of strings
  if (!Array.isArray(raw["addressed"])) {
    return err({ code: "schema", detail: "completeness.addressed must be an array" });
  }
  for (let i = 0; i < raw["addressed"].length; i++) {
    if (typeof raw["addressed"][i] !== "string") {
      return err({
        code: "schema",
        detail: `completeness.addressed[${i}] must be a string`,
      });
    }
  }
  // After element-type guard, TypeScript knows it's string[]
  const addressed: readonly string[] = raw["addressed"] as string[];

  // Integrity rule: every addressed key MUST exist in requirements keys (addressed ⊆ requirements)
  const requirementKeys = new Set(requirements.map((r) => r.key));
  for (const key of addressed) {
    if (!requirementKeys.has(key)) {
      return err({
        code: "schema",
        detail: `completeness.addressed contains key "${key}" which is not in requirements`,
      });
    }
  }

  return ok({ requirements, addressed });
};

// ---------------------------------------------------------------------------
// validateAidlcResult
// ---------------------------------------------------------------------------

export const validateAidlcResult = (raw: unknown): Result<AidlcResult, WireError> => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return err({ code: "schema", detail: "aidlc-result must be a non-null object" });
  }

  const r = raw as Record<string, unknown>;

  // status
  if (!VALID_STATUSES.includes(r["status"] as AidlcResultStatus)) {
    return err({
      code: "schema",
      detail: `aidlc-result.status must be one of: ${VALID_STATUSES.join(", ")}. Got: ${JSON.stringify(r["status"])}`,
    });
  }
  const status = r["status"] as AidlcResultStatus;

  // artifacts — array of non-empty strings
  if (!Array.isArray(r["artifacts"])) {
    return err({ code: "schema", detail: "aidlc-result.artifacts must be an array" });
  }
  const artifacts: string[] = [];
  for (let i = 0; i < r["artifacts"].length; i++) {
    const a = r["artifacts"][i];
    if (typeof a !== "string") {
      return err({
        code: "schema",
        detail: `aidlc-result.artifacts[${i}] must be a string`,
      });
    }
    if (a.length === 0) {
      return err({
        code: "schema",
        detail: `aidlc-result.artifacts[${i}] must be a non-empty string`,
      });
    }
    artifacts.push(a);
  }

  // questions — array, each passing validateAidlcQuestion
  if (!Array.isArray(r["questions"])) {
    return err({ code: "schema", detail: "aidlc-result.questions must be an array" });
  }
  const questions: AidlcQuestion[] = [];
  for (let i = 0; i < r["questions"].length; i++) {
    const qResult = validateAidlcQuestion(r["questions"][i]);
    if (!qResult.ok) return qResult;
    questions.push(qResult.value);
  }

  // decisions — array, each validated
  if (!Array.isArray(r["decisions"])) {
    return err({ code: "schema", detail: "aidlc-result.decisions must be an array" });
  }
  const decisions: AidlcDecision[] = [];
  for (let i = 0; i < r["decisions"].length; i++) {
    const dResult = validateDecision(r["decisions"][i], i);
    if (!dResult.ok) return dResult;
    decisions.push(dResult.value);
  }

  // completeness
  if (!("completeness" in r)) {
    return err({ code: "schema", detail: "aidlc-result.completeness is required" });
  }
  const completenessResult = validateCompleteness(r["completeness"]);
  if (!completenessResult.ok) return completenessResult;

  return ok({
    artifacts,
    questions,
    decisions,
    completeness: completenessResult.value,
    status,
  });
};

// ---------------------------------------------------------------------------
// parseAidlcResultBlock
// ---------------------------------------------------------------------------

/**
 * Scan for a single ```aidlc-result``` fenced block in text.
 * - ok(null)  = no block present (caller decides fallback — same posture as parseQuestionBlock)
 * - ok(AidlcResult) = block found, parsed, validated
 * - err(WireError) = unclosed fence | bad JSON | schema violation
 */
export const parseAidlcResultBlock = (
  text: string,
): Result<AidlcResult | null, WireError> => {
  const scan = scanFence(text, RESULT_FENCE_OPEN);

  // No block — normal path when AI did not emit a result envelope (caller falls back)
  if (scan.kind === "absent") {
    return ok(null);
  }

  // Open tag seen but never closed — malformed; surface loudly (原則④)
  if (scan.kind === "unclosed") {
    return err({ code: "schema", detail: "unclosed aidlc-result fence" });
  }

  const content = scan.content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return err({ code: "bad-json", detail });
  }

  return validateAidlcResult(parsed);
};

// ---------------------------------------------------------------------------
// serializeAidlcResult
// ---------------------------------------------------------------------------

/**
 * Produce the minified single-line ```aidlc-result``` fenced block.
 * Used by scripted adapter for parity and by tests for round-trip verification.
 */
export const serializeAidlcResult = (r: AidlcResult): string =>
  [RESULT_FENCE_OPEN, JSON.stringify(r), FENCE_CLOSE].join("\n");

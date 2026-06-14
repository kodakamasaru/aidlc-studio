/**
 * aidlc-wire — wire-format conversion for aidlc-question / aidlc-answers fenced blocks.
 *
 * PURE module: no I/O, no framework imports, no side effects.
 * Only imports from shared/result.
 */

import { type Result, ok, err } from "../domain/shared/result";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AidlcOption = {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly recommended?: boolean;
};

export type AidlcAnswerKind = "single" | "multi" | "free";

export type AidlcQuestion = {
  readonly id: string;
  readonly prompt: string;
  readonly background?: string;
  readonly options: readonly AidlcOption[];
  readonly answerKind: AidlcAnswerKind;
  /**
   * BU-3: config-hearing target. When present, the answer handler writes the
   * human's choice directly into StepContracts (deterministic write / §C7.6).
   * Absent on normal hearing questions (backward-compatible).
   */
  readonly target?: AidlcTarget;
};

export type AidlcAnswer = {
  readonly questionId: string;
  readonly choiceIds: readonly string[];
  readonly note?: string;
};

export type WireError = {
  readonly code: "no-block" | "bad-json" | "schema";
  readonly detail: string;
};

/**
 * BU-3: config-hearing target. When a config-hearing run emits questions, each
 * question may carry a `target` that tells the answer handler WHICH StepContracts
 * field to write the answer into deterministically (§C7.6 / s4-tech-spec.md).
 *
 * `step` — the step id (e.g. "S1", "S8").
 * `field` — a StepContracts dotted path:
 *   "output.profileKind" | "output.artifactGlob" |
 *   "humanGate.mode" |
 *   "escalation.onStall" | "escalation.maxRetry" |
 *   "verification.observations"
 *
 * Absence of `target` means the question is a normal hearing question (no
 * contract write on answer — backward-compatible).
 */
export type AidlcTarget = {
  readonly step: string;
  readonly field: string;
  /**
   * Write destination scope: "global" (project.pipelineDef) or "cycle:{id}"
   * (phase snapshot). When absent in wire, the answer-handler infers the scope
   * from the question's cycleId (i.e. "cycle:{question.cycleId}").
   */
  readonly scope?: string;
};

/** Allowed StepContracts dotted-path fields for config-hearing targets. */
export const ALLOWED_TARGET_FIELDS: ReadonlySet<string> = new Set([
  "output.profileKind",
  "output.artifactGlob",
  "humanGate.mode",
  "escalation.onStall",
  "escalation.maxRetry",
  "verification.observations",
]);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUESTION_FENCE_OPEN = "```aidlc-question";
const ANSWERS_FENCE_OPEN = "```aidlc-answers";
const FENCE_CLOSE = "```";

const VALID_ANSWER_KINDS: readonly AidlcAnswerKind[] = ["single", "multi", "free"];

// ---------------------------------------------------------------------------
// Internal fence extraction
// ---------------------------------------------------------------------------

type FenceScan =
  | { readonly kind: "absent" }
  | { readonly kind: "unclosed" }
  | { readonly kind: "content"; readonly content: string };

/**
 * Scan the first fenced block that starts with `openTag`.
 * - "absent"   — the open tag was never found
 * - "unclosed" — the open tag was found but no closing fence followed
 * - "content"  — block found and closed; `content` holds the inner text
 */
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
// Internal option validation
// ---------------------------------------------------------------------------

const validateOption = (opt: unknown, index: number): Result<AidlcOption, WireError> => {
  if (typeof opt !== "object" || opt === null) {
    return err({ code: "schema", detail: `options[${index}] must be an object` });
  }

  const o = opt as Record<string, unknown>;

  if (typeof o["id"] !== "string" || o["id"].length === 0) {
    return err({ code: "schema", detail: `options[${index}].id must be a non-empty string` });
  }
  if (typeof o["label"] !== "string" || o["label"].length === 0) {
    return err({ code: "schema", detail: `options[${index}].label must be a non-empty string` });
  }
  if (o["hint"] !== undefined && typeof o["hint"] !== "string") {
    return err({ code: "schema", detail: `options[${index}].hint must be a string when present` });
  }

  return ok({
    id: o["id"] as string,
    label: o["label"] as string,
    ...(o["hint"] !== undefined ? { hint: o["hint"] as string } : {}),
    ...(o["recommended"] === true ? { recommended: true } : {}),
  });
};

// ---------------------------------------------------------------------------
// validateAidlcQuestion
// ---------------------------------------------------------------------------

export const validateAidlcQuestion = (q: unknown): Result<AidlcQuestion, WireError> => {
  if (typeof q !== "object" || q === null) {
    return err({ code: "schema", detail: "question must be a non-null object" });
  }

  const raw = q as Record<string, unknown>;

  // id
  if (typeof raw["id"] !== "string" || raw["id"].length === 0) {
    return err({ code: "schema", detail: "question.id must be a non-empty string" });
  }

  // prompt
  if (typeof raw["prompt"] !== "string" || raw["prompt"].length === 0) {
    return err({ code: "schema", detail: "question.prompt must be a non-empty string" });
  }

  // answerKind
  if (!VALID_ANSWER_KINDS.includes(raw["answerKind"] as AidlcAnswerKind)) {
    return err({
      code: "schema",
      detail: `question.answerKind must be one of: ${VALID_ANSWER_KINDS.join(", ")}. Got: ${JSON.stringify(raw["answerKind"])}`,
    });
  }

  // options — must be a non-empty array
  if (!Array.isArray(raw["options"]) || raw["options"].length === 0) {
    return err({ code: "schema", detail: "question.options must be a non-empty array" });
  }

  const validatedOptions: AidlcOption[] = [];
  for (let i = 0; i < raw["options"].length; i++) {
    const optResult = validateOption(raw["options"][i], i);
    if (!optResult.ok) return optResult;
    validatedOptions.push(optResult.value);
  }

  // Exactly-one-recommended rule — surface loudly, never silently pass
  const recommendedCount = validatedOptions.filter((o) => o.recommended === true).length;
  if (recommendedCount !== 1) {
    return err({
      code: "schema",
      detail: `question "${raw["id"]}": exactly 1 option must have recommended=true; found ${recommendedCount}`,
    });
  }

  // background — optional string
  if (raw["background"] !== undefined && typeof raw["background"] !== "string") {
    return err({ code: "schema", detail: "question.background must be a string when present" });
  }

  // target — optional BU-3 config-hearing write target
  let target: AidlcTarget | undefined;
  if (raw["target"] !== undefined) {
    if (typeof raw["target"] !== "object" || raw["target"] === null) {
      return err({ code: "schema", detail: "question.target must be an object when present" });
    }
    const t = raw["target"] as Record<string, unknown>;
    if (typeof t["step"] !== "string" || t["step"].length === 0) {
      return err({ code: "schema", detail: "question.target.step must be a non-empty string" });
    }
    if (typeof t["field"] !== "string" || t["field"].length === 0) {
      return err({ code: "schema", detail: "question.target.field must be a non-empty string" });
    }
    if (!ALLOWED_TARGET_FIELDS.has(t["field"])) {
      return err({
        code: "schema",
        detail: `question.target.field "${t["field"]}" is not an allowed contract field. Allowed: ${[...ALLOWED_TARGET_FIELDS].join(", ")}`,
      });
    }
    // scope is optional; when present must be a string
    if (t["scope"] !== undefined && typeof t["scope"] !== "string") {
      return err({ code: "schema", detail: "question.target.scope must be a string when present" });
    }
    target = {
      step: t["step"] as string,
      field: t["field"] as string,
      ...(t["scope"] !== undefined ? { scope: t["scope"] as string } : {}),
    };
  }

  return ok({
    id: raw["id"] as string,
    prompt: raw["prompt"] as string,
    answerKind: raw["answerKind"] as AidlcAnswerKind,
    options: validatedOptions,
    ...(raw["background"] !== undefined ? { background: raw["background"] as string } : {}),
    ...(target !== undefined ? { target } : {}),
  });
};

// ---------------------------------------------------------------------------
// parseQuestionBlock
// ---------------------------------------------------------------------------

export const parseQuestionBlock = (text: string): Result<AidlcQuestion[] | null, WireError> => {
  const scan = scanFence(text, QUESTION_FENCE_OPEN);

  // No block is normal — signals the visual_review path, not an error
  if (scan.kind === "absent") {
    return ok(null);
  }

  // Open tag seen but never closed — AI started a block it did not finish; surface loudly
  if (scan.kind === "unclosed") {
    return err({ code: "schema", detail: "unclosed aidlc-question fence" });
  }

  const content = scan.content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return err({ code: "bad-json", detail });
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>)["questions"])
  ) {
    return err({
      code: "schema",
      detail: "aidlc-question block must parse to { questions: AidlcQuestion[] }",
    });
  }

  const rawQuestions = (parsed as Record<string, unknown>)["questions"] as unknown[];
  const questions: AidlcQuestion[] = [];

  for (const raw of rawQuestions) {
    const result = validateAidlcQuestion(raw);
    if (!result.ok) return result;
    questions.push(result.value);
  }

  return ok(questions);
};

// ---------------------------------------------------------------------------
// serializeAnswers
// ---------------------------------------------------------------------------

export const serializeAnswers = (answers: readonly AidlcAnswer[]): string =>
  [ANSWERS_FENCE_OPEN, JSON.stringify({ answers }, null, 2), FENCE_CLOSE].join("\n");

// ---------------------------------------------------------------------------
// Internal answer validation
// ---------------------------------------------------------------------------

const validateAnswer = (a: unknown, index: number): Result<AidlcAnswer, WireError> => {
  if (typeof a !== "object" || a === null) {
    return err({ code: "schema", detail: `answers[${index}] must be an object` });
  }

  const raw = a as Record<string, unknown>;

  if (typeof raw["questionId"] !== "string" || raw["questionId"].length === 0) {
    return err({
      code: "schema",
      detail: `answers[${index}].questionId must be a non-empty string`,
    });
  }

  if (
    !Array.isArray(raw["choiceIds"]) ||
    !raw["choiceIds"].every((c): c is string => typeof c === "string")
  ) {
    return err({
      code: "schema",
      detail: `answers[${index}].choiceIds must be an array of strings`,
    });
  }

  // After the element-type guard above, TypeScript knows choiceIds is string[]
  const choiceIds: readonly string[] = raw["choiceIds"];

  if (raw["note"] !== undefined && typeof raw["note"] !== "string") {
    return err({
      code: "schema",
      detail: `answers[${index}].note must be a string when present`,
    });
  }

  // FIX 2 — reject a truly blank answer (no choices AND no meaningful note)
  const hasChoice = choiceIds.length > 0;
  const hasNote = typeof raw["note"] === "string" && raw["note"].trim().length > 0;
  if (!hasChoice && !hasNote) {
    return err({
      code: "schema",
      detail: `answers[${index}] must have at least one choice or a non-empty note`,
    });
  }

  return ok({
    questionId: raw["questionId"] as string,
    choiceIds,
    ...(raw["note"] !== undefined ? { note: raw["note"] as string } : {}),
  });
};

// ---------------------------------------------------------------------------
// parseAnswersBlock
// ---------------------------------------------------------------------------

export const parseAnswersBlock = (text: string): Result<AidlcAnswer[], WireError> => {
  const scan = scanFence(text, ANSWERS_FENCE_OPEN);

  // For answers, absence IS an error (unlike questions)
  if (scan.kind === "absent") {
    return err({ code: "no-block", detail: "no ```aidlc-answers block found in text" });
  }

  // Open tag seen but never closed — malformed block
  if (scan.kind === "unclosed") {
    return err({ code: "schema", detail: "unclosed aidlc-answers fence" });
  }

  const content = scan.content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return err({ code: "bad-json", detail });
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>)["answers"])
  ) {
    return err({
      code: "schema",
      detail: "aidlc-answers block must parse to { answers: AidlcAnswer[] }",
    });
  }

  const rawAnswers = (parsed as Record<string, unknown>)["answers"] as unknown[];
  const answers: AidlcAnswer[] = [];

  for (let i = 0; i < rawAnswers.length; i++) {
    const result = validateAnswer(rawAnswers[i], i);
    if (!result.ok) return result;
    answers.push(result.value);
  }

  return ok(answers);
};

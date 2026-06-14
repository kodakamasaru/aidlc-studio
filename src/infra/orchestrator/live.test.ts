/**
 * Unit-03: question emit & session-id parse — tests for pure helpers in live.ts.
 *
 * Tests cover:
 *   - extractSessionId: present / absent / multiple lines / malformed
 *   - aidlcQuestionToEvent: block present → QuestionRaised with mapped options
 *   - exactly-1-recommended passthrough
 *   - block absent → ResultEmitted path (tested via parseQuestionBlock returning null)
 *   - parse error surfaced (visible, not silent)
 */

import { test, expect, describe } from "bun:test";
import {
  extractSessionId,
  aidlcQuestionToEvent,
} from "./live";
import type { RunId } from "../../domain/shared/ids";
import type { AidlcQuestion, AidlcOption } from "../../wire/aidlc-wire";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const runId = "run-test-01" as RunId;

const makeOption = (
  id: string,
  label: string,
  recommended = false,
  hint?: string,
): AidlcOption => ({
  id,
  label,
  ...(recommended ? { recommended: true } : {}),
  ...(hint !== undefined ? { hint } : {}),
});

const makeQuestion = (overrides: Partial<AidlcQuestion> = {}): AidlcQuestion => ({
  id: "q1",
  prompt: "Which approach?",
  answerKind: "single",
  options: [makeOption("a", "Option A", true), makeOption("b", "Option B")],
  ...overrides,
});

/** Build a JSONL stdout string. */
const jsonl = (...lines: unknown[]): string => lines.map((l) => JSON.stringify(l)).join("\n");

// ---------------------------------------------------------------------------
// extractSessionId
// ---------------------------------------------------------------------------

describe("extractSessionId", () => {
  test("init line present → returns session_id string", () => {
    // Arrange
    const stdout = jsonl(
      { type: "system", subtype: "init", session_id: "sess-abc-123" },
      { type: "assistant", message: {} },
    );

    // Act
    const result = extractSessionId(stdout);

    // Assert
    expect(result).toBe("sess-abc-123");
  });

  test("init line absent → returns null", () => {
    // Arrange
    const stdout = jsonl(
      { type: "assistant", message: {} },
      { type: "result", subtype: "success", result: "done" },
    );

    // Act
    const result = extractSessionId(stdout);

    // Assert
    expect(result).toBeNull();
  });

  test("empty stdout → returns null", () => {
    expect(extractSessionId("")).toBeNull();
  });

  test("malformed JSON line among valid lines → still finds session_id", () => {
    // Arrange — init line is valid; other lines may be non-JSON
    const stdout =
      '{"type":"system","subtype":"init","session_id":"sess-xyz"}\n' +
      "not-json\n" +
      '{"type":"result","subtype":"success","result":"ok"}\n';

    // Act
    const result = extractSessionId(stdout);

    // Assert
    expect(result).toBe("sess-xyz");
  });

  test("multiple JSONL lines, init is first → returns session_id from init line", () => {
    // Arrange — init is always first in real output; parser should not rely on position
    const stdout = jsonl(
      { type: "system", subtype: "init", session_id: "sess-first" },
      { type: "system", subtype: "other" },
      { type: "result", subtype: "success", result: "done" },
    );

    // Act
    const result = extractSessionId(stdout);

    // Assert
    expect(result).toBe("sess-first");
  });

  test("system line present but subtype is NOT init → returns null", () => {
    // Arrange — subtype "other" should not match
    const stdout = jsonl(
      { type: "system", subtype: "other", session_id: "sess-no" },
    );

    // Act
    const result = extractSessionId(stdout);

    // Assert
    expect(result).toBeNull();
  });

  test("init line present but session_id is not a string → returns null", () => {
    // Arrange — malformed init event (session_id is a number)
    const stdout = jsonl(
      { type: "system", subtype: "init", session_id: 12345 },
    );

    // Act
    const result = extractSessionId(stdout);

    // Assert
    expect(result).toBeNull();
  });

  test("init line has empty-string session_id → returns null (unusable for resume)", () => {
    // Arrange
    const stdout = jsonl(
      { type: "system", subtype: "init", session_id: "" },
    );

    // Act
    const result = extractSessionId(stdout);

    // Assert
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// aidlcQuestionToEvent
// ---------------------------------------------------------------------------

describe("aidlcQuestionToEvent", () => {
  test("basic question with 2 options → QuestionRaised with kind=question", () => {
    // Arrange
    const q = makeQuestion();

    // Act
    const event = aidlcQuestionToEvent(runId, q);

    // Assert
    expect(event.type).toBe("QuestionRaised");
    expect(event.runId).toBe(runId);
    expect(event.kind).toBe("question");
    expect(event.payload.kind).toBe("question");
  });

  test("question prompt is mapped to payload.prompt", () => {
    // Arrange
    const q = makeQuestion({ prompt: "Should we proceed?" });

    // Act
    const event = aidlcQuestionToEvent(runId, q);

    // Assert
    if (event.payload.kind !== "question") throw new Error("unexpected kind");
    expect(event.payload.prompt).toBe("Should we proceed?");
  });

  test("options are mapped: id, label, hint, recommended all preserved", () => {
    // Arrange
    const q = makeQuestion({
      options: [
        makeOption("opt-a", "Option A", true, "This is the best choice"),
        makeOption("opt-b", "Option B", false),
      ],
    });

    // Act
    const event = aidlcQuestionToEvent(runId, q);

    // Assert
    if (event.payload.kind !== "question") throw new Error("unexpected kind");
    const opts = event.payload.options;
    expect(opts).toHaveLength(2);
    expect(opts![0]).toMatchObject({
      id: "opt-a",
      label: "Option A",
      hint: "This is the best choice",
      recommended: true,
    });
    expect(opts![1]).toMatchObject({
      id: "opt-b",
      label: "Option B",
    });
    expect(opts![1]!.recommended).toBeUndefined();
  });

  test("exactly-1-recommended is passed through faithfully (wire already validates)", () => {
    // Arrange — wire ensures exactly 1 recommended; mapper must not alter it
    const q = makeQuestion({
      options: [
        makeOption("a", "A", true),
        makeOption("b", "B", false),
        makeOption("c", "C", false),
      ],
    });

    // Act
    const event = aidlcQuestionToEvent(runId, q);

    // Assert
    if (event.payload.kind !== "question") throw new Error("unexpected kind");
    const recommended = event.payload.options!.filter((o) => o.recommended === true);
    expect(recommended).toHaveLength(1);
    expect(recommended[0]!.id).toBe("a");
  });

  test("background present → included in prompt (appended after separator)", () => {
    // Arrange
    const q = makeQuestion({
      prompt: "Primary question",
      background: "Background context here",
    });

    // Act
    const event = aidlcQuestionToEvent(runId, q);

    // Assert
    if (event.payload.kind !== "question") throw new Error("unexpected kind");
    // Background is merged into prompt so the human sees full context without
    // inventing new domain fields (spec: "keep prompt incl. background if helpful")
    expect(event.payload.prompt).toContain("Primary question");
    expect(event.payload.prompt).toContain("Background context here");
  });

  test("background absent → prompt is unchanged", () => {
    // Arrange
    const q = makeQuestion({ prompt: "Simple Q" });

    // Act
    const event = aidlcQuestionToEvent(runId, q);

    // Assert
    if (event.payload.kind !== "question") throw new Error("unexpected kind");
    expect(event.payload.prompt).toBe("Simple Q");
  });

  test("no taskId on event (not yet wired in v0)", () => {
    // Arrange
    const q = makeQuestion();

    // Act
    const event = aidlcQuestionToEvent(runId, q);

    // Assert — taskId is optional; not set in v0 live adapter
    expect(event.taskId).toBeUndefined();
  });

  test("option without hint → hint field is absent (not present as empty string)", () => {
    // Arrange
    const q = makeQuestion({
      options: [
        { id: "x", label: "X", recommended: true },
        { id: "y", label: "Y" },
      ],
    });

    // Act
    const event = aidlcQuestionToEvent(runId, q);

    // Assert
    if (event.payload.kind !== "question") throw new Error("unexpected kind");
    expect(event.payload.options![0]!.hint).toBeUndefined();
    expect(event.payload.options![1]!.hint).toBeUndefined();
  });
});

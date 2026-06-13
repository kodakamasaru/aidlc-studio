import { test, expect, describe } from "bun:test";
import {
  parseQuestionBlock,
  validateAidlcQuestion,
  serializeAnswers,
  parseAnswersBlock,
  type AidlcQuestion,
  type AidlcAnswer,
  type AidlcOption,
} from "./aidlc-wire";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeOption = (id: string, label: string, recommended = false): AidlcOption => ({
  id,
  label,
  ...(recommended ? { recommended: true } : {}),
});

const makeQuestion = (overrides: Partial<AidlcQuestion> = {}): AidlcQuestion => ({
  id: "q1",
  prompt: "Which approach?",
  answerKind: "single",
  options: [makeOption("a", "Option A", true), makeOption("b", "Option B")],
  ...overrides,
});

const fenceQuestion = (payload: unknown): string =>
  "Some prose before.\n" +
  "```aidlc-question\n" +
  JSON.stringify(payload) +
  "\n```\n" +
  "Some prose after.";

const fenceAnswers = (payload: unknown): string =>
  "```aidlc-answers\n" + JSON.stringify(payload) + "\n```";

// ---------------------------------------------------------------------------
// parseQuestionBlock
// ---------------------------------------------------------------------------

describe("parseQuestionBlock", () => {
  test("no block in text -> ok(null) — normal visual_review path, NOT an error", () => {
    // Arrange
    const text = "This is a plain response with no fenced blocks.";

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test("valid single question -> ok with parsed fields incl background/options/recommended", () => {
    // Arrange
    const q = makeQuestion({ background: "Context here" });
    const text = fenceQuestion({ questions: [q] });

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value).toHaveLength(1);
      const parsed = result.value[0];
      expect(parsed).toBeDefined();
      if (!parsed) return;
      expect(parsed.id).toBe("q1");
      expect(parsed.prompt).toBe("Which approach?");
      expect(parsed.background).toBe("Context here");
      expect(parsed.answerKind).toBe("single");
      expect(parsed.options).toHaveLength(2);
      const firstOption = parsed.options[0];
      expect(firstOption).toBeDefined();
      if (!firstOption) return;
      expect(firstOption.recommended).toBe(true);
    }
  });

  test("valid MULTIPLE questions in one block -> ok(array length N)", () => {
    // Arrange
    const q1 = makeQuestion({ id: "q1", prompt: "First?" });
    const q2 = makeQuestion({
      id: "q2",
      prompt: "Second?",
      options: [makeOption("x", "X", true), makeOption("y", "Y")],
    });
    const text = fenceQuestion({ questions: [q1, q2] });

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value).toHaveLength(2);
      const first = result.value[0];
      const second = result.value[1];
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      if (!first || !second) return;
      expect(first.id).toBe("q1");
      expect(second.id).toBe("q2");
    }
  });

  test("malformed JSON inside block -> err bad-json", () => {
    // Arrange
    const text = "```aidlc-question\n{ this is not valid json }\n```";

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("bad-json");
      expect(result.error.detail).toBeTruthy();
    }
  });

  test("question with ZERO recommended options -> err schema", () => {
    // Arrange
    const q = makeQuestion({
      options: [makeOption("a", "A"), makeOption("b", "B")], // none recommended
    });
    const text = fenceQuestion({ questions: [q] });

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("recommended");
    }
  });

  test("question with TWO recommended options -> err schema (exactly-one rule)", () => {
    // Arrange
    const q = makeQuestion({
      options: [makeOption("a", "A", true), makeOption("b", "B", true)],
    });
    const text = fenceQuestion({ questions: [q] });

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("recommended");
    }
  });

  test("missing options field -> err schema", () => {
    // Arrange
    const { options: _omitted, ...qWithoutOptions } = makeQuestion();
    const text = fenceQuestion({ questions: [qWithoutOptions] });

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("empty options array -> err schema", () => {
    // Arrange
    const q = makeQuestion({ options: [] });
    const text = fenceQuestion({ questions: [q] });

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("missing prompt -> err schema naming the field", () => {
    // Arrange
    const { prompt: _omitted, ...qWithoutPrompt } = makeQuestion();
    const text = fenceQuestion({ questions: [qWithoutPrompt] });

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("prompt");
    }
  });

  test("missing id -> err schema naming the field", () => {
    // Arrange
    const { id: _omitted, ...qWithoutId } = makeQuestion();
    const text = fenceQuestion({ questions: [qWithoutId] });

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("id");
    }
  });

  test("block surrounded by other prose text -> still extracted correctly", () => {
    // Arrange
    const q = makeQuestion();
    const text =
      "Long prose paragraph above the question block.\n\n" +
      "More explanation here.\n\n" +
      fenceQuestion({ questions: [q] }) +
      "\n\nAnother paragraph below.";

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value).toHaveLength(1);
    }
  });

  test("fence with wrong language tag is NOT extracted -> ok(null)", () => {
    // Arrange — different fence language
    const text = "```json\n{\"questions\":[]}\n```";

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// validateAidlcQuestion
// ---------------------------------------------------------------------------

describe("validateAidlcQuestion", () => {
  test("exactly-one recommended boundary: 1 recommended -> ok", () => {
    // Arrange
    const q = makeQuestion(); // options[0] has recommended=true

    // Act
    const result = validateAidlcQuestion(q);

    // Assert
    expect(result.ok).toBe(true);
  });

  test("exactly-one recommended boundary: 0 recommended -> err schema", () => {
    // Arrange
    const q = makeQuestion({ options: [makeOption("a", "A"), makeOption("b", "B")] });

    // Act
    const result = validateAidlcQuestion(q);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("recommended");
    }
  });

  test("exactly-one recommended boundary: 2 recommended -> err schema", () => {
    // Arrange
    const q = makeQuestion({
      options: [makeOption("a", "A", true), makeOption("b", "B", true)],
    });

    // Act
    const result = validateAidlcQuestion(q);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("invalid answerKind -> err schema naming the field", () => {
    // Arrange
    const q = { ...makeQuestion(), answerKind: "checkbox" as unknown };

    // Act
    const result = validateAidlcQuestion(q);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("answerkind");
    }
  });

  test("non-object input -> err schema", () => {
    // Act
    const result = validateAidlcQuestion(null);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("option with empty id -> err schema", () => {
    // Arrange
    const q = makeQuestion({
      options: [{ id: "", label: "Label", recommended: true }],
    });

    // Act
    const result = validateAidlcQuestion(q);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("option with empty label -> err schema", () => {
    // Arrange
    const q = makeQuestion({
      options: [{ id: "a", label: "", recommended: true }],
    });

    // Act
    const result = validateAidlcQuestion(q);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });
});

// ---------------------------------------------------------------------------
// serializeAnswers / parseAnswersBlock round-trip
// ---------------------------------------------------------------------------

describe("serializeAnswers -> parseAnswersBlock round-trip", () => {
  test("single choice answer round-trips correctly", () => {
    // Arrange
    const answers: AidlcAnswer[] = [{ questionId: "q1", choiceIds: ["a"] }];

    // Act
    const serialized = serializeAnswers(answers);
    const result = parseAnswersBlock(serialized);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(answers);
    }
  });

  test("multi choiceIds answer round-trips correctly", () => {
    // Arrange
    const answers: AidlcAnswer[] = [
      { questionId: "q1", choiceIds: ["a", "b", "c"] },
    ];

    // Act
    const serialized = serializeAnswers(answers);
    const result = parseAnswersBlock(serialized);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      const first = result.value[0];
      expect(first).toBeDefined();
      if (!first) return;
      expect(first.choiceIds).toEqual(["a", "b", "c"]);
    }
  });

  test("answer with note round-trips correctly", () => {
    // Arrange
    const answers: AidlcAnswer[] = [
      { questionId: "q2", choiceIds: ["x"], note: "Additional context here" },
    ];

    // Act
    const serialized = serializeAnswers(answers);
    const result = parseAnswersBlock(serialized);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      const first = result.value[0];
      expect(first).toBeDefined();
      if (!first) return;
      expect(first.note).toBe("Additional context here");
    }
  });

  test("multiple answers round-trip correctly", () => {
    // Arrange
    const answers: AidlcAnswer[] = [
      { questionId: "q1", choiceIds: ["yes"] },
      { questionId: "q2", choiceIds: ["a", "b"], note: "multi pick" },
    ];

    // Act
    const serialized = serializeAnswers(answers);
    const result = parseAnswersBlock(serialized);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      const second = result.value[1];
      expect(second).toBeDefined();
      if (!second) return;
      expect(second.note).toBe("multi pick");
    }
  });

  test("serializeAnswers produces correct fence delimiters", () => {
    // Arrange
    const answers: AidlcAnswer[] = [{ questionId: "q1", choiceIds: ["a"] }];

    // Act
    const serialized = serializeAnswers(answers);

    // Assert — must start with the opening fence line and end with closing fence
    const lines = serialized.split("\n");
    expect(lines[0]).toBe("```aidlc-answers");
    expect(lines[lines.length - 1]).toBe("```");
  });

  test("empty answers array round-trips to empty array", () => {
    // Arrange
    const answers: AidlcAnswer[] = [];

    // Act
    const serialized = serializeAnswers(answers);
    const result = parseAnswersBlock(serialized);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// parseAnswersBlock (failure cases)
// ---------------------------------------------------------------------------

describe("parseAnswersBlock failure cases", () => {
  test("no block in text -> err no-block (answers absence IS an error)", () => {
    // Arrange
    const text = "Plain response text with no fenced block.";

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("no-block");
      expect(result.error.detail).toBeTruthy();
    }
  });

  test("bad json inside aidlc-answers block -> err bad-json", () => {
    // Arrange
    const text = "```aidlc-answers\n{ not valid json }\n```";

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("bad-json");
    }
  });

  test("valid json but missing answers array -> err schema", () => {
    // Arrange
    const text = "```aidlc-answers\n{\"data\":[]}\n```";

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("answer with empty questionId -> err schema", () => {
    // Arrange
    const payload = { answers: [{ questionId: "", choiceIds: ["a"] }] };
    const text = fenceAnswers(payload);

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("answer with non-array choiceIds -> err schema", () => {
    // Arrange
    const payload = { answers: [{ questionId: "q1", choiceIds: "a" }] };
    const text = fenceAnswers(payload);

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("aidlc-question block present but not aidlc-answers -> err no-block", () => {
    // Arrange — different fence language
    const q = makeQuestion();
    const text = fenceQuestion({ questions: [q] });

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("no-block");
    }
  });
});

// ---------------------------------------------------------------------------
// FIX 1 — validateAnswer: choiceIds element type checking
// ---------------------------------------------------------------------------

describe("parseAnswersBlock — choiceIds element type validation (FIX 1)", () => {
  test("choiceIds with numeric elements -> err schema", () => {
    // Arrange
    const payload = { answers: [{ questionId: "q1", choiceIds: [1, 2] }] };
    const text = fenceAnswers(payload);

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("choiceids");
    }
  });

  test("choiceIds with null element -> err schema", () => {
    // Arrange
    const payload = { answers: [{ questionId: "q1", choiceIds: [null] }] };
    const text = fenceAnswers(payload);

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("choiceids");
    }
  });

  test("choiceIds with valid string elements -> ok", () => {
    // Arrange
    const payload = { answers: [{ questionId: "q1", choiceIds: ["a", "b"] }] };
    const text = fenceAnswers(payload);

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      const first = result.value[0];
      expect(first).toBeDefined();
      if (!first) return;
      expect(first.choiceIds).toEqual(["a", "b"]);
    }
  });
});

// ---------------------------------------------------------------------------
// FIX 2 — validateAnswer: reject truly blank answers, allow free-text-only
// ---------------------------------------------------------------------------

describe("parseAnswersBlock — blank answer rejection (FIX 2)", () => {
  test("empty choiceIds with no note -> err schema", () => {
    // Arrange
    const payload = { answers: [{ questionId: "q1", choiceIds: [] }] };
    const text = fenceAnswers(payload);

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("choice");
    }
  });

  test("empty choiceIds with meaningful note -> ok (free-text answer)", () => {
    // Arrange
    const payload = { answers: [{ questionId: "q1", choiceIds: [], note: "自由記入" }] };
    const text = fenceAnswers(payload);

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      const first = result.value[0];
      expect(first).toBeDefined();
      if (!first) return;
      expect(first.choiceIds).toEqual([]);
      expect(first.note).toBe("自由記入");
    }
  });

  test("choiceIds with one choice and no note -> ok", () => {
    // Arrange
    const payload = { answers: [{ questionId: "q1", choiceIds: ["a"] }] };
    const text = fenceAnswers(payload);

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      const first = result.value[0];
      expect(first).toBeDefined();
      if (!first) return;
      expect(first.choiceIds).toEqual(["a"]);
    }
  });

  test("empty choiceIds with whitespace-only note -> err schema", () => {
    // Arrange
    const payload = { answers: [{ questionId: "q1", choiceIds: [], note: "   " }] };
    const text = fenceAnswers(payload);

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });
});

// ---------------------------------------------------------------------------
// FIX 3 — unclosed fence must not be misclassified
// ---------------------------------------------------------------------------

describe("parseQuestionBlock — unclosed fence detection (FIX 3)", () => {
  test("unclosed aidlc-question fence -> err schema (NOT ok(null))", () => {
    // Arrange — open tag present, valid JSON body, but NO closing fence
    const q = makeQuestion();
    const text =
      "Some prose.\n" +
      "```aidlc-question\n" +
      JSON.stringify({ questions: [q] });

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("unclosed");
    }
  });

  test("no aidlc-question block at all -> ok(null) (unchanged)", () => {
    // Arrange
    const text = "Plain prose with no fence block at all.";

    // Act
    const result = parseQuestionBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });
});

describe("parseAnswersBlock — unclosed fence detection (FIX 3)", () => {
  test("unclosed aidlc-answers fence -> err schema (NOT err no-block)", () => {
    // Arrange — open tag present, valid JSON body, but NO closing fence
    const payload = { answers: [{ questionId: "q1", choiceIds: ["a"] }] };
    const text = "```aidlc-answers\n" + JSON.stringify(payload);

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("unclosed");
    }
  });

  test("no aidlc-answers block at all -> err no-block (unchanged)", () => {
    // Arrange
    const text = "Plain prose with no fence block at all.";

    // Act
    const result = parseAnswersBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("no-block");
    }
  });
});

import { test, expect, describe } from "bun:test";
import {
  parseAidlcResultBlock,
  validateAidlcResult,
  serializeAidlcResult,
  type AidlcResult,
  type AidlcDecision,
} from "./aidlc-result";
import { type AidlcQuestion, type AidlcOption } from "./aidlc-wire";

// ---------------------------------------------------------------------------
// Test helpers
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

const makeDecision = (overrides: Partial<AidlcDecision> = {}): AidlcDecision => ({
  id: "D-01",
  decision: "Use minified JSON fenced blocks",
  reason: "Parse is deterministic and fails clearly",
  ...overrides,
});

const makeResult = (overrides: Partial<AidlcResult> = {}): AidlcResult => ({
  artifacts: ["aidlc-docs/v0.0.4/s1/index.md"],
  questions: [],
  decisions: [],
  completeness: {
    requirements: [{ key: "REQ-01", text: "System handles Q&A flow" }],
    addressed: ["REQ-01"],
  },
  status: "done",
  ...overrides,
});

const fenceResult = (payload: unknown): string =>
  "```aidlc-result\n" + JSON.stringify(payload) + "\n```";

// ---------------------------------------------------------------------------
// parseAidlcResultBlock — fence scanning
// ---------------------------------------------------------------------------

describe("parseAidlcResultBlock — fence scanning", () => {
  test("no aidlc-result block -> ok(null) — caller falls back", () => {
    // Arrange
    const text = "This is a plain response with no fenced blocks.";

    // Act
    const result = parseAidlcResultBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test("different fence language (json) -> ok(null)", () => {
    // Arrange
    const text = "```json\n{\"status\":\"done\"}\n```";

    // Act
    const result = parseAidlcResultBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test("aidlc-question block present but not aidlc-result -> ok(null)", () => {
    // Arrange
    const text = "```aidlc-question\n{\"questions\":[]}\n```";

    // Act
    const result = parseAidlcResultBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test("unclosed aidlc-result fence -> err schema", () => {
    // Arrange
    const text = "```aidlc-result\n{\"status\":\"done\"}";

    // Act
    const result = parseAidlcResultBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("unclosed");
    }
  });

  test("bad JSON inside block -> err bad-json", () => {
    // Arrange
    const text = "```aidlc-result\n{ this is not valid json }\n```";

    // Act
    const result = parseAidlcResultBlock(text);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("bad-json");
      expect(result.error.detail).toBeTruthy();
    }
  });

  test("valid minimal result block -> ok(AidlcResult)", () => {
    // Arrange
    const payload = makeResult();
    const text = fenceResult(payload);

    // Act
    const result = parseAidlcResultBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value.status).toBe("done");
      expect(result.value.artifacts).toHaveLength(1);
      expect(result.value.questions).toHaveLength(0);
    }
  });

  test("block surrounded by prose text is still extracted", () => {
    // Arrange
    const payload = makeResult();
    const text =
      "Long prose above.\n\nMore content here.\n\n" +
      fenceResult(payload) +
      "\n\nProse below.";

    // Act
    const result = parseAidlcResultBlock(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// validateAidlcResult — status field
// ---------------------------------------------------------------------------

describe("validateAidlcResult — status", () => {
  test("status: done -> ok", () => {
    // Arrange
    const raw = makeResult({ status: "done" });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(true);
  });

  test("status: needs_human -> ok", () => {
    // Arrange
    const raw = makeResult({ status: "needs_human" });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("needs_human");
    }
  });

  test("status: stalled -> ok", () => {
    // Arrange
    const raw = makeResult({ status: "stalled" });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("stalled");
    }
  });

  test("status missing -> err schema", () => {
    // Arrange
    const { status: _omit, ...raw } = makeResult();

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("status");
    }
  });

  test("status: invalid value -> err schema", () => {
    // Arrange
    const raw = { ...makeResult(), status: "pending" };

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("status");
    }
  });

  test("non-object input -> err schema", () => {
    // Act
    const result = validateAidlcResult(null);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("array input -> err schema", () => {
    // Act
    const result = validateAidlcResult([]);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });
});

// ---------------------------------------------------------------------------
// validateAidlcResult — artifacts field
// ---------------------------------------------------------------------------

describe("validateAidlcResult — artifacts", () => {
  test("artifacts: [] is valid", () => {
    // Arrange
    const raw = makeResult({ artifacts: [] });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(true);
  });

  test("artifacts: multiple paths valid", () => {
    // Arrange
    const raw = makeResult({
      artifacts: ["aidlc-docs/v0.0.4/s1/index.md", "aidlc-docs/v0.0.4/s2/index.md"],
    });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.artifacts).toHaveLength(2);
    }
  });

  test("artifacts missing -> err schema", () => {
    // Arrange
    const { artifacts: _omit, ...raw } = makeResult();

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("artifacts");
    }
  });

  test("artifacts with empty string -> err schema", () => {
    // Arrange
    const raw = makeResult({ artifacts: ["aidlc-docs/valid.md", ""] });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("artifact");
    }
  });

  test("artifacts with non-string element -> err schema", () => {
    // Arrange
    const raw = { ...makeResult(), artifacts: ["aidlc-docs/valid.md", 42] };

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("artifacts with null element -> err schema", () => {
    // Arrange
    const raw = { ...makeResult(), artifacts: [null] };

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });
});

// ---------------------------------------------------------------------------
// validateAidlcResult — questions field (delegates to validateAidlcQuestion)
// ---------------------------------------------------------------------------

describe("validateAidlcResult — questions", () => {
  test("questions: [] is valid", () => {
    // Arrange
    const raw = makeResult({ questions: [] });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(true);
  });

  test("questions: valid array with one question -> ok", () => {
    // Arrange
    const raw = makeResult({ questions: [makeQuestion()], status: "needs_human" });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.questions).toHaveLength(1);
      const q = result.value.questions[0];
      expect(q).toBeDefined();
      if (q) {
        expect(q.id).toBe("q1");
      }
    }
  });

  test("questions missing -> err schema", () => {
    // Arrange
    const { questions: _omit, ...raw } = makeResult();

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("questions");
    }
  });

  test("questions not array -> err schema", () => {
    // Arrange
    const raw = { ...makeResult(), questions: "not an array" };

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("question violating exactly-1-recommended -> err schema", () => {
    // Arrange — two options both recommended, violates the rule
    const badQuestion = makeQuestion({
      options: [makeOption("a", "A", true), makeOption("b", "B", true)],
    });
    const raw = makeResult({ questions: [badQuestion] });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("recommended");
    }
  });

  test("question with zero recommended options -> err schema", () => {
    // Arrange
    const badQuestion = makeQuestion({
      options: [makeOption("a", "A"), makeOption("b", "B")],
    });
    const raw = makeResult({ questions: [badQuestion] });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("recommended");
    }
  });
});

// ---------------------------------------------------------------------------
// validateAidlcResult — decisions field
// ---------------------------------------------------------------------------

describe("validateAidlcResult — decisions", () => {
  test("decisions: [] is valid", () => {
    // Arrange
    const raw = makeResult({ decisions: [] });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(true);
  });

  test("decisions: valid array -> ok", () => {
    // Arrange
    const raw = makeResult({ decisions: [makeDecision()] });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.decisions).toHaveLength(1);
      const d = result.value.decisions[0];
      expect(d).toBeDefined();
      if (d) {
        expect(d.id).toBe("D-01");
        expect(d.decision).toBeTruthy();
        expect(d.reason).toBeTruthy();
      }
    }
  });

  test("decisions missing -> err schema", () => {
    // Arrange
    const { decisions: _omit, ...raw } = makeResult();

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("decisions");
    }
  });

  test("decision missing id -> err schema", () => {
    // Arrange
    const { id: _omit, ...badDecision } = makeDecision();
    const raw = makeResult({ decisions: [badDecision as AidlcDecision] });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("decision with empty id -> err schema", () => {
    // Arrange
    const raw = makeResult({ decisions: [makeDecision({ id: "" })] });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("decision with empty decision -> err schema", () => {
    // Arrange
    const raw = makeResult({ decisions: [makeDecision({ decision: "" })] });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("decision with empty reason -> err schema", () => {
    // Arrange
    const raw = makeResult({ decisions: [makeDecision({ reason: "" })] });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("decision element not an object -> err schema", () => {
    // Arrange
    const raw = { ...makeResult(), decisions: ["not an object"] };

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });
});

// ---------------------------------------------------------------------------
// validateAidlcResult — completeness field (integrity rule: addressed ⊆ requirements)
// ---------------------------------------------------------------------------

describe("validateAidlcResult — completeness", () => {
  test("completeness: fully addressed (addressed = requirements) -> ok", () => {
    // Arrange
    const raw = makeResult({
      completeness: {
        requirements: [{ key: "REQ-01", text: "Handles questions" }],
        addressed: ["REQ-01"],
      },
    });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(true);
  });

  test("completeness: partial gap (addressed ⊊ requirements) -> ok AND computable", () => {
    // Arrange — REQ-02 not addressed = valid gap
    const raw = makeResult({
      status: "needs_human",
      completeness: {
        requirements: [
          { key: "REQ-01", text: "Handles questions" },
          { key: "REQ-02", text: "Handles artifacts" },
        ],
        addressed: ["REQ-01"],
      },
    });

    // Act
    const result = validateAidlcResult(raw);

    // Assert — gap is valid, caller can compute missing = requirements.keys - addressed
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { requirements, addressed } = result.value.completeness;
      const allKeys = requirements.map((r) => r.key);
      const gap = allKeys.filter((k) => !addressed.includes(k));
      expect(gap).toEqual(["REQ-02"]);
    }
  });

  test("completeness: addressed empty [] -> ok (fully open gap)", () => {
    // Arrange
    const raw = makeResult({
      status: "stalled",
      completeness: {
        requirements: [{ key: "REQ-01", text: "Something" }],
        addressed: [],
      },
    });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(true);
  });

  test("completeness: addressed key NOT in requirements -> err schema (integrity rule)", () => {
    // Arrange
    const raw = makeResult({
      completeness: {
        requirements: [{ key: "REQ-01", text: "Handles questions" }],
        addressed: ["REQ-99"], // REQ-99 not defined
      },
    });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail).toContain("REQ-99");
    }
  });

  test("completeness: multiple addressed keys one missing from requirements -> err schema", () => {
    // Arrange
    const raw = makeResult({
      completeness: {
        requirements: [
          { key: "REQ-01", text: "First" },
          { key: "REQ-02", text: "Second" },
        ],
        addressed: ["REQ-01", "REQ-99"],
      },
    });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail).toContain("REQ-99");
    }
  });

  test("completeness missing -> err schema", () => {
    // Arrange
    const { completeness: _omit, ...raw } = makeResult();

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("completeness");
    }
  });

  test("completeness.requirements missing -> err schema", () => {
    // Arrange
    const raw = { ...makeResult(), completeness: { addressed: [] } };

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("completeness.addressed missing -> err schema", () => {
    // Arrange
    const raw = {
      ...makeResult(),
      completeness: { requirements: [{ key: "R1", text: "t" }] },
    };

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("requirement with empty key -> err schema", () => {
    // Arrange
    const raw = makeResult({
      completeness: {
        requirements: [{ key: "", text: "Some requirement" }],
        addressed: [],
      },
    });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("requirement with empty text -> err schema", () => {
    // Arrange
    const raw = makeResult({
      completeness: {
        requirements: [{ key: "REQ-01", text: "" }],
        addressed: [],
      },
    });

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("addressed with non-string element -> err schema", () => {
    // Arrange
    const raw = {
      ...makeResult(),
      completeness: {
        requirements: [{ key: "REQ-01", text: "Something" }],
        addressed: [42],
      },
    };

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });

  test("requirements with non-object element -> err schema", () => {
    // Arrange
    const raw = {
      ...makeResult(),
      completeness: {
        requirements: ["not an object"],
        addressed: [],
      },
    };

    // Act
    const result = validateAidlcResult(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
    }
  });
});

// ---------------------------------------------------------------------------
// serializeAidlcResult
// ---------------------------------------------------------------------------

describe("serializeAidlcResult", () => {
  test("produces correct fence delimiters", () => {
    // Arrange
    const r = makeResult();

    // Act
    const serialized = serializeAidlcResult(r);

    // Assert
    const lines = serialized.split("\n");
    expect(lines[0]).toBe("```aidlc-result");
    expect(lines[lines.length - 1]).toBe("```");
  });

  test("middle line is minified JSON (single line)", () => {
    // Arrange
    const r = makeResult();

    // Act
    const serialized = serializeAidlcResult(r);

    // Assert — the content between the fences is one line (minified)
    const lines = serialized.split("\n");
    expect(lines).toHaveLength(3); // open + content + close
    // The content line should parse as valid JSON
    const content = lines[1];
    expect(content).toBeDefined();
    if (!content) return;
    expect(() => JSON.parse(content)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Round-trip: serializeAidlcResult -> parseAidlcResultBlock
// ---------------------------------------------------------------------------

describe("round-trip: serialize -> parse", () => {
  test("minimal result (done, no questions, no decisions) round-trips correctly", () => {
    // Arrange
    const original = makeResult();

    // Act
    const serialized = serializeAidlcResult(original);
    const result = parseAidlcResultBlock(serialized);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value.status).toBe(original.status);
      expect(result.value.artifacts).toEqual(original.artifacts);
      expect(result.value.questions).toEqual(original.questions);
      expect(result.value.decisions).toEqual(original.decisions);
      expect(result.value.completeness).toEqual(original.completeness);
    }
  });

  test("result with question round-trips correctly", () => {
    // Arrange
    const original = makeResult({
      status: "needs_human",
      questions: [makeQuestion()],
    });

    // Act
    const serialized = serializeAidlcResult(original);
    const result = parseAidlcResultBlock(serialized);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value.questions).toHaveLength(1);
      const q = result.value.questions[0];
      expect(q).toBeDefined();
      if (q) {
        expect(q.id).toBe("q1");
        expect(q.answerKind).toBe("single");
      }
    }
  });

  test("result with decision round-trips correctly", () => {
    // Arrange
    const original = makeResult({
      decisions: [makeDecision()],
    });

    // Act
    const serialized = serializeAidlcResult(original);
    const result = parseAidlcResultBlock(serialized);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value.decisions).toHaveLength(1);
      const d = result.value.decisions[0];
      expect(d).toBeDefined();
      if (d) {
        expect(d.id).toBe("D-01");
        expect(d.reason).toBeTruthy();
      }
    }
  });

  test("result with gap (addressed ⊊ requirements) round-trips and gap is preserved", () => {
    // Arrange
    const original = makeResult({
      status: "needs_human",
      completeness: {
        requirements: [
          { key: "REQ-01", text: "First" },
          { key: "REQ-02", text: "Second" },
        ],
        addressed: ["REQ-01"],
      },
    });

    // Act
    const serialized = serializeAidlcResult(original);
    const result = parseAidlcResultBlock(serialized);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value.completeness.requirements).toHaveLength(2);
      expect(result.value.completeness.addressed).toEqual(["REQ-01"]);
      // gap is computable
      const missing = result.value.completeness.requirements
        .map((r) => r.key)
        .filter((k) => !result.value!.completeness.addressed.includes(k));
      expect(missing).toEqual(["REQ-02"]);
    }
  });
});

// ---------------------------------------------------------------------------
// Full realistic envelope test
// ---------------------------------------------------------------------------

describe("full realistic envelope", () => {
  test("done + 2 artifacts + 0 questions + 1 decision + completeness with gap -> ok", () => {
    // Arrange
    const envelope: AidlcResult = {
      artifacts: [
        "aidlc-docs/v0.0.4/s1/index.md",
        "aidlc-docs/v0.0.4/s1/requirements.md",
      ],
      questions: [],
      decisions: [
        {
          id: "D-01",
          decision: "Use minified fenced JSON for AI output",
          reason:
            "Parse is deterministic and clearly fails; JSON > YAML > MD for structured matching",
        },
      ],
      completeness: {
        requirements: [
          { key: "US-01", text: "Brief and context injection" },
          { key: "US-03", text: "Structured question emission" },
          { key: "US-04", text: "Resume via turn continuation" },
        ],
        addressed: ["US-01", "US-03"],
      },
      status: "done",
    };

    // Act
    const result = validateAidlcResult(envelope);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("done");
      expect(result.value.artifacts).toHaveLength(2);
      expect(result.value.questions).toHaveLength(0);
      expect(result.value.decisions).toHaveLength(1);
      const gap = result.value.completeness.requirements
        .map((r) => r.key)
        .filter((k) => !result.value.completeness.addressed.includes(k));
      expect(gap).toEqual(["US-04"]);
    }
  });

  test("needs_human + 1 question + 1 decision full round-trip", () => {
    // Arrange
    const envelope: AidlcResult = {
      artifacts: ["aidlc-docs/v0.0.4/s8/index.md"],
      questions: [
        {
          id: "q1",
          prompt: "Does this integration look correct?",
          answerKind: "single",
          options: [
            { id: "yes", label: "Yes, looks good", recommended: true },
            { id: "no", label: "No, has issues" },
          ],
        },
      ],
      decisions: [
        {
          id: "D-02",
          decision: "Wire aidlc-result as the sole AI output format",
          reason: "Prevents the split format problem between question and non-question runs",
        },
      ],
      completeness: {
        requirements: [
          { key: "REQ-01", text: "Output format unified" },
          { key: "REQ-02", text: "Visual review with artifacts" },
        ],
        addressed: ["REQ-01"],
      },
      status: "needs_human",
    };

    // Act
    const serialized = serializeAidlcResult(envelope);
    const result = parseAidlcResultBlock(serialized);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value.status).toBe("needs_human");
      expect(result.value.questions).toHaveLength(1);
      expect(result.value.decisions).toHaveLength(1);
      expect(result.value.completeness.addressed).toEqual(["REQ-01"]);
    }
  });
});

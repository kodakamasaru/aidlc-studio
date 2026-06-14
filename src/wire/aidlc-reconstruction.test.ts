/**
 * Tests for aidlc-reconstruction wire functions:
 *   parseReconstructionBlock / serializeReconstructionProposal / validateReconstructionProposal
 *
 * Pure-module TDD suite. Mirrors the shape of aidlc-wire.test.ts.
 */
import { test, expect, describe } from "bun:test";
import {
  parseReconstructionBlock,
  serializeReconstructionProposal,
  validateReconstructionProposal,
  type ReconstructionProposal,
  type ReconstructionStep,
} from "./aidlc-wire";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeStep = (overrides: Partial<ReconstructionStep> = {}): ReconstructionStep => ({
  id: "S1",
  label: "要件ヒアリング",
  order: 0,
  skillRef: "kit/skills/aidlc-s1-requirements",
  instruction: "S1 のルール本文",
  diff: "keep",
  ...overrides,
});

const makeProposal = (overrides: Partial<ReconstructionProposal> = {}): ReconstructionProposal => ({
  scope: "cycle",
  steps: [makeStep()],
  ...overrides,
});

const fenceReconstruction = (payload: unknown): string =>
  "Some prose before.\n" +
  "```aidlc-reconstruction\n" +
  JSON.stringify(payload) +
  "\n```\n" +
  "Some prose after.";

// ---------------------------------------------------------------------------
// validateReconstructionProposal
// ---------------------------------------------------------------------------

describe("validateReconstructionProposal", () => {
  test("valid cycle-scoped proposal with one keep step -> ok", () => {
    const result = validateReconstructionProposal(makeProposal());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scope).toBe("cycle");
      expect(result.value.steps).toHaveLength(1);
      expect(result.value.steps[0]?.diff).toBe("keep");
    }
  });

  test("valid global-scoped proposal -> ok", () => {
    const result = validateReconstructionProposal(
      makeProposal({ scope: "global", steps: [makeStep({ diff: "current" })] }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.scope).toBe("global");
  });

  test("all valid diff values -> ok", () => {
    const diffs = ["keep", "add", "delete", "current"] as const;
    for (const diff of diffs) {
      const step = diff === "delete"
        ? makeStep({ diff, reason: "S4 は今サイクル不要" })
        : makeStep({ diff });
      const result = validateReconstructionProposal(makeProposal({ steps: [step] }));
      expect(result.ok).toBe(true);
    }
  });

  test("delete step without reason -> err schema", () => {
    const step = makeStep({ diff: "delete" }); // no reason
    const result = validateReconstructionProposal(makeProposal({ steps: [step] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("reason");
    }
  });

  test("delete step with empty reason -> err schema", () => {
    const step = makeStep({ diff: "delete", reason: "   " });
    const result = validateReconstructionProposal(makeProposal({ steps: [step] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("schema");
  });

  test("delete step with valid reason -> ok", () => {
    const step = makeStep({ diff: "delete", reason: "S4 技術仕様は今サイクル不要" });
    const result = validateReconstructionProposal(makeProposal({ steps: [step] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.steps[0]?.reason).toBe("S4 技術仕様は今サイクル不要");
  });

  test("invalid scope -> err schema", () => {
    const result = validateReconstructionProposal({ scope: "project", steps: [makeStep()] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("scope");
    }
  });

  test("empty steps array -> err schema", () => {
    const result = validateReconstructionProposal({ scope: "cycle", steps: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("steps");
    }
  });

  test("missing steps field -> err schema", () => {
    const result = validateReconstructionProposal({ scope: "cycle" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("schema");
  });

  test("non-object input -> err schema", () => {
    const result = validateReconstructionProposal(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("schema");
  });

  test("step with negative order -> err schema", () => {
    const result = validateReconstructionProposal(
      makeProposal({ steps: [makeStep({ order: -1 })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("order");
    }
  });

  test("step with invalid diff -> err schema", () => {
    const result = validateReconstructionProposal(
      makeProposal({ steps: [makeStep({ diff: "modify" as "keep" })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("diff");
    }
  });

  test("step with empty id -> err schema", () => {
    const result = validateReconstructionProposal(
      makeProposal({ steps: [makeStep({ id: "" })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("schema");
  });

  test("step with empty label -> err schema", () => {
    const result = validateReconstructionProposal(
      makeProposal({ steps: [makeStep({ label: "" })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("schema");
  });

  test("step with empty skillRef -> err schema", () => {
    const result = validateReconstructionProposal(
      makeProposal({ steps: [makeStep({ skillRef: "" })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("schema");
  });

  test("step with empty instruction string -> ok (empty string is allowed)", () => {
    // Empty instruction is valid — the AI may have no custom rule to add
    const result = validateReconstructionProposal(
      makeProposal({ steps: [makeStep({ instruction: "" })] }),
    );
    expect(result.ok).toBe(true);
  });

  test("multi-step proposal with mixed diffs -> ok", () => {
    const steps: ReconstructionStep[] = [
      makeStep({ id: "S1", label: "要件", order: 0, diff: "keep" }),
      makeStep({ id: "S2", label: "画面", order: 1, diff: "keep" }),
      makeStep({ id: "S3", label: "UIデザイン", order: 2, diff: "keep" }),
      makeStep({ id: "S4", label: "技術仕様", order: 3, diff: "delete", reason: "今サイクル不要" }),
      makeStep({ id: "CUSTOM-QA", label: "独自QA", order: 4, skillRef: "kit/skills/aidlc-s1-requirements", diff: "add", instruction: "QA 手順" }),
    ];
    const result = validateReconstructionProposal({ scope: "cycle", steps });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.steps).toHaveLength(5);
      const deleteStep = result.value.steps.find((s) => s.diff === "delete");
      expect(deleteStep?.reason).toBe("今サイクル不要");
      const addStep = result.value.steps.find((s) => s.diff === "add");
      expect(addStep?.id).toBe("CUSTOM-QA");
    }
  });

  test("optional reason on non-delete step is carried through -> ok", () => {
    const step = makeStep({ diff: "add", reason: "プロジェクト固有工程" });
    const result = validateReconstructionProposal(makeProposal({ steps: [step] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.steps[0]?.reason).toBe("プロジェクト固有工程");
  });

  test("step without optional reason on non-delete -> ok, reason undefined", () => {
    const step = makeStep({ diff: "keep" });
    const result = validateReconstructionProposal(makeProposal({ steps: [step] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.steps[0]?.reason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseReconstructionBlock
// ---------------------------------------------------------------------------

describe("parseReconstructionBlock", () => {
  test("no block in text -> ok(null) — normal path (step did not emit proposal)", () => {
    const result = parseReconstructionBlock("Plain prose with no fenced blocks.");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  test("valid block -> ok(ReconstructionProposal)", () => {
    const proposal = makeProposal();
    const text = fenceReconstruction(proposal);
    const result = parseReconstructionBlock(text);
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value.scope).toBe("cycle");
      expect(result.value.steps).toHaveLength(1);
    }
  });

  test("block surrounded by prose -> extracted correctly", () => {
    const proposal = makeProposal({ scope: "global", steps: [makeStep({ diff: "current" })] });
    const text =
      "Long prose above.\n\n" + fenceReconstruction(proposal) + "\n\nProse below.";
    const result = parseReconstructionBlock(text);
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value.scope).toBe("global");
    }
  });

  test("malformed JSON -> err bad-json", () => {
    const text = "```aidlc-reconstruction\n{ not valid json }\n```";
    const result = parseReconstructionBlock(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("bad-json");
  });

  test("unclosed fence -> err schema with 'unclosed' in detail", () => {
    const text = "```aidlc-reconstruction\n" + JSON.stringify(makeProposal());
    // No closing fence
    const result = parseReconstructionBlock(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.detail.toLowerCase()).toContain("unclosed");
    }
  });

  test("block with valid JSON but invalid schema (missing scope) -> err schema", () => {
    const text = fenceReconstruction({ steps: [makeStep()] });
    const result = parseReconstructionBlock(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("schema");
  });

  test("wrong fence language tag -> ok(null)", () => {
    const text = "```json\n" + JSON.stringify(makeProposal()) + "\n```";
    const result = parseReconstructionBlock(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// serializeReconstructionProposal / parseReconstructionBlock round-trip
// ---------------------------------------------------------------------------

describe("serializeReconstructionProposal -> parseReconstructionBlock round-trip", () => {
  test("cycle-scoped proposal with keep/add/delete round-trips", () => {
    const proposal: ReconstructionProposal = {
      scope: "cycle",
      steps: [
        makeStep({ id: "S1", label: "要件", order: 0, diff: "keep", instruction: "S1 rules" }),
        makeStep({ id: "S2", label: "画面", order: 1, diff: "keep", instruction: "" }),
        makeStep({ id: "S4", label: "技術仕様", order: 3, diff: "delete", reason: "不要", instruction: "" }),
        makeStep({
          id: "CUSTOM-QA",
          label: "独自QA",
          order: 4,
          skillRef: "kit/skills/aidlc-s1-requirements",
          diff: "add",
          instruction: "QA手順 md本文",
        }),
      ],
    };
    const serialized = serializeReconstructionProposal(proposal);
    const result = parseReconstructionBlock(serialized);
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value.scope).toBe("cycle");
      expect(result.value.steps).toHaveLength(4);
      const s4 = result.value.steps.find((s) => s.id === "S4");
      expect(s4?.diff).toBe("delete");
      expect(s4?.reason).toBe("不要");
      const qa = result.value.steps.find((s) => s.id === "CUSTOM-QA");
      expect(qa?.instruction).toBe("QA手順 md本文");
    }
  });

  test("global-scoped proposal round-trips", () => {
    const proposal: ReconstructionProposal = {
      scope: "global",
      steps: [
        makeStep({ id: "S1", diff: "current", instruction: "Updated S1" }),
        makeStep({ id: "S6", label: "モデル", order: 1, diff: "current", instruction: "" }),
      ],
    };
    const serialized = serializeReconstructionProposal(proposal);
    const result = parseReconstructionBlock(serialized);
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value.scope).toBe("global");
      expect(result.value.steps).toHaveLength(2);
    }
  });

  test("serializeReconstructionProposal produces correct fence delimiters", () => {
    const serialized = serializeReconstructionProposal(makeProposal());
    const lines = serialized.split("\n");
    expect(lines[0]).toBe("```aidlc-reconstruction");
    expect(lines[lines.length - 1]).toBe("```");
  });
});

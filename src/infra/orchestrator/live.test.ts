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
  artifactBlockTitle,
  screenLabel,
  malformedResultEvent,
  buildRepairInstruction,
  MAX_REPAIR_ATTEMPTS,
  parseMarkdownImageRefs,
  stripImageRefs,
} from "./live";
import { parseAidlcResultBlock } from "../../wire/aidlc-result";
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

// ---------------------------------------------------------------------------
// artifactBlockTitle — F-10: review block titles must be business language,
// never a raw file path / aidlc-docs directory (人間はファイルを開けない / 契約①).
// ---------------------------------------------------------------------------

describe("artifactBlockTitle (F-10)", () => {
  test("uses the artifact's markdown H1 as the human title", () => {
    const body = "# US-01 メニュー閲覧\n\n社員が翌日のメニューを見る。";
    expect(artifactBlockTitle(body, "aidlc-docs/v0.0.2/s1/us-01-browse-menu.md")).toBe(
      "US-01 メニュー閲覧",
    );
  });

  test("never leaks the file path or aidlc-docs structure", () => {
    const rel = "aidlc-docs/v0.0.2/s1/us-01-browse-menu.md";
    const title = artifactBlockTitle("# Brief — オフィスランチ予約\n本文", rel);
    expect(title).not.toContain("aidlc-docs");
    expect(title).not.toContain("/");
    expect(title).not.toContain(".md");
  });

  test("falls back to a de-pathified filename when the body has no heading", () => {
    const title = artifactBlockTitle("見出しのない本文だけ", "aidlc-docs/v0.0.2/s1/us-02-place-order.md");
    expect(title).toBe("us 02 place order");
    expect(title).not.toContain("/");
  });

  test("prefers the first non-empty heading", () => {
    const body = "#\n##    実際の見出し   \n本文";
    expect(artifactBlockTitle(body, "x/y.md")).toBe("実際の見出し");
  });
});

// ---------------------------------------------------------------------------
// screenLabel — caption for a design screenshot block. Must NOT leak the path
// or .html filename (契約①); de-slugs the screen name.
// ---------------------------------------------------------------------------

describe("screenLabel (S3 視覚証拠)", () => {
  test("de-paths, drops .html, and de-slugs a screen artifact", () => {
    expect(screenLabel("aidlc-docs/v0.0.5/s3/scr-01-browse-menu.html")).toBe(
      "scr 01 browse menu",
    );
  });

  test("never leaks the path or extension", () => {
    const label = screenLabel("aidlc-docs/v0.0.5/s3/tokens.html");
    expect(label).not.toContain("/");
    expect(label).not.toContain(".html");
    expect(label).not.toContain("aidlc-docs");
  });
});

// ---------------------------------------------------------------------------
// S10 F-13 — a PRESENT-but-MALFORMED aidlc-result fence must become a retriable
// `stalled`, never a raw-text summary dump (which leaks internal JSON + drops the
// envelope's questions). Regression: reproduces the real S10 実機 failure where the
// model nested `status` inside `completeness` and omitted the root `}`.
// ---------------------------------------------------------------------------

describe("malformed aidlc-result handling (S10 F-13)", () => {
  // The exact structural defect seen in the S10 run: `status` placed INSIDE the
  // completeness object and the root object's closing `}` omitted → invalid JSON.
  const MALFORMED_ENVELOPE = [
    "要件一覧の初版を作成しました。",
    "",
    "```aidlc-result",
    '{"artifacts":["aidlc-docs/v0.0.1/s1/index.md"],"questions":[],"decisions":[],' +
      '"completeness":{"requirements":[{"key":"r1","text":"目的が1文で言える"}],' +
      '"addressed":["r1"],"status":"needs_human"}', // ← missing the root-object '}'
    "```",
  ].join("\n");

  test("the parser rejects the malformed envelope (root not closed)", () => {
    const r = parseAidlcResultBlock(MALFORMED_ENVELOPE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("bad-json");
  });

  test("malformedResultEvent emits a retriable stalled run state", () => {
    const ev = malformedResultEvent(runId);
    expect(ev.type).toBe("RunStateChanged");
    if (ev.type === "RunStateChanged") {
      expect(ev.to).toBe("stalled");
      expect(ev.reason && ev.reason.length).toBeGreaterThan(0);
    }
  });

  test("the stall reason never leaks internal JSON / paths (契約①)", () => {
    const ev = malformedResultEvent(runId);
    const reason = ev.type === "RunStateChanged" ? (ev.reason ?? "") : "";
    expect(reason).not.toContain("aidlc-docs");
    expect(reason).not.toContain("{");
    expect(reason).not.toContain('"');
    expect(reason).not.toContain(".md");
  });
});

describe("self-repair instruction (F-22)", () => {
  test("MAX_REPAIR_ATTEMPTS is a small positive bound (auto loop cannot run away)", () => {
    expect(MAX_REPAIR_ATTEMPTS).toBeGreaterThanOrEqual(1);
    expect(MAX_REPAIR_ATTEMPTS).toBeLessThanOrEqual(5);
  });

  test("names the failed fence, echoes the validator detail, and shows the expected shape", () => {
    const msg = buildRepairInstruction(
      "aidlc-question",
      "aidlc-question block must parse to { questions: AidlcQuestion[] }",
    );
    // The AI-facing repair message must tell the model WHICH fence + WHAT to emit.
    expect(msg).toContain("aidlc-question");
    expect(msg).toContain("must parse to"); // the validator's detail is echoed
    expect(msg).toContain('"questions"'); // expected shape reminder
    // It asks for exactly one corrected block, not a redo of the whole step.
    expect(msg).toContain("1 つだけ");
  });

  test("each fence kind gets its own schema reminder", () => {
    expect(buildRepairInstruction("aidlc-result", "x")).toContain('"status"');
    expect(buildRepairInstruction("aidlc-reconstruction", "x")).toContain('"scope"');
  });
});

describe("Markdown image refs in prose (F-23)", () => {
  // The real S10 prose: the model embedded screenshots as Markdown image links to
  // absolute file paths instead of emitting aidlc-result artifacts[].
  const PROSE = [
    "画面を実際にお見せします。",
    "",
    "![翌日メニュー一覧](/private/tmp/aidlc-sandbox/aidlc-docs/v0.0.1/s3/screenshots/scr-01.default.png)",
    "",
    "**予約完了**",
    "![予約完了](/private/tmp/aidlc-sandbox/aidlc-docs/v0.0.1/s3/screenshots/scr-03.default.png)",
  ].join("\n");

  test("parses each image ref with alt + path", () => {
    const refs = parseMarkdownImageRefs(PROSE);
    expect(refs).toHaveLength(2);
    expect(refs[0]?.alt).toBe("翌日メニュー一覧");
    expect(refs[0]?.path).toContain("scr-01.default.png");
    expect(refs[1]?.alt).toBe("予約完了");
  });

  test("ignores non-image links (only image extensions are candidates)", () => {
    const refs = parseMarkdownImageRefs("[要件一覧](aidlc-docs/s1/index.md) と ![x](a.png)");
    expect(refs).toHaveLength(1);
    expect(refs[0]?.path).toBe("a.png");
  });

  test("stripImageRefs replaces the raw link with a caption — no path leaks (契約①)", () => {
    const refs = parseMarkdownImageRefs(PROSE);
    const cleaned = stripImageRefs(PROSE, refs);
    expect(cleaned).not.toContain("/private/tmp");
    expect(cleaned).not.toContain(".png");
    expect(cleaned).not.toContain("![");
    expect(cleaned).toContain("翌日メニュー一覧"); // caption survives as readable text
  });
});

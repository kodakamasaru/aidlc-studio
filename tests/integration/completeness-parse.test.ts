// US-04 — deterministic checks for extractCompleteness: the live evaluator's
// structured verdict is parsed into the domain CompletenessBlock so the SAME app
// gate (gap = requirements − addressed) runs on real model output. Fixtures stand
// in for the model's result text; the real-AI path is the additive live test.
import { test, expect, describe } from "bun:test";
import { extractCompleteness } from "../../src/infra/orchestrator/completeness-parse";
import { evaluateCompleteness } from "../../src/domain/review/brief";

describe("extractCompleteness (US-04)", () => {
  test("parses a fenced json verdict → CompletenessBlock the gate can score", () => {
    const text = [
      "検証しました。要件 r1 は満たされ、r2 は未対応です。",
      "```json",
      '{"requirements":[{"key":"r1","text":"一覧表示"},{"key":"r2","text":"空状態"}],"addressed":["r1"]}',
      "```",
    ].join("\n");
    const block = extractCompleteness(text);
    expect(block).toBeDefined();
    const report = evaluateCompleteness(block!);
    expect(report.isComplete).toBe(false);
    expect(report.gaps.map((g) => g.key)).toEqual(["r2"]); // r2 is the gap
  });

  test("all addressed → complete (no gap)", () => {
    const block = extractCompleteness(
      '```json\n{"requirements":[{"key":"r1","text":"x"}],"addressed":["r1"]}\n```',
    );
    expect(evaluateCompleteness(block!).isComplete).toBe(true);
  });

  test("prefers the LAST valid fenced block (the model's final verdict)", () => {
    const text = [
      '```json\n{"requirements":[{"key":"r1","text":"x"}],"addressed":[]}\n```',
      "考え直した結果:",
      '```json\n{"requirements":[{"key":"r1","text":"x"}],"addressed":["r1"]}\n```',
    ].join("\n");
    expect(extractCompleteness(text)!.addressed).toEqual(["r1"]);
  });

  test("falls back to a bare object when the fence is missing", () => {
    const block = extractCompleteness(
      'verdict: {"requirements":[{"key":"a","text":"t"}],"addressed":["a"]} done',
    );
    expect(block?.addressed).toEqual(["a"]);
  });

  test("returns undefined on no JSON / wrong shape (→ visual_review fallback)", () => {
    expect(extractCompleteness("just prose, no verdict")).toBeUndefined();
    expect(
      extractCompleteness('```json\n{"requirements":[{"no":"key"}],"addressed":[]}\n```'),
    ).toBeUndefined();
    expect(
      extractCompleteness('```json\n{"requirements":[],"addressed":[1,2]}\n```'),
    ).toBeUndefined(); // addressed must be strings
  });
});

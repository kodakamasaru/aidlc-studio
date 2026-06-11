import { test, expect, describe } from "bun:test";
import {
  type CompletenessBlock,
  type Requirement,
  evaluateCompleteness,
} from "./brief";

const reqs: Requirement[] = [
  { key: "us-01", text: "Step が契約を宣言できる" },
  { key: "us-02", text: "gen→gate→eval が回る" },
  { key: "us-03", text: "完全性ゲートが gap を検出する" },
];

describe("evaluateCompleteness (S6: gaps = requirements − addressed, key 照合)", () => {
  test("returns the requirements not addressed (by stable key)", () => {
    const block: CompletenessBlock = { requirements: reqs, addressed: ["us-01", "us-03"] };
    const report = evaluateCompleteness(block);
    expect(report.gaps.map((r) => r.key)).toEqual(["us-02"]);
    expect(report.gaps[0]!.text).toBe("gen→gate→eval が回る"); // 平易文を運ぶ
    expect(report.isComplete).toBe(false);
  });

  test("all addressed → no gaps → complete", () => {
    const block: CompletenessBlock = {
      requirements: reqs,
      addressed: ["us-01", "us-02", "us-03"],
    };
    const report = evaluateCompleteness(block);
    expect(report.gaps).toEqual([]);
    expect(report.isComplete).toBe(true);
  });

  test("empty requirements → empty gaps (空なら gaps も空)", () => {
    const report = evaluateCompleteness({ requirements: [], addressed: [] });
    expect(report.gaps).toEqual([]);
    expect(report.isComplete).toBe(true);
  });

  test("gap algorithm ignores text drift — only keys matter", () => {
    // addressed が key で照合され、平易文の揺れに影響されない
    const block: CompletenessBlock = {
      requirements: [{ key: "us-01", text: "契約を宣言できる(言い回しA)" }],
      addressed: ["us-01"],
    };
    expect(evaluateCompleteness(block).isComplete).toBe(true);
  });

  test("unknown addressed key does not satisfy any requirement", () => {
    const block: CompletenessBlock = { requirements: reqs, addressed: ["typo-key"] };
    const report = evaluateCompleteness(block);
    expect(report.gaps.map((r) => r.key)).toEqual(["us-01", "us-02", "us-03"]);
  });
});

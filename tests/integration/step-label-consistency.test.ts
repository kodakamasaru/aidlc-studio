// US-02 drift guard: web の step-label は domain の CANONICAL_STEPS から「導出」する。
// web は別ビルドで domain を直接 import できないため値は手書きミラーだが、独自に作って
// drift しないことをこのテストで強制する(= 単一機械可読正本は CANONICAL_STEPS)。
import { test, expect, describe } from "bun:test";
import { CANONICAL_STEPS } from "../../src/domain/shared/vocab";
import { stepLabel } from "../../web/src/lib/step-label";

describe("step-label single source (US-02)", () => {
  test("web stepLabel(id) matches CANONICAL_STEPS.label for every canonical step", () => {
    for (const c of CANONICAL_STEPS) {
      expect(stepLabel(c.id as string)).toBe(c.label as string);
    }
  });

  test("web step-label covers exactly the v2 canonical step set (no retired S2.5)", () => {
    // すべての canonical step に平易名が当たる + S2.5 は退役済(id フォールバックで素通り)。
    expect(stepLabel("S2.5")).toBe("S2.5"); // 未知 → fallback(canonical に無い)
    expect(CANONICAL_STEPS.map((c) => c.id as string)).not.toContain("S2.5");
  });
});

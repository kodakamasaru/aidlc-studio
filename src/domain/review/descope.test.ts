import { test, expect, describe } from "bun:test";
import { Step } from "../shared/vocab";
import type { Requirement } from "./brief";
import { type DescopeRequest, decideDisposition } from "./descope";

const r = (key: string): Requirement => ({ key, text: `要件 ${key}` });
const req = (key: string, recommendedStep?: Step): DescopeRequest => ({
  requirement: r(key),
  aiReason: `${key} は v0.0.3 に送る`,
  ...(recommendedStep ? { recommendedStep } : {}),
});

describe("decideDisposition (S6 決定表)", () => {
  test("gap ゼロ → allow-done", () => {
    expect(decideDisposition([])).toEqual({ kind: "allow-done" });
  });

  test("gap あり / 見送り申請なし → auto-rework(人間に出さない)", () => {
    const d = decideDisposition([r("a"), r("b")]);
    expect(d.kind).toBe("auto-rework");
    if (d.kind === "auto-rework") {
      expect(d.unresolved.map((g) => g.key)).toEqual(["a", "b"]);
    }
  });

  test("一部 gap のみ申請 → 申請なし gap が残るので auto-rework に倒す(原則#6)", () => {
    const d = decideDisposition([r("a"), r("b")], [req("a")]);
    expect(d.kind).toBe("auto-rework");
    if (d.kind === "auto-rework") {
      expect(d.unresolved.map((g) => g.key)).toEqual(["b"]); // 未申請の b だけ残る
    }
  });

  test("全 gap が理由付き申請で覆われる → await-descope(人間へ)", () => {
    const d = decideDisposition([r("a"), r("b")], [req("a"), req("b", Step("S6"))]);
    expect(d.kind).toBe("await-descope");
    if (d.kind === "await-descope") {
      expect(d.requests.map((x) => x.requirement.key)).toEqual(["a", "b"]);
      expect(d.requests[1]!.recommendedStep).toBe(Step("S6"));
    }
  });

  test("gap に対応しない余分な申請は無視される", () => {
    const d = decideDisposition([r("a")], [req("a"), req("zzz")]);
    expect(d.kind).toBe("await-descope");
    if (d.kind === "await-descope") {
      expect(d.requests.map((x) => x.requirement.key)).toEqual(["a"]);
    }
  });
});

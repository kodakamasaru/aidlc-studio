import { test, expect, describe } from "bun:test";
import { ok, err, isOk, isErr, map, flatMap, unwrap } from "./result";
import { instant, nonEmptyText, compareInstant } from "./primitives";
import {
  VERDICTS,
  DEFAULT_STEPS,
  CANONICAL_STEPS,
  skillRefOf,
  labelOf,
  Step,
  sameStep,
} from "./vocab";

describe("Result", () => {
  test("ok wraps a value and is recognized by isOk", () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(unwrap(r)).toBe(42);
  });

  test("err wraps an error and short-circuits map/flatMap", () => {
    const r = err<"Boom">("Boom");
    expect(isErr(r)).toBe(true);
    expect(map(r, (n: number) => n + 1)).toEqual(r);
    expect(flatMap(r, (n: number) => ok(n + 1))).toEqual(r);
  });

  test("map and flatMap transform Ok", () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(flatMap(ok(2), (n) => ok(n * 3))).toEqual(ok(6));
  });
});

describe("Instant", () => {
  test("accepts ISO-8601 and rejects garbage", () => {
    expect(isOk(instant("2026-06-06T08:00:00Z"))).toBe(true);
    expect(isOk(instant("2026-06-06T08:00:00.123+09:00"))).toBe(true);
    expect(instant("not-a-date")).toEqual(err("InvalidInstant"));
  });

  test("compareInstant orders chronologically", () => {
    const a = unwrap(instant("2026-06-06T08:00:00Z"));
    const b = unwrap(instant("2026-06-06T09:00:00Z"));
    expect(compareInstant(a, b)).toBe(-1);
    expect(compareInstant(b, a)).toBe(1);
    expect(compareInstant(a, a)).toBe(0);
  });
});

describe("NonEmptyText", () => {
  test("rejects empty and whitespace-only", () => {
    expect(nonEmptyText("")).toEqual(err("EmptyText"));
    expect(nonEmptyText("   ")).toEqual(err("EmptyText"));
    expect(isOk(nonEmptyText("hello"))).toBe(true);
  });
});

describe("vocab", () => {
  test("VERDICTS has the base verdicts plus the v0.0.2 descope verdicts", () => {
    expect([...VERDICTS]).toEqual([
      "approve",
      "reject",
      "answer",
      "confirm",
      "rework",
      "descope",
      "defer",
      "rewind",
    ]);
  });

  test("DEFAULT_STEPS is the AI-DLC v2 12-step pipeline (S2.5 retired)", () => {
    expect(DEFAULT_STEPS.map((s) => s as string)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "S8",
      "S9",
      "S10",
      "S11",
      "S12",
    ]);
    expect(DEFAULT_STEPS.map((s) => s as string)).not.toContain("S2.5");
  });

  test("DEFAULT_STEPS is the id projection of CANONICAL_STEPS (single source / INV-C1)", () => {
    expect(DEFAULT_STEPS).toEqual(CANONICAL_STEPS.map((c) => c.id));
  });

  test("CANONICAL_STEPS maps each step to its real kit/skills dir (INV-C2)", () => {
    expect(skillRefOf(Step("S1")) as string).toBe("aidlc-s1-requirements");
    expect(skillRefOf(Step("S6")) as string).toBe("aidlc-s6-domain-model");
    expect(skillRefOf(Step("S12")) as string).toBe("aidlc-s12-workflow-improvement");
  });

  test("skillRefOf returns undefined for an unknown step", () => {
    expect(skillRefOf(Step("S2.5"))).toBeUndefined();
    expect(skillRefOf(Step("BOGUS"))).toBeUndefined();
  });

  test("CANONICAL_STEPS carries the 平易ラベル as the machine-readable source (US-02)", () => {
    // 単一 constant が step×平易ラベル×skillRef を持つ(web step-label はここから導出)。
    expect(labelOf(Step("S1"))).toBe("要件");
    expect(labelOf(Step("S6"))).toBe("モデル");
    // S2.5 退役 → S3 の意味が v2「UIデザイン」に統一(US-02 AC)。
    expect(labelOf(Step("S3"))).toBe("UIデザイン");
    expect(CANONICAL_STEPS.every((c) => (c.label as string).length > 0)).toBe(true);
  });

  test("labelOf returns undefined for an unknown step", () => {
    expect(labelOf(Step("S2.5"))).toBeUndefined();
    expect(labelOf(Step("BOGUS"))).toBeUndefined();
  });

  test("sameStep compares by value", () => {
    expect(sameStep(Step("S1"), Step("S1"))).toBe(true);
    expect(sameStep(Step("S1"), Step("S2"))).toBe(false);
  });
});

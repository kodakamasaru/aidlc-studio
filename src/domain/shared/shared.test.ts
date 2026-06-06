import { test, expect, describe } from "bun:test";
import { ok, err, isOk, isErr, map, flatMap, unwrap } from "./result";
import { instant, nonEmptyText, compareInstant } from "./primitives";
import { VERDICTS, DEFAULT_STEPS, Step, sameStep } from "./vocab";

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
  test("VERDICTS has the four shared verdicts", () => {
    expect([...VERDICTS]).toEqual(["approve", "reject", "answer", "confirm"]);
  });

  test("DEFAULT_STEPS is the AI-DLC S1..S7 pipeline", () => {
    expect(DEFAULT_STEPS.map((s) => s as string)).toEqual([
      "S1",
      "S2",
      "S2.5",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
    ]);
  });

  test("sameStep compares by value", () => {
    expect(sameStep(Step("S1"), Step("S1"))).toBe(true);
    expect(sameStep(Step("S1"), Step("S2"))).toBe(false);
  });
});

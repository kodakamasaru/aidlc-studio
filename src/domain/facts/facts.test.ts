import { test, expect, describe } from "bun:test";
import { unwrap } from "../shared/result";
import { instant } from "../shared/primitives";
import { FactId, QuestionId, CycleId } from "../shared/ids";
import {
  type Fact,
  append,
  editFact,
  effectiveRevision,
  history,
} from "./facts";

const at = (h: number) => unwrap(instant(`2026-06-06T0${h}:00:00Z`));

const seed = (): Fact =>
  unwrap(
    append({
      id: FactId("f1"),
      questionId: QuestionId("q1"),
      cycleId: CycleId("c1"),
      by: "human",
      verdict: "answer",
      statement: "use bun test",
      at: at(1),
    }),
  );

describe("append (initial revision)", () => {
  test("creates version 1 with source = answering author", () => {
    const f = seed();
    expect(f.currentVersion).toBe(1);
    expect(f.source).toBe("human");
    expect(effectiveRevision(f)).toMatchObject({
      version: 1,
      verdict: "answer",
      statement: "use bun test",
      editedBy: "human",
    });
  });

  test("reject without reason is EmptyReasonOnReject (INV-4)", () => {
    expect(
      append({
        id: FactId("f"),
        questionId: QuestionId("q"),
        cycleId: CycleId("c"),
        by: "human",
        verdict: "reject",
        statement: "back to S5",
        at: at(1),
      }),
    ).toEqual({ ok: false, error: "EmptyReasonOnReject" });
  });

  test("ai may append a fact (append is not mutation)", () => {
    const f = unwrap(
      append({
        id: FactId("f"),
        questionId: QuestionId("q"),
        cycleId: CycleId("c"),
        by: "ai",
        verdict: "approve",
        statement: "auto-confirmed",
        at: at(1),
      }),
    );
    expect(f.source).toBe("ai");
  });
});

describe("editFact (human-only, append-only versioning INV-1/INV-2)", () => {
  test("human edit stacks version 2 and keeps version 1 intact", () => {
    const f1 = seed();
    const f2 = unwrap(
      editFact(f1, { editor: "human", statement: "use bun test (revised)", at: at(2) }),
    );
    expect(f2.currentVersion).toBe(2);
    expect(effectiveRevision(f2).statement).toBe("use bun test (revised)");
    // history preserved
    expect(history(f2)).toHaveLength(2);
    expect(history(f2)[0]).toMatchObject({ version: 1, statement: "use bun test" });
    // original object not mutated
    expect(f1.currentVersion).toBe(1);
    expect(history(f1)).toHaveLength(1);
  });

  test("ai cannot edit a fact (NotHumanEditor)", () => {
    expect(editFact(seed(), { editor: "ai", statement: "x", at: at(2) })).toEqual({
      ok: false,
      error: "NotHumanEditor",
    });
  });

  test("unspecified fields are inherited from the effective revision", () => {
    const f2 = unwrap(editFact(seed(), { editor: "human", reason: "n/a", at: at(2) }));
    expect(effectiveRevision(f2)).toMatchObject({
      verdict: "answer",
      statement: "use bun test",
      reason: "n/a",
    });
  });

  test("editing into a reject verdict without reason is rejected", () => {
    expect(
      editFact(seed(), { editor: "human", verdict: "reject", at: at(2) }),
    ).toEqual({ ok: false, error: "EmptyReasonOnReject" });
  });
});

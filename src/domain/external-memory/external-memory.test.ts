import { test, expect, describe } from "bun:test";
import { unwrap, isOk } from "../shared/result";
import { instant } from "../shared/primitives";
import { LedgerEntryId, CycleId } from "../shared/ids";
import {
  docPath,
  regenerateWikiBody,
  extractHumanBlocks,
  makeLedgerEntry,
  reconcileEntry,
  unreconciledCount,
  canStartNextCycleS1,
  type LedgerEntry,
} from "./external-memory";

describe("docPath (INV-2: path-traversal safety)", () => {
  test("accepts a path inside aidlc-docs and normalizes it", () => {
    expect(unwrap(docPath("aidlc-docs/s5/index.md")) as string).toBe("aidlc-docs/s5/index.md");
    expect(unwrap(docPath("a/./b/c.md")) as string).toBe("a/b/c.md");
    expect(unwrap(docPath("a/b/../c.md")) as string).toBe("a/c.md");
  });

  test("rejects absolute paths, NUL, and root escapes", () => {
    expect(docPath("/etc/passwd")).toEqual({ ok: false, error: "PathOutsideDocs" });
    expect(docPath("../secret")).toEqual({ ok: false, error: "PathOutsideDocs" });
    expect(docPath("a/../../escape")).toEqual({ ok: false, error: "PathOutsideDocs" });
    expect(docPath("a/\0/b")).toEqual({ ok: false, error: "PathOutsideDocs" });
    expect(docPath("")).toEqual({ ok: false, error: "PathOutsideDocs" });
  });
});

describe("regenerateWikiBody (INV-5: human edits preserved)", () => {
  test("keeps human-marked blocks across AI regeneration", () => {
    const oldBody = "AI text v1\n<!-- human -->keep this<!-- /human -->";
    const merged = regenerateWikiBody(oldBody, "AI text v2");
    expect(merged).toContain("AI text v2");
    expect(merged).toContain("<!-- human -->keep this<!-- /human -->");
    expect(extractHumanBlocks(merged)).toHaveLength(1);
  });

  test("does not duplicate a human block already present in the new body", () => {
    const block = "<!-- human -->note<!-- /human -->";
    const merged = regenerateWikiBody(`old ${block}`, `new ${block}`);
    expect(extractHumanBlocks(merged)).toHaveLength(1);
  });
});

describe("LedgerEntry (INV-3 completeness)", () => {
  const carriedWithInto = makeLedgerEntry({
    id: LedgerEntryId("l1"),
    kind: "D",
    label: "D-01 something",
    state: "carried",
    into: "next/S1",
    cycleFrom: CycleId("c1"),
  });
  const carriedNoInto = makeLedgerEntry({
    id: LedgerEntryId("l1"),
    kind: "D",
    label: "D-01 something",
    state: "carried",
    cycleFrom: CycleId("c1"),
  });

  test("carried requires into; dropped requires reason", () => {
    expect(isOk(carriedWithInto)).toBe(true);
    expect(carriedNoInto).toEqual({ ok: false, error: "MissingInto" });
    expect(
      makeLedgerEntry({
        id: LedgerEntryId("l2"),
        kind: "確定項目",
        label: "x",
        state: "dropped",
        cycleFrom: CycleId("c1"),
      }),
    ).toEqual({ ok: false, error: "MissingReason" });
  });
});

describe("reconcile gate (INV-4: next S1 blocked until unreconciled = 0)", () => {
  test("carried entries count as unreconciled and block S1; resolving unblocks", () => {
    const carried: LedgerEntry = unwrap(
      makeLedgerEntry({
        id: LedgerEntryId("l1"),
        kind: "D",
        label: "carry me",
        state: "carried",
        into: "next/S3",
        cycleFrom: CycleId("c1"),
      }),
    );
    expect(unreconciledCount([carried])).toBe(1);
    expect(canStartNextCycleS1([carried])).toBe(false);

    const resolved = unwrap(reconcileEntry(carried, { to: "done" }));
    expect(unreconciledCount([resolved])).toBe(0);
    expect(canStartNextCycleS1([resolved])).toBe(true);
  });

  test("reconcile to dropped requires a reason; non-carried cannot be reconciled", () => {
    const carried: LedgerEntry = unwrap(
      makeLedgerEntry({
        id: LedgerEntryId("l1"),
        kind: "D",
        label: "x",
        state: "carried",
        into: "next/S2",
        cycleFrom: CycleId("c1"),
      }),
    );
    expect(reconcileEntry(carried, { to: "dropped" })).toEqual({
      ok: false,
      error: "MissingReason",
    });
    const done = unwrap(reconcileEntry(carried, { to: "done" }));
    expect(reconcileEntry(done, { to: "done" })).toEqual({ ok: false, error: "NotCarried" });
  });
});

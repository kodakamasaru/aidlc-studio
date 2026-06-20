// US-02 / Unit-02 — root ledger parser + cross-cycle §6 injection + migration.
// The parser is dependency-free, so it is validated against BOTH synthetic inputs
// (folded scalars, comments, snake_case closed_in) AND the REAL on-disk ledgers
// (v0.0.4 / v0.0.5) so a schema drift in the actual files is caught here.
import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import { join } from "node:path";
import { FakeFs } from "../../src/infra/sys/fakes";
import {
  parseLedgerEntries,
  loadRootLedger,
  resolveSection6,
  migrateToRootLedger,
  renderLedgerYaml,
  rootLedgerPath,
  versionLedgerPath,
  extractMentionedIds,
  reconcileCycle,
} from "../../src/app/services/root-ledger";
import type { LedgerEntry } from "../../src/domain/ledger/ledger-entry";

const REPO_ROOT = join(import.meta.dir, "..", "..");

describe("parseLedgerEntries (synthetic)", () => {
  test("parses scalar fields + maps closed_in → closedIn, strips inline comment", () => {
    const raw = [
      "- id: D-12",
      "  origin: v0.0.1/s5/index.md  # a trailing comment",
      "  decision: short decision",
      "  state: done",
      "  closed_in: v0.0.1/s5.md",
    ].join("\n");
    const [e] = parseLedgerEntries(raw);
    expect(e).toEqual({
      id: "D-12",
      origin: "v0.0.1/s5/index.md",
      decision: "short decision",
      state: "done",
      closedIn: "v0.0.1/s5.md",
    });
  });

  test("folded `>` decision body is collected and never mistaken for keys", () => {
    const raw = [
      "- id: AUTO-1",
      "  origin: v0.0.4/ledger.yml",
      "  decision: >",
      "    multi line body that mentions state: carried inside prose",
      "    and into: v9 should not be parsed as keys.",
      "  state: carried",
      "  into: v0.0.6",
      "  reason: >",
      "    a folded reason.",
    ].join("\n");
    const [e] = parseLedgerEntries(raw);
    expect(e!.id).toBe("AUTO-1");
    expect(e!.state).toBe("carried");
    expect(e!.into).toBe("v0.0.6");
    expect(e!.decision).toContain("multi line body");
    expect(e!.decision).toContain("should not be parsed as keys");
    expect(e!.reason).toBe("a folded reason.");
  });

  test("skips top-level comment lines and blank lines between entries", () => {
    const raw = [
      "# header comment",
      "",
      "- id: A",
      "  state: carried",
      "  into: v2",
      "",
      "# mid comment",
      "- id: B",
      "  state: done",
      "  closed_in: x.md",
    ].join("\n");
    const ids = parseLedgerEntries(raw).map((e) => e.id);
    expect(ids).toEqual(["A", "B"]);
  });

  test("entry missing id or with invalid state is dropped", () => {
    const raw = ["- origin: x", "  state: carried", "- id: C", "  state: bogus"].join(
      "\n",
    );
    expect(parseLedgerEntries(raw)).toEqual([]);
  });
});

describe("loadRootLedger + validateLedgerEntry", () => {
  test("flags schema violations (carried without into)", () => {
    const raw = ["- id: X", "  state: carried"].join("\n");
    const loaded = loadRootLedger(new FakeFs(undefined, { [rootLedgerPath("/r")]: raw }), "/r");
    expect(loaded.entries.length).toBe(1);
    expect(loaded.violations).toContain("X: carried requires into");
  });

  test("missing root ledger → empty, no violations", () => {
    const loaded = loadRootLedger(new FakeFs(undefined, {}), "/r");
    expect(loaded.entries).toEqual([]);
    expect(loaded.violations).toEqual([]);
  });
});

describe("resolveSection6 (cross-cycle injection)", () => {
  test("merges root + current, root labeled as cross-cycle", () => {
    const ffs = new FakeFs(undefined, {
      [rootLedgerPath("/r")]: "- id: ROOT-1\n  state: carried\n  into: v0.0.6\n",
      [versionLedgerPath("/r", "v0.0.5")]: "- id: CUR-1\n  state: done\n  closed_in: x\n",
    });
    const text = resolveSection6(ffs, "/r", "v0.0.5")!;
    expect(text).toContain("ルート台帳");
    expect(text).toContain("ROOT-1");
    expect(text).toContain("現サイクル");
    expect(text).toContain("CUR-1");
    // root appears before current
    expect(text.indexOf("ROOT-1")).toBeLessThan(text.indexOf("CUR-1"));
  });

  test("current-only when root ledger absent (pre-migration fallback)", () => {
    const ffs = new FakeFs(undefined, {
      [versionLedgerPath("/r", "v0.0.5")]: "- id: CUR-1\n  state: carried\n  into: v0.0.6\n",
    });
    const text = resolveSection6(ffs, "/r", "v0.0.5")!;
    expect(text).toContain("CUR-1");
    expect(text).not.toContain("ルート台帳");
  });

  test("undefined when neither source exists", () => {
    expect(resolveSection6(new FakeFs(undefined, {}), "/r", "v0.0.5")).toBeUndefined();
  });
});

describe("migrateToRootLedger (idempotent aggregation)", () => {
  test("keeps only carried; later source overrides earlier (latest state wins)", () => {
    const v4 = "- id: A\n  state: carried\n  into: v0.0.5\n- id: B\n  state: carried\n  into: v0.0.5\n";
    const v5 = "- id: A\n  state: done\n  closed_in: v0.0.5/x.md\n"; // A resolved
    const out = migrateToRootLedger([v4, v5]);
    const ids = parseLedgerEntries(out).map((e) => e.id);
    expect(ids).toContain("B");
    expect(ids).not.toContain("A"); // resolved → drops out of unresolved view
  });

  test("idempotent: re-running over its own output is stable", () => {
    const v4 = "- id: A\n  state: carried\n  into: v0.0.5\n";
    const once = migrateToRootLedger([v4]);
    const twice = migrateToRootLedger([once]);
    expect(parseLedgerEntries(twice).map((e) => e.id)).toEqual(
      parseLedgerEntries(once).map((e) => e.id),
    );
  });

  test("rendered output round-trips through the parser", () => {
    const entries = parseLedgerEntries(
      "- id: A\n  origin: o\n  decision: d\n  state: carried\n  into: v2\n",
    );
    const round = parseLedgerEntries(renderLedgerYaml(entries));
    expect(round).toEqual(entries);
  });
});

describe("extractMentionedIds (token boundary)", () => {
  test("matches an exact id but NOT a longer id it is a prefix of", () => {
    const text = "addressed by US-01: S11-IMP1-live-evidence-hard-gate";
    // "S11-IMP1" is a prefix of the longer id present → must NOT match (D-1/D-10 hazard).
    expect(extractMentionedIds(["S11-IMP1"], text)).toEqual([]);
    expect(extractMentionedIds(["S11-IMP1-live-evidence-hard-gate"], text)).toEqual([
      "S11-IMP1-live-evidence-hard-gate",
    ]);
  });

  test("matches ids surrounded by punctuation/whitespace", () => {
    expect(extractMentionedIds(["F12-thread"], "(由来: F12-thread)")).toEqual(["F12-thread"]);
  });
});

describe("reconcileCycle (S1 完了ゲート)", () => {
  const carried = (id: string, into: string): LedgerEntry => ({
    id,
    origin: "o",
    decision: "d",
    state: "carried",
    into,
  });

  test("carried-into-target addressed → ok", () => {
    const all = [carried("A", "v0.0.6")];
    expect(reconcileCycle(all, "v0.0.6", ["A"]).ok).toBe(true);
  });

  test("carried-into-target NOT addressed → unreconciled, not ok", () => {
    const all = [carried("A", "v0.0.6")];
    const r = reconcileCycle(all, "v0.0.6", []);
    expect(r.ok).toBe(false);
    expect(r.unreconciled.map((e) => e.id)).toEqual(["A"]);
  });

  test("carried into a DIFFERENT version is ignored for this target", () => {
    const all = [carried("A", "v0.0.7")];
    expect(reconcileCycle(all, "v0.0.6", []).ok).toBe(true);
  });

  test("2× carried (escalation) unaddressed → flagged", () => {
    const all = [carried("B", "v0.0.5"), carried("B", "v0.0.6")]; // carried twice
    const r = reconcileCycle(all, "v0.0.6", []);
    expect(r.ok).toBe(false);
    // B is both carried-into-v0.0.6 (unreconciled) AND a 2× escalation.
    expect(r.escalationUnaddressed.map((e) => e.id)).toContain("B");
  });

  test("2× carried but addressed this cycle → ok", () => {
    const all = [carried("B", "v0.0.5"), carried("B", "v0.0.6")];
    expect(reconcileCycle(all, "v0.0.6", ["B"]).ok).toBe(true);
  });

  test("an id resolved (done) in a later cycle is not an escalation", () => {
    const all: LedgerEntry[] = [
      carried("C", "v0.0.5"),
      carried("C", "v0.0.6"),
      { id: "C", origin: "o", decision: "d", state: "done", closedIn: "x" },
    ];
    // C is resolved → detectEscalation excludes it; nothing to address.
    expect(reconcileCycle(all, "v0.0.7", []).ok).toBe(true);
  });
});

describe("real on-disk ledgers parse cleanly", () => {
  const readReal = (rel: string): string | undefined => {
    const p = join(REPO_ROOT, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : undefined;
  };

  test("v0.0.4 ledger: every entry has id+state, carried entries have into", () => {
    const raw = readReal("aidlc-docs/v0.0.4/ledger.yml");
    expect(raw).toBeDefined();
    const entries = parseLedgerEntries(raw!);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.id.length).toBeGreaterThan(0);
      if (e.state === "carried") expect(e.into).toBeDefined();
      if (e.state === "done") expect(e.closedIn).toBeDefined();
    }
  });

  test("v0.0.5 ledger: parses, and the SPLIT decision is captured as done", () => {
    const raw = readReal("aidlc-docs/v0.0.5/ledger.yml");
    expect(raw).toBeDefined();
    const entries = parseLedgerEntries(raw!);
    const split = entries.find((e) => e.id === "SPLIT-v005-scope");
    expect(split).toBeDefined();
    expect(split!.state).toBe("done");
    // the four carry-forward entries must all carry an `into:`
    const carried = entries.filter((e) => e.state === "carried");
    expect(carried.length).toBeGreaterThanOrEqual(4);
    for (const e of carried) expect(e.into).toBeDefined();
  });

  test("v0.0.5 reconcile gate PASSES against the real ledgers (S11-P04 closed)", () => {
    const versions = ["v0.0.1", "v0.0.2", "v0.0.3", "v0.0.4", "v0.0.5"];
    const all: LedgerEntry[] = [];
    for (const v of versions) {
      const raw = readReal(`aidlc-docs/${v}/ledger.yml`);
      if (raw) all.push(...parseLedgerEntries(raw));
    }
    const ledgerText = readReal("aidlc-docs/v0.0.5/ledger.yml") ?? "";
    const s1Dir = join(REPO_ROOT, "aidlc-docs/v0.0.5/s1");
    const docs = fs.existsSync(s1Dir)
      ? fs
          .readdirSync(s1Dir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => fs.readFileSync(join(s1Dir, f), "utf8"))
          .join("\n")
      : "";
    const candidateIds = [...new Set(all.map((e) => e.id))];
    const addressedIds = extractMentionedIds(candidateIds, `${docs}\n${ledgerText}`);
    const report = reconcileCycle(all, "v0.0.5", addressedIds);
    expect(report.unreconciled).toEqual([]);
    expect(report.escalationUnaddressed).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

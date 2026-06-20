/**
 * テスト: LedgerEntry 集約(S7 / TDD-RED→GREEN)
 * - validateLedgerEntry: 不変条件(carried/done/dropped 必須フィールド)
 * - reconcileStatus: into が targetVersion を指す carried → US 群に反映済かを判定
 * - detectEscalation: 同一論点が 2 サイクル連続 carried なら escalation 対象
 */

import { test, expect, describe } from "bun:test";
import type { LedgerEntry } from "./ledger-entry";
import {
  validateLedgerEntry,
  reconcileStatus,
  detectEscalation,
} from "./ledger-entry";

// ── ヘルパー ──────────────────────────────────────────
const carried = (id: string, into: string): LedgerEntry => ({
  id,
  origin: "aidlc-docs/v0.0.4/s11/retrospective.md",
  decision: `${id} の決定内容`,
  state: "carried",
  into,
});

const done = (id: string, closedIn: string): LedgerEntry => ({
  id,
  origin: "aidlc-docs/v0.0.4/s11/retrospective.md",
  decision: `${id} の決定内容`,
  state: "done",
  closedIn,
});

const dropped = (id: string, reason: string): LedgerEntry => ({
  id,
  origin: "aidlc-docs/v0.0.4/s11/retrospective.md",
  decision: `${id} の決定内容`,
  state: "dropped",
  reason,
});

// ── validateLedgerEntry ───────────────────────────────
describe("validateLedgerEntry — 不変条件", () => {
  test("carried + into あり → 違反なし", () => {
    const violations = validateLedgerEntry(carried("D-01", "v0.0.5"));
    expect(violations).toHaveLength(0);
  });

  test("carried で into が無ければ違反", () => {
    const entry: LedgerEntry = {
      id: "D-02",
      origin: "s11.md",
      decision: "test",
      state: "carried",
      // into 欠落
    };
    const violations = validateLedgerEntry(entry);
    expect(violations).toContain("carried requires into");
  });

  test("done + closedIn あり → 違反なし", () => {
    const violations = validateLedgerEntry(done("D-03", "s12.md#commit-abc"));
    expect(violations).toHaveLength(0);
  });

  test("done で closedIn が無ければ違反", () => {
    const entry: LedgerEntry = {
      id: "D-04",
      origin: "s11.md",
      decision: "test",
      state: "done",
      // closedIn 欠落
    };
    const violations = validateLedgerEntry(entry);
    expect(violations).toContain("done requires closedIn");
  });

  test("dropped + reason あり → 違反なし", () => {
    const violations = validateLedgerEntry(dropped("D-05", "スコープ外のため"));
    expect(violations).toHaveLength(0);
  });

  test("dropped で reason が無ければ違反", () => {
    const entry: LedgerEntry = {
      id: "D-06",
      origin: "s11.md",
      decision: "test",
      state: "dropped",
      // reason 欠落
    };
    const violations = validateLedgerEntry(entry);
    expect(violations).toContain("dropped requires reason");
  });

  test("carried で into 欠落は違反 1 件以上", () => {
    const entry: LedgerEntry = {
      id: "D-07",
      origin: "s11.md",
      decision: "test",
      state: "carried",
    };
    const violations = validateLedgerEntry(entry);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations).toContain("carried requires into");
  });
});

// ── reconcileStatus ───────────────────────────────────
describe("reconcileStatus", () => {
  test("into が targetVersion を指す carried で addressedIds に厳密一致すれば reconciled", () => {
    const entry = carried("D-01", "v0.0.5");
    const status = reconcileStatus(entry, "v0.0.5", ["US-01", "US-02", "D-01"]);
    expect(status).toBe("reconciled");
  });

  test("into が targetVersion を指すが addressedIds に反映されていなければ unreconciled", () => {
    const entry = carried("D-01", "v0.0.5");
    const status = reconcileStatus(entry, "v0.0.5", ["US-01", "US-02"]);
    expect(status).toBe("unreconciled");
  });

  test("部分一致では reconciled にしない(D-1 は D-10 に誤マッチしない)", () => {
    const entry = carried("D-1", "v0.0.5");
    const status = reconcileStatus(entry, "v0.0.5", ["D-10", "D-11"]);
    expect(status).toBe("unreconciled");
  });

  test("into が targetVersion と異なるなら unreconciled(別バージョン向け)", () => {
    const entry = carried("D-01", "v0.0.6");
    const status = reconcileStatus(entry, "v0.0.5", ["D-01"]);
    expect(status).toBe("unreconciled");
  });

  test("done エントリは reconciled 対象外 → unreconciled を返す", () => {
    const entry = done("D-01", "s12.md");
    const status = reconcileStatus(entry, "v0.0.5", ["US-01"]);
    expect(status).toBe("unreconciled");
  });

  test("dropped エントリは reconciled 対象外 → unreconciled を返す", () => {
    const entry = dropped("D-01", "理由");
    const status = reconcileStatus(entry, "v0.0.5", ["US-01"]);
    expect(status).toBe("unreconciled");
  });

  test("addressedIds が空でも into が一致しなければ unreconciled", () => {
    const entry = carried("D-01", "v0.0.5");
    const status = reconcileStatus(entry, "v0.0.5", []);
    expect(status).toBe("unreconciled");
  });
});

// ── detectEscalation ─────────────────────────────────
describe("detectEscalation", () => {
  test("同一 id が 2 サイクル以上 carried なら escalation 対象として返す", () => {
    const entries: LedgerEntry[] = [
      carried("D-01", "v0.0.5"),
      carried("D-01", "v0.0.6"),
    ];
    const escalated = detectEscalation(entries);
    expect(escalated.map((e) => e.id)).toContain("D-01");
  });

  test("1 回だけ carried なら escalation 対象にならない", () => {
    const entries: LedgerEntry[] = [
      carried("D-02", "v0.0.5"),
    ];
    const escalated = detectEscalation(entries);
    expect(escalated.map((e) => e.id)).not.toContain("D-02");
  });

  test("carried → done になったものは escalation 対象にならない", () => {
    const entries: LedgerEntry[] = [
      carried("D-03", "v0.0.5"),
      done("D-03", "s12.md"),
    ];
    const escalated = detectEscalation(entries);
    expect(escalated.map((e) => e.id)).not.toContain("D-03");
  });

  test("carried → dropped は escalation 対象にならない", () => {
    const entries: LedgerEntry[] = [
      carried("D-04", "v0.0.5"),
      dropped("D-04", "スコープ外"),
    ];
    const escalated = detectEscalation(entries);
    expect(escalated.map((e) => e.id)).not.toContain("D-04");
  });

  test("3 サイクル連続 carried も escalation 対象(重複なしで 1 件)", () => {
    const entries: LedgerEntry[] = [
      carried("D-05", "v0.0.4"),
      carried("D-05", "v0.0.5"),
      carried("D-05", "v0.0.6"),
    ];
    const escalated = detectEscalation(entries);
    const ids = escalated.map((e) => e.id);
    expect(ids.filter((id) => id === "D-05")).toHaveLength(1);
  });

  test("複数の escalation 対象を同時に検出できる", () => {
    const entries: LedgerEntry[] = [
      carried("D-01", "v0.0.5"),
      carried("D-01", "v0.0.6"),
      carried("D-02", "v0.0.5"),
      carried("D-02", "v0.0.6"),
      carried("D-03", "v0.0.5"),
      done("D-03", "s12.md"),
    ];
    const escalated = detectEscalation(entries);
    const ids = escalated.map((e) => e.id);
    expect(ids).toContain("D-01");
    expect(ids).toContain("D-02");
    expect(ids).not.toContain("D-03");
  });

  test("空配列なら escalation なし", () => {
    const escalated = detectEscalation([]);
    expect(escalated).toHaveLength(0);
  });
});

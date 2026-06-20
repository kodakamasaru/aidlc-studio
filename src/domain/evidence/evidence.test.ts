/**
 * テスト: Evidence 集約(S7 / TDD-RED→GREEN)
 * - EvidenceManifest の forms 充足判定(stepDoneEligibility)
 * - capturedAt の有効性: runStartedAt 以降の証拠のみ有効
 * - 「screenshot 固定にしない」= video / test-report 単独でも eligible
 */

import { test, expect, describe } from "bun:test";
import { unwrap } from "../shared/result";
import { instant } from "../shared/primitives";
import type { EvidenceForm, EvidenceManifest } from "./evidence";
import { evaluateStepDoneEligibility } from "./evidence";

const RUN_START = unwrap(instant("2026-06-20T10:00:00Z"));
const AFTER_RUN = unwrap(instant("2026-06-20T10:05:00Z"));
const BEFORE_RUN = unwrap(instant("2026-06-20T09:59:59Z"));

// ── ヘルパー ──────────────────────────────────────────
const form = (kind: EvidenceForm["kind"], capturedAt = AFTER_RUN): EvidenceForm => ({
  kind,
  path: `_evidence/${kind}-001.png`,
  capturedAt,
});

const manifest = (forms: EvidenceForm[]): EvidenceManifest => ({
  step: "S8",
  forms,
});

// ── eligible ケース ───────────────────────────────────
describe("evaluateStepDoneEligibility — eligible", () => {
  test("log + screenshot で eligible", () => {
    const result = evaluateStepDoneEligibility(
      manifest([form("log"), form("screenshot")]),
      { runStartedAt: RUN_START },
    );
    expect(result.eligibility).toBe("eligible");
    expect(result.missing).toHaveLength(0);
  });

  test("log + video だけでも eligible(screenshot 固定でない)", () => {
    const result = evaluateStepDoneEligibility(
      manifest([form("log"), form("video")]),
      { runStartedAt: RUN_START },
    );
    expect(result.eligibility).toBe("eligible");
    expect(result.missing).toHaveLength(0);
  });

  test("log + test-report だけでも eligible(screenshot 固定でない)", () => {
    const result = evaluateStepDoneEligibility(
      manifest([form("log"), form("test-report")]),
      { runStartedAt: RUN_START },
    );
    expect(result.eligibility).toBe("eligible");
    expect(result.missing).toHaveLength(0);
  });

  test("log + 複数の視覚/動作証拠でも eligible", () => {
    const result = evaluateStepDoneEligibility(
      manifest([form("log"), form("screenshot"), form("video")]),
      { runStartedAt: RUN_START },
    );
    expect(result.eligibility).toBe("eligible");
    expect(result.missing).toHaveLength(0);
  });
});

// ── blocked ケース ────────────────────────────────────
describe("evaluateStepDoneEligibility — blocked", () => {
  test("forms が空なら blocked(log も視覚証拠も欠落)", () => {
    const result = evaluateStepDoneEligibility(
      manifest([]),
      { runStartedAt: RUN_START },
    );
    expect(result.eligibility).toBe("blocked");
    expect(result.missing).toContain("log");
    expect(result.missing).toContain("visual-or-operational");
  });

  test("log のみ(視覚/動作証拠なし)なら blocked", () => {
    const result = evaluateStepDoneEligibility(
      manifest([form("log")]),
      { runStartedAt: RUN_START },
    );
    expect(result.eligibility).toBe("blocked");
    expect(result.missing).toContain("visual-or-operational");
    expect(result.missing).not.toContain("log");
  });

  test("screenshot のみ(log なし)なら blocked", () => {
    const result = evaluateStepDoneEligibility(
      manifest([form("screenshot")]),
      { runStartedAt: RUN_START },
    );
    expect(result.eligibility).toBe("blocked");
    expect(result.missing).toContain("log");
    expect(result.missing).not.toContain("visual-or-operational");
  });
});

// ── capturedAt 有効性 ─────────────────────────────────
describe("evaluateStepDoneEligibility — capturedAt 有効性", () => {
  test("runStartedAt より前の証拠は無効(旧証拠の使い回し拒否)", () => {
    const result = evaluateStepDoneEligibility(
      manifest([form("log", AFTER_RUN), form("screenshot", BEFORE_RUN)]),
      { runStartedAt: RUN_START },
    );
    expect(result.eligibility).toBe("blocked");
    expect(result.missing).toContain("visual-or-operational");
  });

  test("runStartedAt より前の log は無効", () => {
    const result = evaluateStepDoneEligibility(
      manifest([form("log", BEFORE_RUN), form("screenshot", AFTER_RUN)]),
      { runStartedAt: RUN_START },
    );
    expect(result.eligibility).toBe("blocked");
    expect(result.missing).toContain("log");
  });

  test("runStartedAt と同時刻の証拠は有効(境界: >=)", () => {
    const result = evaluateStepDoneEligibility(
      manifest([form("log", RUN_START), form("screenshot", RUN_START)]),
      { runStartedAt: RUN_START },
    );
    expect(result.eligibility).toBe("eligible");
  });

  test("全証拠が古くて無効なら両方 missing に入る", () => {
    const result = evaluateStepDoneEligibility(
      manifest([form("log", BEFORE_RUN), form("screenshot", BEFORE_RUN)]),
      { runStartedAt: RUN_START },
    );
    expect(result.eligibility).toBe("blocked");
    expect(result.missing).toContain("log");
    expect(result.missing).toContain("visual-or-operational");
  });
});

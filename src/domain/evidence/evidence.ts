/**
 * 集約: Evidence(証拠)(S6 evidence.md / S7 実装)
 *
 * 純粋(D-03): フレームワーク・DB・HTTP・I/O を持たない。
 * 時刻は引数で受け取る(Date.now() を内部で呼ばない / S6 D-04)。
 */

import type { Instant } from "../shared/primitives";

// ── 値オブジェクト ────────────────────────────────────

/** 証拠の 1 形式(S6 evidence.md D-02)。閉じた列挙で done ゲートを機械検証可能にする。 */
export type EvidenceKind = "screenshot" | "video" | "test-report" | "log";

export type EvidenceForm = {
  readonly kind: EvidenceKind;
  /** 証拠ファイルの所在(後から人間が辿れる相対パス)。 */
  readonly path: string;
  /** 取得時刻(ISO-8601)。runStartedAt 以降でなければ無効。 */
  readonly capturedAt: Instant;
};

// ── 集約ルート ────────────────────────────────────────

export type EvidenceManifest = {
  /** どの step の証拠か(例: "S8")。 */
  readonly step: string;
  readonly forms: readonly EvidenceForm[];
};

// ── 派生 ─────────────────────────────────────────────

/** step を done にできるか(S6 evidence.md 不変条件)。 */
export type StepDoneEligibility = "eligible" | "blocked";

/**
 * 充足判定の詳細。
 * missing: 不足している必須要素のラベル一覧。eligible のとき空配列。
 * - "log"                   → 縦経路ログが 1 件も無い(または全て古い)
 * - "visual-or-operational" → screenshot / video / test-report がいずれも無い(または全て古い)
 */
export type EligibilityResult = {
  readonly eligibility: StepDoneEligibility;
  readonly missing: readonly string[];
};

/** evaluateStepDoneEligibility に渡す実行コンテキスト(I/O を引数で渡す)。 */
export type EligibilityOpts = {
  /** 当該 Run の開始時刻。capturedAt がこの時刻以降の証拠のみ有効。 */
  readonly runStartedAt: Instant;
};

/**
 * stepDoneEligibility を評価する純粋関数。
 *
 * eligible の条件(S6 evidence.md 不変条件):
 *   ① forms に kind="log" が 1 件以上(かつ runStartedAt 以降)
 *   ② forms に kind が "screenshot" | "video" | "test-report" のいずれかが 1 件以上
 *      (かつ runStartedAt 以降)
 *
 * どちらか欠ければ blocked。不足理由を missing 配列で返す。
 */
export const evaluateStepDoneEligibility = (
  manifest: EvidenceManifest,
  opts: EligibilityOpts,
): EligibilityResult => {
  const { runStartedAt } = opts;

  // runStartedAt 以降の証拠のみを有効とする(古い証拠の使い回しを許さない)。
  // 注(S8 配線時): capturedAt / runStartedAt は ISO-8601 の辞書順比較で前後判定する。
  // 同一時刻でも TZ オフセット表記(例 +09:00)が混在すると順序が逆転するため、
  // 証拠生成側(verify:shot 等)で UTC(`Z` suffix)に正規化して渡すこと。
  const validForms = manifest.forms.filter(
    (f) => f.capturedAt >= runStartedAt,
  );

  const hasLog = validForms.some((f) => f.kind === "log");
  const hasVisualOrOperational = validForms.some(
    (f) => f.kind === "screenshot" || f.kind === "video" || f.kind === "test-report",
  );

  const missing: string[] = [];
  if (!hasLog) missing.push("log");
  if (!hasVisualOrOperational) missing.push("visual-or-operational");

  const eligibility: StepDoneEligibility = missing.length === 0 ? "eligible" : "blocked";

  return { eligibility, missing };
};

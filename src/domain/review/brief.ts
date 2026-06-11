/**
 * Brief I/O と 完全性評価(S6 brief-completeness)。Review 域の純粋 VO + 純粋関数。
 *
 * BriefIn  = Run の型付き入力 { context, requirements }。
 * BriefOut = Run の型付き出力 { artifacts, decisions, handoff, completeness }(生成後不変のスナップショット)。
 * evaluateCompleteness = `gaps = requirements − addressed` を算出(判断はしない / 算出は決定的)。
 *
 * 純粋(S6 D-01 / Q-01): 同一性判定は安定 key、人間表示は別フィールドの平易文。gap 算出を文字列揺れに依存させない。
 * gap の「処理」(差し戻し/見送り/done 許可)は descope.ts。本モデルは gap の「算出」まで。
 */

import type { Text } from "../shared/primitives";

/** 満たすべき要件 1 件。`key` = Step 内で一意な安定識別子(照合用)、`text` = 人間表示の平易文。 */
export type Requirement = {
  readonly key: string;
  readonly text: Text;
};

/** Run の型付き入力。 */
export type BriefIn = {
  readonly context: Text;
  readonly requirements: readonly Requirement[];
};

/**
 * 完全性ブロック: 要件 ↔ 対応 の照合元(BriefOut 内)。
 * `addressed` = evaluator(AI)が「対応済み」と判断して書き込んだ requirement key の参照。
 */
export type CompletenessBlock = {
  readonly requirements: readonly Requirement[];
  readonly addressed: readonly string[]; // requirement.key の集合
};

/** Run の型付き出力(生成後不変のスナップショット)。 */
export type BriefOut = {
  readonly artifacts: readonly Text[]; // 成果物参照
  readonly decisions: readonly Text[]; // AI が独自に決めたこと
  readonly handoff: Text; // 次工程への申し送り
  readonly completeness: CompletenessBlock;
};

export type CompletenessReport = {
  readonly gaps: readonly Requirement[]; // 未対応の要件(平易文付き)
  readonly isComplete: boolean; // gaps が空
};

/**
 * evaluateCompleteness(S6): `gaps = requirements − addressed` を key 照合で算出(副作用なし・全域)。
 * 判断はしない(addressed への書き込みは AI が済ませている)。requirements が空なら gaps も空。
 */
export const evaluateCompleteness = (
  block: CompletenessBlock,
): CompletenessReport => {
  const addressed = new Set(block.addressed);
  const gaps = block.requirements.filter((r) => !addressed.has(r.key));
  return { gaps, isComplete: gaps.length === 0 };
};

// Step → 平易な日本語ステップ名(S3 視覚契約 scr-02 D-03: パイプラインは内部の
// 番号(S1/S2…)でなく「要件 / 画面 / モデル …」の平易名で表示する)。内部コード
// を画面に直接出さないため。
//
// ★ 正本は domain `shared/vocab.ts` の CANONICAL_STEPS.label(US-02 / 単一機械可読正本)。
//    web は別ビルドで domain を import できないため、この表は **その派生ミラー**。
//    独自に値を作らない: tests/integration/step-label-consistency.test.ts が
//    CANONICAL_STEPS と一致を強制(drift ゼロ)。v2 12 step・S2.5 退役・S3=UIデザイン統一。
//    未知の step はコード ID にフォールバック。
const STEP_LABEL: Readonly<Record<string, string>> = {
  S1: "要件",
  S2: "画面",
  S3: "UIデザイン",
  S4: "技術仕様",
  S5: "分割",
  S6: "モデル",
  S7: "実装",
  S8: "統合",
  S9: "検証",
  S10: "受け入れ",
  S11: "振り返り",
  S12: "改善",
};

/** 平易なステップ名を返す(未知 step はコード ID をそのまま返す)。 */
export function stepLabel(step: string): string {
  return STEP_LABEL[step] ?? step;
}

// 各ステップで何をするか(1 行・平易)。ステップ構成カードの説明に使う(S3 scr-01)。
const STEP_DESC: Readonly<Record<string, string>> = {
  S1: "何を作るかを言葉で整理する",
  S2: "画面の構成と見た目の方針を決める",
  S3: "見た目の詳細(色・配置)を固める",
  S4: "技術的な前提・制約を決める",
  S5: "作る順番と単位に分ける",
  S6: "扱うデータと業務ルールを整理する",
  S7: "実際に動くものを作る",
  S8: "実プロジェクトに統合する",
  S9: "シナリオで動作を確認する",
  S10: "人が最終確認する",
  S11: "サイクルを振り返る",
  S12: "進め方の改善を提案する",
};

/** ステップの 1 行説明(未知 step は空文字)。 */
export function stepDesc(step: string): string {
  return STEP_DESC[step] ?? "";
}

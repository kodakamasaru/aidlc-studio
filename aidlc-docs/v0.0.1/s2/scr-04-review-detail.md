# SCR-04: レビュー詳細(汎用)

## メタ
- 親: [s2/index.md](./index.md)
- 対応 US: US-13
- 版: v0.0.1
- ステータス: 確定

## 目的
ステップの最終出力を ReviewBlock[] で俯瞰し、承認 or 差し戻しを判断する製品の心臓。差し戻しは手戻り先ステップを選んで戻す。

## 主要 UI 要素
- block-stream 描画(ReviewBlock[] を上から: summary / ac-map / mermaid / screenshot / test-report / risk 等の汎用レンダラ)
- 承認ボタン
- 差し戻しボタン → 手戻り先ステップ選択 + 理由入力ダイアログ

## 状態 (data-state)
- default: blocks を上から描画。承認 / 差し戻しの 2 アクションが見える。
- 差し戻しダイアログ: 手戻り先ステップ(任意の過去ステップ)選択 + 理由入力を表示。

## 遷移
- IN: SCR-03(レビュー待ちカードを開く)
- OUT: 承認 → SCR-02(次 Phase へ進行)
- OUT: 差し戻し(手戻り先 + 理由確定)→ SCR-02(選んだステップから再開)

## 備考(挙動 / native / a11y)
- MVP は軽いブロックのみ描画(summary / ac-map / mermaid 等)。動画 dossier 等の重いブロックは v0.0.x。
- 差し戻し理由は Decision / ledger に残す(監査可能性)。
- 未知のブロック種別は壊さず安全にスキップ or プレースホルダ表示(汎用レンダラの堅牢性)。

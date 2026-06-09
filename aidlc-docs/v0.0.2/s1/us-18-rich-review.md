# US-18: コードを見ずにリッチレビューする (v0.0.2 昇格)

## メタ
- 親: [s1/index.md](./index.md)
- v0.0.1 成果物: [v0.0.1/s1/us-18](../../v0.0.1/s1/us-18-rich-review.md)
- ステータス: 確定

## 3 観点

### なぜするか (Why)
人間は原則コードを見ない。品質ハーネスの evaluator が検証した結果を、人間が一目で判断できる形で提示する必要がある。completeness(漏れ無し)/impact(影響範囲)/bugfix dossier(原因→再発防止)/descope card(スコープ変更)が、コードを見ずに承認/却下を決める根拠になる。

### UX へのインパクト
レビューパネルが「変更説明+screenshot」から「completeness table + impact table + bugfix dossier + descope card + video embed」に格上げされる。人間は構造化された品質レポートを見て、数クリックで approve/reject できる。

### 受け入れ条件 (AC)
- [v0.0.2] 実装ステップのレビューに、変更説明/AC 充足状況/screenshot/動作確認結果/テスト結果/カバレッジ/リスク分析/差分サマリが集約表示される
- 各 AC に対する充足/未充足が判別できる
- カバレッジ・テスト結果は数値とともに閾値割れが強調される
- リスク分析は影響範囲と懸念点を提示する
- これらを根拠に承認/差し戻し(US-13)へ繋げられる
- [v0.0.2] completeness table(requirements ↔ addressed 照合)が表示される
- [v0.0.2] impact table(影響あり/影響なし確認済/未確認)が表示される
- [v0.0.2] bugfix dossier(原因2層/修正/再発防止)が表示される
- [v0.0.2] descope card(理由/影響/代替案)が表示され approve/reject できる
- [v0.0.2] video embed(before/after)の描画枠が表示される

## 質疑応答ログ
（なし）

## AI が独自に決めたこと と 理由
（なし）

## 棄却した案
（なし）

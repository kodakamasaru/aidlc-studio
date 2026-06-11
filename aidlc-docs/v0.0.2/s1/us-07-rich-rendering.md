# US-07: Evaluator 成果物リッチ描画

## メタ
- 親: [s1/index.md](./index.md)
- 対応 scope: K
- 実装フェーズ: P6
- ステータス: 確定(S3 反映で更新 2026-06-11)

> **S3 からの反映(手戻り)**: ①原因・影響は **ソースコード/ファイル名でなく振る舞い(何が起きる/どの機能に効く)** で描画(想定ユーザーはこの PJ のソースを知らない)。重要度は 高/中/低。②**descope card は SCR-04 から外す**(見送りは AI の理由付き申請 → サイクル側で判断する別フローに一本化。US-03 参照)。③要件は内部コード(US-xx/AC-xx)でなく平易な一文で表示。詳細は [s3/scr-04](../s3/scr-04-review-detail.md)。

## 3 視点

### なぜするか (Why)
品質ハーネス原則#3「コード不要で承認できる成果物」の要。evaluator の出力をリッチに描画し、ユーザーがコードを見ずに **completeness table / impact table / bugfix dossier / descope card / video embed** を確認して approve/reject できるようにする。

### UX へのインパクト
ユーザー(開発者)は **コードレビューの代わりに視覚的なダッシュボード** で承認判断をする。completeness table で要件カバレッジ、impact table で影響範囲、descope card で削減提案、bugfix dossier で修正詳細を一覧表示。video があれば実際の操作を映像で確認(v0.0.3 で録画実体化)。

### 受け入れ条件 (AC)
- [ ] Review detail 画面(SCR-04)に review block 描画エリアが追加される
- [ ] completeness table: requirements ↔ addressed の照合結果をテーブル描画(gap は赤ハイライト)
- [ ] impact table: 変更影響範囲をテーブル描画(**振る舞い**=何が起きる/どの機能に効く + 重要度 高/中/低。ソース名/ファイル名は出さない ※S3 反映①)
- [ ] bugfix dossier: cause(2層)/impact/fix/prevention/video を構造化カード描画
- [ ] ~~descope card: 削減提案の内容と承認/却下ボタンをカード描画~~ → **SCR-04 から外す**(S3 反映②: 見送りは AI の理由付き申請 → サイクル側で判断する別フローに一本化。US-03 / S5 Unit-05 参照)
- [ ] video embed: video URL があれば埋め込みプレーヤーを表示(v0.0.2 は placeholder)
- [ ] screenshot 証拠: verify-ui で自動生成された screenshot を動作証拠として描画(ユーザー要望「確実に正しく実装されているという証拠」に対応)
- [ ] approve/reject ボタンが各 block に紐づいて機能する
- [ ] レスポンシブ対応(320/768/1024/1440)
- [ ] E2E テストでリッチ描画→承認フローが pass する

## この US 固有の 質疑応答ログ

### Q-01 — レビュー画面で見たい情報の優先順位は？
- **回答**(ユーザー記入):
  > 要件カバレッジ / バグ修正の理由 / 確実に正しく実装されているという証拠（動画等）
- **確定**(AI 記入):
  > 描画優先度: ①completeness table ②bugfix dossier ③動作証拠。video は v0.0.3 で録画実体化だが、v0.0.2 では verify-ui screenshot を動作証拠として強化表示する。AC に screenshot 証拠描画を追加。

---

## この US 固有の AI が独自に決めたこと と 理由

### D-01 — リッチ描画を SCR-04(Review detail)に配置する
- **理由**: 承認/差し戻しは Review detail 画面で行うのが v0.0.1 の設計。そこに review block を追加する方が自然。v0.0.1 の SCR-04 を拡張。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-02 — video embed は placeholder とする(v0.0.2)
- **理由**: 録画実体は v0.0.3 で実装。URL なしの場合は「録画なし」placeholder を表示。型と描画枠だけ作る。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

---

## この US 固有の 棄却した案

### R-01 — 独立した Review ダッシュボード画面を作る
- **棄却理由**: SCR-04 の拡張で十分。新規画面は画面遷移を増やすだけ。v0.0.x で検討。

# S3 — UI 設計確定(視覚意図のイメージ作り / 全体)

## メタ
- 工程: S3 (UI Design / Image)
- PhaseGroup: Design
- 役割: プロダクトデザイナー(視覚意図担当)
- バージョン: v0.0.5
- ステータス: 確定
- 入力参照: `aidlc-docs/v0.0.5/s2/`(SCR-01・SCR-02 確定)
- 作成日: 2026-06-20
- 更新日: 2026-06-20

## 全体方針

**v0.0.4 デザインシステムを全面踏襲する。新規視覚方向・新規トークンは作らない。** 本サイクルは検証/台帳の土台で、UI 変更は既存画面の微修正(US-08 バッジ / US-06 文言)と削除(US-09)のみ。`s3-base.css`(v0.0.4 から踏襲コピー)をそのまま視覚契約に使い、差分だけを定義する。

### スタイル方向 / カラー / タイポ / 余白 / Radius / Shadow / Motion
- すべて **v0.0.4 S3 を継承**(`aidlc-docs/v0.0.4/s3/tokens.html` / `s3-base.css`)。本サイクルでの変更なし。
- 状態色(参照): running #2dd4bf / stalled #f59e0b / done #22c55e / failed #ef4444 / q #818cf8 / **review #c084fc**。

### 本サイクルの差分(これだけ)
- **US-08**: 会話スレッドのバッジが、レビュー emit 後も `running`(実行中)で固着 → 既存 `review`(できあがりの確認)トークンへ切替。新規色なし。

## 画面一覧 (S2 の SCR と 1:1 対応)
- [SCR-02 会話スレッド 状態バッジ](./scr-02-conversation-thread.html) | [仕様](./scr-02-conversation-thread.md) | [default(整合状態)](./screenshots/scr-02-conversation-thread.default.png)
- [SCR-01 レビュー summary(視覚差分なし / v0.0.4 踏襲)](./scr-01-review-summary.md) — html/screenshot は新規作成せず v0.0.4 review-detail を視覚契約に(D-02)

## 視覚カタログ
- [デザイントークン(差分のみ / バッジ)](./tokens.html)
- [トークン見本(スクショ)](./screenshots/tokens.png)

## 全体 質疑応答ログ

### Q-01 — レビュー準備完了バッジの視覚扱い
- **回答**(人間の回答を AI が記入):
  > 既存 review トークン再利用(推奨)。
- **確定**(AI 記入):
  > バッジは run→review で既存 `review` トークン(#c084fc /「◎ できあがりの確認」)を出す。新規トークン・新規視覚方向は作らない。S3 は軽量(SCR-02 の html/screenshot + tokens 差分のみ)。

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — v0.0.4 デザインシステムを全面踏襲(新規視覚方向を作らない)
- **理由**: 本サイクルは UI 変更が微小(既存画面の状態マッピング修正 + 文言 + 削除)。新規トークン/方向を作る必然がなく、二重管理を避ける。`s3-base.css` を踏襲コピーして視覚契約に使う。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — SCR-01 は新規 html/screenshot を作らず v0.0.4 review-detail を参照
- **理由**: US-06 は文言(コンテンツ)変更のみで視覚差分ゼロ。新規 html を起こすと v0.0.4 と同一の絵の二重管理になる。S3 完了条件「全 SCR に html」から理由付きで逸脱し、視覚契約は v0.0.4 S3 SCR-03 を継承(SCR-01 md に明記)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — `.pill.review` は既存 review 変数から組む(新規色を足さない)
- **理由**: v0.0.4 には `.badge.review` はあるが `.pill.review` は未定義。ヘッダのバッジは pill 形なので、既存 `--color-review*` 変数から `.pill.review` を html 内 style で組む(新しい色値は導入しない)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案

### R-01 — 本サイクル用に新しい視覚方向 / トークンを起こす
- **棄却理由**: D-01。UI 変更が微小で必然がない。v0.0.4 踏襲。

## binding 逆引きゲート(完了条件5)
- **US-08**(バッジ整合): AC「レビュー emit 後バッジがレビュー準備完了を反映 / 本文 CTA と整合」 ⇄ SCR-02 の run→review 切替で満たす。矛盾なし。
- **US-06**(scripted 日本語化): AC「scripted summary を日本語化 / live 不変」 ⇄ SCR-01 視覚差分なし・文言のみで満たす。矛盾なし。
- **US-09**(dead code 削除): UI surface 消滅で S3 の新規視覚対象外。矛盾なし。

## 次工程への引き継ぎ
- **S7/S8 が参照すべき screenshots と md の対応表**:
  - SCR-02 → `screenshots/scr-02-conversation-thread.default.png` + `scr-02-conversation-thread.md`(修正前の不具合は md に言葉で記録 / 画面化しない)
  - SCR-01 → 視覚契約は v0.0.4 `s3/scr-03-review-detail` の screenshots + 本 `scr-01-review-summary.md`(文言が日本語である点のみ追加)
  - tokens → `screenshots/tokens.png`
- **native 固有挙動でドメイン側に影響しそうな項目**: なし(web / 状態表示の修正のみ)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか: (手戻り時に追記)
- 暫定の解決方針:
- 棄却した案とその理由:

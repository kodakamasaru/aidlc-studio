# S3 — UI 設計確定(視覚意図 / 全体) — v0.0.3

## メタ
- 工程: S3 (UI Design / Image)
- PhaseGroup: Design
- 役割: プロダクトデザイナー(視覚意図担当)
- バージョン: v0.0.3
- ステータス: **確定**(実アプリ撮影の視覚契約を Biz レビュー済 2026-06-12)
- 入力参照: [s2/index.md](../s2/index.md) / [scope.md](../scope.md)
- 作成日: 2026-06-12
- 更新日: 2026-06-12

> **重要(契約)**: S7/S8 は `screenshots/*.png` と `scr-NN-*.md` だけを参照する。本サイクルは新規 `*.html` を作らない(下記 D-01)。
>
> **プロダクト前提**: web プロダクト(Vite + React)。

## 全体方針

**v0.0.2/s3 の視覚言語をそのまま継承(新規トークンゼロ)**。Dark / Linear・Vercel 風 minimal / indigo・violet / 4px base。
- 視覚カタログ正本: [v0.0.2/s3/tokens.html](../../v0.0.2/s3/tokens.html) / [tokens.png](../../v0.0.2/s3/screenshots/tokens.png)。**v0.0.3 で再定義しない**(本サイクルの 正本一元化 / DRY 方針と整合)。
- v0.0.3 は内部基盤サイクルで、視覚的な変化は既存実コンポーネントへの **2 差分**のみ:
  - レビュー詳細の「実際に動いた証拠」: placeholder → 実画像(+ 取得失敗状態)
  - ステップ設定 / サイクル構成ビュー: 作成時スナップショットの注記バナー

## 画面一覧 (S2 の SCR と 1:1 対応)

| SCR | 仕様 | スクショ(状態) |
|-----|------|----------------|
| レビュー詳細・実証拠 | [scr-01-review-evidence.md](./scr-01-review-evidence.md) | [default](./screenshots/scr-01-review-evidence.default.png) / [failed](./screenshots/scr-01-review-evidence.failed.png) |
| ステップ構成・注記バナー | [scr-02-step-config-snapshot.md](./scr-02-step-config-snapshot.md) | [default](./screenshots/scr-02-step-config-snapshot.default.png) |

## 視覚カタログ
- 継承: [v0.0.2/s3 tokens](../../v0.0.2/s3/screenshots/tokens.png)(v0.0.3 で変更なし)

## 全体 質疑応答ログ

### Q-01 — (なし。視覚言語は v0.0.2 継承で確定済、差分のみ確認)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > 

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — 視覚契約を「実アプリに v0.0.3 変更を当てて撮影」で作る(新規 HTML モックを手書きしない)
- **理由**: v0.0.3 の変化は新規画面でなく既存実コンポーネントへの 2 差分。HTML モックを手書きすると実コンポーネントから視覚ドリフトする(v0.0.2 S10 却下の教訓)。実 CSS をそのまま使う実アプリ撮影が最も忠実な契約になり、S7/S8 が参照する screenshots+md の purpose(Construction の UI 勝手削りを防ぐ)も満たす。撮影は再現可能(`scripts/s3-v003-capture.ts`)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — 視覚トークンは v0.0.2/s3 を継承し再定義しない
- **理由**: 新規トークンゼロ。複製すると本サイクルが正そうとしている「内容の二重持ち」を S3 自身が犯す。v0.0.2 tokens を正本として参照する。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## 棄却した案

### R-01 — v0.0.2 の tokens.html / styles.css を v0.0.3 にコピー
- **棄却理由**: 内容複製。変更がないのに二重持ちすると正本がブレる。参照で足りる。

## 次工程への引き継ぎ

S7/S8 が参照すべき screenshots と md の対応(**html は無い / 参照不要**):

| 実装対象 | 視覚契約(png) | 仕様(md) |
|---|---|---|
| レビュー証拠ブロック(実画像 + 失敗状態) | scr-01-review-evidence.{default,failed}.png | scr-01-review-evidence.md |
| ステップ設定 / 構成ビューの注記バナー | scr-02-step-config-snapshot.default.png | scr-02-step-config-snapshot.md |

- native 固有挙動でドメインに影響する項目: なし(web のみ / 表示層の差分)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (なし)

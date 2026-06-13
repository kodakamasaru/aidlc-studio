# Unit-05: 成果物 Markdown 描画

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-02](../s1/us-02-markdown-render.md)
- 由来: carried #2 / SCR-03(レビュー詳細)
- Phase: 1(leaf / 独立)
- ステータス: 確定(2026-06-13 / 評価 AI レビュー)

## 責務 (1〜2 行)
レビュー詳細(SCR-03)の summary block が、実 AI の Markdown 本文を見出し/箇条書き/コードとして描画する。現状プレーンテキスト表示を md レンダリングに置換する(US-02 carried #2)。

## 外部依存
- なし(leaf)。wire 契約にも会話スレッドにも依存しない独立 web 差分。
- 触る既存箇所: [ReviewBlocks.tsx](../../../web/src/features/review/ReviewBlocks.tsx) の `BlockBody`(summary 分岐)。`CompletenessTable` / `ScreenshotFigure` 等の他 block 描画は変えない。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| summary md 描画 | `ReviewBlock`(kind=summary)の md 本文 | 見出し/箇条書き/コードの HTML 描画(既存 `ScreenshotFigure` の安全 src 規制と同じ姿勢でサニタイズ) | 不正 md → 素のテキストにフォールバック(描画を黙って失わない) |

- セキュリティ: md→HTML は XSS 防止のためサニタイズ必須(`dangerouslySetInnerHTML` 直挿しは禁止 / web security ルール)。vetted な md レンダラ + サニタイザを使う(具体ライブラリは S7 で選定 / 既存依存を優先)。

## この Unit 固有の 質疑応答ログ

### Q-01 — (なし)
- carried #2 の要求は明確(md 描画)。新規 Biz 判断なし。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — md 描画は summary block に限定し、他 block 種別の描画は変えない
- **理由**: US-02 の要求は「実 AI の md 本文(= summary)が読める」。ac-map/mermaid/screenshot 等は既に専用描画があり、それらに md レンダラを被せると既存表示を壊す。最小差分で summary だけ md 化する。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計 / 2026-06-13 評価 AI レビュー)。ユーザー上書き希望時は随時反映。
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — md レンダリングを自前実装(正規表現で見出し/箇条書きを変換)
- **棄却理由**: XSS リスクと実装ドリフト。vetted な md レンダラ + サニタイザを使う(common: battle-tested ライブラリ優先 / 車輪の再発明禁止)。
</content>

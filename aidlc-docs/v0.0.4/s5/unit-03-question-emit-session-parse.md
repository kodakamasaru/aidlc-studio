# Unit-03: 質問 emit & session-id parse

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-03](../s1/us-03-output-question-routing.md)
- 由来: S4 C3(質問 emit)+ C1(session-id の parse 点固定)
- Phase: 2
- ステータス: 確定(2026-06-13 / 評価 AI レビュー)

## 責務 (1〜2 行)
live adapter の出力走査で、結果テキスト中の ` ```aidlc-question ` block を Unit-01 のスキーマで parse → **`QuestionRaised`(kind=`question`)を emit**。block 無しは従来どおり `ResultEmitted`→`visual_review`(誤分類しない)。同じ drain ループで stream-json の init 行から **session_id を取得**し emit に添える(`--resume` の前提を作る)。

## 外部依存
- [Unit-01](./unit-01-wire-contract.md) の `parseQuestionBlock` と wire 型(parse の契約)。
- 触る既存箇所: [live.ts](../../../src/infra/orchestrator/live.ts) の `awaitAndEmit`(stdout drain ループ)/ `extractResultText`(現状 `result`/`assistant` 行のみ参照し init 行を捨てている — S4 C1)。emit 先は既存 `DomainEventSink`。
- 既存ドメイン型 [`QuestionRaised`](../../../src/domain/events/events.ts) / [`QuestionOption`](../../../src/domain/question/question.ts) にマップ。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| 質問 emit | live 結果テキストに `aidlc-question` block | `QuestionRaised{ kind:"question", options }` を sink へ(1 run に複数 Q = 複数カード or 順次 / US-03 AC) | parse 失敗は可視化(原則④)。block 無し → 従来 `ResultEmitted`→`visual_review`(フォールバック=安全側) |
| `extractSessionId(stdout)` | stream-json JSONL | `session_id`(`{"type":"system","subtype":"init","session_id":...}` から) | init 行欠落 → session-id なしを可視化(resume 不可を黙らせない) |

- session_id を載せる先(新フィールド or 新イベント)の最終形は S6/S7(`ResultEmitted` 等への添付 / S4 C1)。本 Unit は「どこで読むか(parse 点)」を固定し取得値を app へ渡すところまで。

> **並行開発の衝突回避(評価 AI S-1)**: Unit-03 と Unit-04 はともに live の `awaitAndEmit`(同一関数本体)を触る(本 Unit=session-id 取得と質問 emit / Unit-04=`--resume` 再 spawn)。merge 衝突を避けるため、本 Unit は **`extractSessionId(stdout): string | null` を drain ループ本体から切り出した独立純関数**として先に置く。Unit-04 はそれを import するだけで drain ループ本体を編集しない。Phase 1→2 の着手境界でこの純関数を先出しすること。

## この Unit 固有の 質疑応答ログ

### Q-01 — (なし)
- 質問の検出方法は S1 Q-03(構造化 emit)/ S4 C3 で確定。自由文検出は棄却済。新規 Biz 判断なし。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — session-id 取得を Unit-04(resume)でなく本 Unit に同居させる
- **理由**: parse 点が `awaitAndEmit` の同一 drain ループ(質問 emit のための結果テキスト走査と同じ場所)。別 Unit にすると 2 Unit が同じ live 関数を奪い合い並行開発で衝突(index R-01)。出力走査を担う本 Unit に寄せ、Unit-04 は取得済 session-id を受け取る側に純化。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計 / 2026-06-13 評価 AI レビュー)。ユーザー上書き希望時は随時反映。
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — 自由文ヒューリスティック(「?」検出)で質問化
- **棄却理由**: 誤検出・取りこぼし。完成検査は仕様(構造化契約)起点(US-03 R-01 / S4 R-03 / completeness-checks-anchor-on-spec)。
</content>

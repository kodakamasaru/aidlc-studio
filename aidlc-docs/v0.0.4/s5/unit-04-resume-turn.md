# Unit-04: resume turn 継続

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-04](../s1/us-04-conversational-resume.md)
- 由来: S4 C1(session 永続)/ C2(二義分岐)/ C4(返信エンベロープ)/ C6(scripted パリティ)
- Phase: 3(クリティカルパス末端 / 主軸の心臓)
- ステータス: 確定(2026-06-13 / 評価 AI レビュー)

## 責務 (1〜2 行)
`question` 回答を受けたら `claude --resume <session-id> -p <aidlc-answers エンベロープ>` を再 spawn して次 turn を実行(新経路)。`visual_review` 承認は既存 finalize(`done` emit / 再 spawn なし)に分岐(二義を混線させない)。session-id を studio sqlite 別 store に Run と紐づけ永続し、scripted アダプタでも turn 継続を同型で再現する。

## 外部依存
- [Unit-01](./unit-01-wire-contract.md) の `serializeAnswers`(返信エンベロープ生成)。
- [Unit-03](./unit-03-question-emit-session-parse.md) が取得・受け渡す session-id(これが無いと `--resume` できない)。**Unit-03 が先出しする独立純関数 `extractSessionId` を import する**(`awaitAndEmit` 本体は編集しない / 並行衝突回避 / 評価 AI S-1)。
- 触る既存箇所:
  - [orchestrator.ts](../../../src/app/ports/orchestrator.ts) `ResumeRun`(現 `{runId, body?}`)に `sessionId?` を追加(port 拡張)。
  - [live.ts](../../../src/infra/orchestrator/live.ts) `resume()`(現状 `done` emit のみ・`--resume` 経路は未実装 252-284 → **新経路の追加**。実装デルタは小さくない / S4 C2)。
  - [scripted.ts](../../../src/infra/orchestrator/scripted.ts)(resume 回数 keyed の turn シーケンス追加 / C6)。
  - 永続: [cycle-repo.ts](../../../src/infra/db/cycle-repo.ts) / Run 構造(現 `{id,attempt,state,startedAt,endedAt?,failureReason?,role?}`)に session-id を持たせる(最終形 S6/S7)。
  - 分岐は既存 [`Unit02Command`](../../../src/domain/question/question.ts)(`question`→`resumeRun{runId,body?}`〔不変〕 / `visual_review`→`approveTaskReview`)を使う。session-id は port の `ResumeRun.sessionId?` で別途運ぶ(下表の注記参照)。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| resume(turn 継続) | **port** `ResumeRun{runId, sessionId?, body=aidlc-answers}` | `claude --resume` 再 spawn → 次 turn を `QuestionRaised` か `ResultEmitted`(visual_review)で emit | resume 失敗/session 失効/timeout → `stalled`(retriable / 黙って失わない / US-04 AC) |
| finalize(承認) | `approveTaskReview{runId, taskId?}` | `RunStateChanged done`(既存・再 spawn なし) | 既存踏襲 |
| turn 上限 | 1 ヒアリングの turn 数 | 暫定 **10 turn** 超過は `stalled` で人間に判断を返す(無限往復防止 / S4 非機能)。定数アンカ仮称 `MAX_HEARING_TURNS`(最終配置・値は S7) | 定数化・最終値は本 Unit で確定 |

> **port と domain command の区別(評価 AI B-1)**: `sessionId?` を足すのは **port の `ResumeRun`**([orchestrator.ts](../../../src/app/ports/orchestrator.ts) / 現 `{runId, body?}` → `{runId, sessionId?, body?}`)。**ドメインの [`Unit02Command.resumeRun`](../../../src/domain/question/question.ts) は `{type, runId, body?}` のまま不変**(回答モデル不変 / S4 C4)。session-id は実行基盤の状態でドメイン命令には載せない(S4 D-01)。読み手はドメイン命令でなく port を拡張すること。

## この Unit 固有の 質疑応答ログ

### Q-01 — (なし)
- turn ベース(S1 Q-02)/ session 永続境界(S4 D-01)/ 返信フォーマット(S4 C4)とも確定済。新規 Biz 判断なし。turn 上限 10 は暫定運用値(内部チューニング)で Biz ゲートではない。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — resume を「turn 継続」専用に純化し、承認 finalize を別経路にする(S4 D-02 の Unit 化)
- **理由**: 現 `resume()` の二義(承認 done / 将来の継続)は混線の温床。回答 kind で経路を分けると状態遷移が明確で誤遷移を防ぐ。本 Unit 内に 2 経路を閉じ、Unit-03(emit)とは別の検証単位に保つ(S1 D-03 の刻み)。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計 / 2026-06-13 評価 AI レビュー)。ユーザー上書き希望時は随時反映。
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — resume を使わず毎 turn 全文脈を prompt 再注入
- **棄却理由**: トークン肥大・文脈ドリフト。`--resume` で session 文脈を引き継ぐ方が正確で安価(S4 R-02 / US-04 R-01)。
</content>

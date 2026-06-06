# Unit-03: Human Inbox & Decision

## メタ
- 親: [s3/index.md](./index.md)
- 所属 US: [US-12](../s1/us-12-answer-question.md), [US-13](../s1/us-13-visual-review-step.md), [US-14](../s1/us-14-backtrack-ai-initiated.md), [US-15](../s1/us-15-backtrack-human-initiated.md), [US-16](../s1/us-16-device-check.md), [US-17](../s1/us-17-decision-history.md), [US-31](../s1/us-31-notification.md)
- ステータス: 確定
- MVP: ◎(US-12, US-13)

## 責務 (1〜2 行)
製品の魂。AI→人間の依頼(Q回答 / 視覚レビュー / 実機確認 / D承認 / 手戻り判断 / stall retry)を**全部 HumanTask カード化**し、人間の応答を受けて AI を再開させる。人間の判断は **Decision として履歴化**(US-17)、Human 待ち発生は通知(US-31)。

## 外部依存
- **Unit-02**(Orchestration): `HumanTaskEmitted` を購読してカード生成 / `resumeRun`・`retryLaunch`・`cancelRun` をトリガ(command/event 分離)。
- **Unit-01**(Cycle/Run core): カードに紐づく Phase/Run を参照 / 手戻り時に `backtrackTo` を呼ぶ。
- **Unit-04**(Review render): 視覚レビュー(US-13)で ReviewBlock[] を渡して描画させる。

## I/F 定義 (この Unit が公開する契約)

### state 型
```
HumanTask { id, runId, kind: question|visual_review|device_check|decision|backtrack|stall_retry,
            state: open|answered|dismissed, payload, createdAt }
HumanAnswer { taskId, verdict: approve|reject|answer|confirm, body?, backtrackTo?:step, reason? }
Decision  { id, taskId, cycleId, verdict, reason, decidedAt }  // 不変・追記のみ
```
> Decision は append-only(編集不可、履歴の真実)。日付は ISO-8601。

### 操作
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| listInbox | { filter?: kind\|state } | HumanTask[] | — |
| openTask | { taskId } | HumanTask + (視覚レビューなら ReviewBlock[]) | TaskNotFound |
| answerTask | { taskId, answer:HumanAnswer } | Decision(記録)+ Unit-02 へ resume/retry/cancel | TaskClosed / InvalidVerdict |
| requestBacktrack | { cycleId, toStep, reason } | Decision + Unit-01.backtrackTo | StepNotInPipeline |
| listDecisions | { cycleId } | Decision[](時系列) | — |

### 画面ルーティング(確定)
- `listInbox`(SCR-03 ハブ)→ `openTask`。**kind=question → SCR-05** / **kind=visual_review → SCR-04**(ReviewBlock[] 同梱)。SCR-03/04 は分離のまま(S2 確定)。

### 通知(US-31, 可変点)
- `HumanTaskEmitted` 受信時に通知を発火(手段は env: ローカル通知 / webhook 等)。MVP はポーリングでも可、I/F に通知ポート(NotifyPort)だけ用意。

## この Unit 固有の 質疑応答ログ

### Q-01 — SCR-03(Inbox)と SCR-04(レビュー詳細)の分離を I/F でどう表すか?
- S2 で「分離のまま」確定。`listInbox`(SCR-03)→ `openTask`(SCR-04 で ReviewBlock[] 同梱)という遷移で表現。kind=question は SCR-05 へ、visual_review は SCR-04 へルーティング。この対応でよいか。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > `listInbox`→`openTask` 遷移 + kind による SCR-05/SCR-04 ルーティングで確定。SCR-03/04 分離は S2 確定を踏襲。

### Q-02 — 手戻り(US-14 AI起点 / US-15 人間起点)の I/F 統一
- AI 起点(backtrack kind の HumanTask を承認)も人間起点(`requestBacktrack`)も、最終的に `Unit-01.backtrackTo` + Decision 記録に集約する案。2 経路を 1 つの backtrack 処理にまとめてよいか。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > AI 起点・人間起点とも **1 つの backtrack 処理(`Unit-01.backtrackTo` + Decision 追記)に集約**で確定。入口(emit された backtrack カード承認 / `requestBacktrack`)が違うだけで処理は同一。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — 全 AI→人間依頼を単一の HumanTask 型(kind 違い)で表現
- **理由**: brief の「製品の魂 = Human Inbox」。Q/レビュー/実機/承認/手戻り/retry を別 entity にすると Inbox が分裂する。kind フィールドで吸収し、1 つの待ち行列・1 つの応答 I/F に統一。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-02 — Decision を append-only の履歴に
- **理由**: US-17「なぜそう決めたかを辿る」。判断を上書き可能にすると履歴が壊れる。追記のみとし、手戻りも新 Decision として積む(ledger/Wiki=Unit-05 へ連携)。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — kind ごとに別 Inbox(Q箱 / レビュー箱)に分ける
- **棄却理由**: 人間は「次に何を捌くか」を 1 か所で見たい。kind は表示フィルタで足り、箱の分割は UX を悪化させる。

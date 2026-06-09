# Unit-06: Backlog & Task

## メタ
- 親: [s3/index.md](./index.md)
- 所属 US: [US-01](../s1/us-01-backlog-add-task.md), [US-02](../s1/us-02-task-reorder.md), [US-03](../s1/us-03-task-assign-cycle.md), [US-04](../s1/us-04-ai-suggest-assignment.md), [US-23](../s1/us-23-ai-propose-task.md), [US-24](../s1/us-24-ai-validate-task.md)
- ステータス: 確定
- MVP: —(v0.0.x)

## 責務 (1〜2 行)
開発要求(Task)を積み・並べ替え・Cycle に割り当てる Backlog ドメイン。AI による Task 起案(US-23)と妥当性確認(US-24: 重複検知 / 陳腐化検知)を含む。Cycle は Task を **ID 参照**で受け取る(Unit-01 へ片方向供給)。

## 外部依存
- **Unit-07**(Config): 対象リポ/ビジョン文脈を read(AI 提案の入力)。
- **Unit-02**(Orchestration): AI 提案(US-04/23/24)は Agent 起動で生成 → 提案を購読。
- Unit-01 へは「割り当て済み taskIds」を供給(呼ばれる側)。

## I/F 定義 (この Unit が公開する契約)

### state / 型
```
Task { id, title, body, priority(順序), state: backlog|assigned|done, kind, assignedCycleId?, createdAt }
TaskProposal { id, source: ai|human, title, body, rationale, state: pending|accepted|rejected }
ValidationFinding { taskId, kind: duplicate|stale, note, relatedTaskId? }
```
> Task は `kind` を持つ(S2 引き継ぎ)。priority は明示順序。日付 ISO-8601。

### 操作
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| addTask | { title, body, kind } | Task(backlog) | EmptyTitle |
| reorderTasks | { orderedIds[] } | Task[] | UnknownTaskId |
| assignToCycle | { taskIds[], cycleId } | Task[](assigned) | TaskAlreadyAssigned |
| suggestAssignment | { } | TaskProposal[](AI 束ね案) | — |
| proposeTask | { } | TaskProposal(AI 起案) | — |
| validateTasks | { } | ValidationFinding[](重複/陳腐化) | — |
| acceptProposal / rejectProposal | { proposalId } | Task or void | — |

### 妥当性確認の発火(確定)
- **重複検知 = 起票時**(`addTask` 直後)/ **陳腐化検知 = Cycle 作成時**(`createCycle` 前の候補確認)。いずれも人間が手動で `validateTasks` を回すことも可。

## この Unit 固有の 質疑応答ログ

### Q-01 — Task の最小単位は brief の「Cycle 必須」と整合するか?
- S1 R-01 で「Task 単体で開始しない / Cycle が実行単位」と確定。Task はあくまで Backlog の要求で、実行は必ず assignToCycle → Unit-01 経由。この境界でよいか。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > **Task は Backlog の要求どまり、実行は必ず `assignToCycle` → Unit-01 経由**で確定(S1 R-01「Cycle が実行単位」準拠)。

### Q-02 — AI 妥当性確認(US-24)の発火タイミング
- 重複検知 = 起票時 / 陳腐化検知 = 定期 or Cycle 作成時。どのトリガで `validateTasks` を回すか(自動 vs 人間操作)。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > **重複 = 起票時 / 陳腐化 = Cycle 作成時** を既定トリガに、加えて人間手動実行も可、で確定。発火頻度の調整は実装時 env で可変。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — AI 提案(起案/割り当て/妥当性)を TaskProposal/Finding として人間承認前提に
- **理由**: kit 基本姿勢「判断は人間、生成は AI」。AI 出力は直接 Task 化せず proposal/finding に留め、accept で初めて Task になる。粒度ゲーミング(#3)の予防にもなる。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — Task を Cycle に内包(Backlog を持たない)
- **棄却理由**: Backlog(溜める)と Cycle(実行で束ねる)は別ライフサイクル。US-01/02 が Backlog 操作を要求。分離する。

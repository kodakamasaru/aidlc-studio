# Unit-01: Cycle & Run ライフサイクル(ドメイン核)

## メタ
- 親: [s3/index.md](./index.md)
- 所属 US: [US-05](../s1/us-05-cycle-create.md), [US-06](../s1/us-06-cycle-start-phase.md), [US-09](../s1/us-09-parallel-cycles.md), [US-29](../s1/us-29-cycle-pause-watch.md), [US-30](../s1/us-30-cycle-complete.md)
- ステータス: 確定
- MVP: ◎(US-05, US-06)

## 責務 (1〜2 行)
Milestone(Cycle / vX.Y.Z)・Phase(S1〜S7)・Run(1 Agent 起動)の**状態機械**。create / start / pause / complete / 並行 と、Run state(running|stalled|done|failed)+ retry の状態遷移を**技術非依存のドメインロジック**として保持する。Agent をどう動かすかは持たない(= Unit-02)。

## 外部依存
- **Unit-06**(Backlog/Task): Cycle 作成時に割り当て済み Task を **ID 参照**で受ける(Task の中身は持たない)。
- **Unit-07**(Config): step 定義(S1〜S7 か custom パイプライン)を read。
- 内部 Unit を**呼び出さない**(核)。Unit-02 がこちらを読みに来る片方向。

## I/F 定義 (この Unit が公開する契約)

### ドメイン型(state shape)
```
Cycle   { id, version, title, taskIds[], phaseIds[], state: planned|active|paused|done, createdAt }
Phase   { id, cycleId, step: S1|S2|S2.5|S3|S4|S5|S6|S7, state: pending|running|review|done, order }
Run     { id, phaseId, attempt, state: running|stalled|done|failed, startedAt, endedAt? }
```
> 日付は ISO-8601 文字列(`2026-06-05T12:34:56Z`)。state は上記の列挙のみ。

### 操作
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| createCycle | { title, version, taskIds[] } | Cycle | EmptyTitle / DuplicateVersion |
| startPhase | { cycleId, step } | Phase(running)+ Run(running) | CyclePaused / PrevPhaseNotDone / PhaseAlreadyRunning |
| advanceRun | { runId, to: stalled\|done\|failed } | Run | IllegalTransition(例: done→running) |
| retryRun | { runId } | 新 Run(attempt+1, running) | RunNotFailedOrStalled |
| backtrackTo | { cycleId, step, reason } | Phase(選んだ step を running、後続 Phase を pending に戻す) | StepNotInPipeline |
| pauseCycle / resumeCycle | { cycleId } | Cycle | AlreadyInState |
| completeCycle | { cycleId } | Cycle(done) | PhasesNotAllDone |

### 不変条件
- 1 Cycle 内で running な Run は Phase 単位で同時 1(並行は **Cycle 間**=US-09、worktree 分離は Unit-02 が担保)。
- state 遷移は上表のみ許可(`advanceRun` の IllegalTransition で守る)。
- `backtrackTo` は戻り先 step の後続を pending に巻き戻すが、過去の Run/Decision 履歴は破棄しない(Unit-03/05 が保持)。

## この Unit 固有の 質疑応答ログ

### Q-01 — 並行(US-09)の単位は「Cycle 間のみ」でよいか?
- 1 Cycle 内は Phase 直列(S1→…→S7)、複数 Cycle が worktree 分離で同時進行、という前提。1 Cycle 内で複数 Phase を並列起動する要件は無い、で確定してよいか。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > 並行 = **Cycle 間のみ**で確定。1 Cycle 内は Phase 直列。MVP は並行不要(US-09 は v0.0.x、worktree 分離は Unit-02 が担保)。

### Q-02 — retry(US-08)の上限・自動/手動の線引きは?
- MVP は人間が SCR-02 から手動 retry。自動 retry(stall 検知 → 自動再起動)の有無・最大 attempt 数をドメインに持たせるか、orchestrator(Unit-02)の方針に委ねるか。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > MVP は **手動 retry のみ**(自動 retry なし)。最大 attempt 上限は env で可変(既定 3)とし、ドメインは attempt カウントのみ保持。自動 retry 判断は将来 Unit-02 のポリシーに委ねる(可変点として予約)。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — Cycle/Phase/Run を技術非依存の純粋状態機械として設計(Agent 実行を含めない)
- **理由**: S6(純粋ドメインコード)の主対象。Agent SDK / worktree / プロセス管理を混ぜると技術依存になり S6/S7 の工程分離が壊れる。「何であるか」だけをここに置く。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-02 — backtrack(手戻り)を Run の作り直しでなく Phase 巻き戻しでモデル化
- **理由**: S2 で「差し戻し = 戻り先ステップ選択 + 理由」と確定。戻り先 step を running に、後続 Phase を pending に戻す遷移とし、履歴(Run/Decision)は不変で残す。within-step の部分差し戻しは v0.0.x。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — Run に Agent プロセス情報(pid / worktree path)を持たせる
- **棄却理由**: 技術依存情報はドメインを汚す。Unit-02 が runId に紐づけて別管理する。

# Unit-02: Orchestration / Agent Runner

## メタ
- 親: [s3/index.md](./index.md)
- 所属 US: [US-07](../s1/us-07-agent-generate-artifact.md), [US-08](../s1/us-08-retry-run.md)
- ステータス: 確定
- MVP: ◎(US-07, US-08)

## 責務 (1〜2 行)
Claude Agent SDK で `kit/skills/aidlc-sN` を **headless 起動**し、Run を実行する技術アダプタ。git worktree 管理、**stall 検知**、retry 再起動、そして実行中に発生する **HumanTask / Artifact / Wiki更新 / ReviewBlock を emit** する。Run が「何か」は持たず Unit-01 を読み書きする。

## 外部依存
- **Unit-01**(Cycle/Run core): Run state を read し `advanceRun` で前進させる(片方向)。
- **Unit-07**(Config): 対象リポ path / モデル名 / step→skill マッピングを read(絶対パス埋め込み禁止)。
- **kit/skills/**: AI-DLC スキル本体を load(web/IDE 両刀の共有資産)。
- emit 先(購読は相手側): Unit-03(HumanTask)/ Unit-05(Artifact・Wiki)/ Unit-04 へは ReviewBlock[] を Unit-03 経由で渡す。

## I/F 定義 (この Unit が公開する契約)

### コマンド(Unit-03 などから呼ばれる)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| launchRun | { runId, step, repoPath, worktreeRef } | RunHandle(プロセス起動) | SkillNotFound / WorktreeBusy / RepoNotFound |
| resumeRun | { runId, answer:HumanAnswer } | RunHandle(回答注入し再開) | RunNotWaiting |
| retryLaunch | { runId } | RunHandle(新 attempt 起動) | — |
| cancelRun | { runId } | void | RunNotRunning |

### emit するイベント(購読側が受ける契約)
```
HumanTaskEmitted   { runId, kind: question|visual_review|device_check|decision|backtrack|stall_retry, payload }
ArtifactEmitted    { runId, path(aidlc-docs 相対), kind: us|mock|flow|uow|code|screenshot }
WikiUpdated        { runId, section: ubiquitous|decision|ledger }
ReviewBlocksEmitted{ runId, blocks: ReviewBlock[] }   // Unit-04 の型を使う
RunStateChanged    { runId, to: running|stalled|done|failed }  // → Unit-01.advanceRun
```

### 通信路(確定)
- orchestrator が Agent SDK を **子プロセス/セッションで起動**し、**stdout の JSON ストリームを購読**(Run の進捗・構造化出力)。
- 成果物は **aidlc-docs への file write を watch** して `ArtifactEmitted` 化。
- HumanTask は Agent の**構造化出力**(ツール呼び出し or 規定スキーマ)で emit。
- 実装詳細(SDK API・スキーマ確定)は S7 統合で詰める。

### stall 検知ポリシー(可変点)
- 無出力タイムアウト(env 設定値、既定案 N 分)を超えたら `RunStateChanged(stalled)` を emit → Unit-03 が stall_retry の HumanTask 化。
- 自動 retry は無し(MVP 手動)。上限 attempt は env(既定 3、Unit-01 Q-02 と整合)。

## この Unit 固有の 質疑応答ログ

### Q-01 — Agent ↔ studio の通信路は何にするか?
- 案: orchestrator が Agent SDK を子プロセス/セッションで起動し、(a) stdout/JSON ストリームを購読、(b) 成果物は aidlc-docs への file write を watch、の二系統。HumanTask は Agent がツール呼び出し or 構造化出力で emit。この方針でよいか、別の IPC を想定するか。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > 上記二系統(stdout JSON ストリーム購読 + aidlc-docs file watch)+ HumanTask は構造化出力で確定。具体的な SDK セッション API とスキーマは S7 統合で確定する(S3 では通信モデルの方向性のみ固定)。

### Q-02 — worktree のライフサイクル(いつ作り・いつ消すか)
- 案: Cycle 開始時に `version` 名の worktree を作成、completeCycle で撤去(変更なしなら自動削除)。並行 Cycle は別 worktree。retry は同 worktree で再実行。これで US-09 の並行と衝突回避を満たすか。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > **Cycle 開始で作成 / completeCycle で撤去(変更なしは自動削除)/ retry は同 worktree / 並行 Cycle は別 worktree** で確定。worktreeRoot は env 設定(Unit-07)。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — Run 実行を「emit only」にして依存を一方向化
- **理由**: Orchestration が Inbox/Artifact/Review を直接書きに行くと双方向依存になる。HumanTask/Artifact/ReviewBlock を**イベントとして emit** し購読側が処理する設計で循環を断つ(index D-02)。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-02 — stall を「failed」と区別して独立 state にする
- **理由**: stall(無応答 = 復帰可能)と failed(明示エラー)は人間の対応が違う(retry vs 原因調査)。Run state を分け、stall は SCR-02 から手動 retry できる(US-08)。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — orchestrator が aidlc-docs を直接 render して web に返す
- **棄却理由**: 成果物の閲覧/整形は Unit-05 の責務。Orchestration は emit(発生通知)に専念し、内容描画を持たない(関心の分離)。

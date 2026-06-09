# S7 — PJ 統合 進行ログ

## メタ
- 工程: S7 (Integration)
- 役割: アプリケーションエンジニア(統合)
- バージョン: v0.0.1
- ステータス: 確定
- 入力参照: [s6-pure-code.md](./s6-pure-code.md), [s3/](./s3/), [s5/](./s5/), [s2.5/](./s2.5/)
- コード出力先: `src/app/`・`src/infra/`・`web/`・`tests/`(`src/domain/` は触らない)
- 作成日: 2026-06-06
- 更新日: 2026-06-06

## v0.0.1 スコープ(縮小禁止 / S1・S2 確定済を全量統合)
v0 縦ループ: **Cycle 作成 → サイトで Phase 起動 → AI が headless 実行 → 判断時に Q カード生成 → サイトで回答 → AI 再開 → stall なら retry**。

- US: US-05 / US-06 / US-07 / US-08 / US-12 / US-13(6 本)
- 画面: SCR-01(Cycle 一覧・作成)/ SCR-02(Cycle 詳細・実行)/ SCR-03(Human Inbox)/ SCR-04(レビュー詳細)/ SCR-05(Q 回答)
- 全画面の **全状態**(empty/list/idle/running/stalled/done/default/backtrack)を実装。状態の独断省略は禁止。

## 統合アーキテクチャ(ports & adapters / Bun + TS)
```
src/
  domain/            # S6 純粋ドメイン(無変更・依存の最内核)
  app/
    ports/           # Port I/F: Repos / OrchestratorPort / Clock / IdGen / NotifyPort / UnitOfWork
    services/        # use-case(unit ごと): cycle / inbox / review / task / project / dashboard / memory
    composition.ts   # 合成ルートの型(ports の束)
  infra/
    db/              # bun:sqlite store + migrations + 7 集約 Repo 実装 + UnitOfWork(1 tx)
    http/            # Hono サーバ + REST ルート(5 画面分)
    orchestrator/    # OrchestratorPort 実装: scripted(決定論) + live(ローカル Claude CLI headless)
    sys/             # SystemClock / UlidIdGen 等
  server.ts          # 合成ルート: infra → app → http を結線して常駐起動
web/                 # Vite + React(5 画面 / 全状態 / s2.5 視覚契約を再現)
tests/
  integration/       # 実 DB(bun:sqlite tmp file)で repo / service / API を貫通
  e2e/               # Playwright 視覚 E2E(実 DB + scripted orchestrator / 全状態 screenshot)
  e2e-live/          # 実 AI E2E(ローカル Claude headless / 決定論スイートとは別レイヤで追加)
```

## I/F 契約整合チェック (S3 ↔ ドメイン公開関数)

S3 は I/F **提案**。S5/S6 で意図的リネーム(衝突回避)が確定済(S5 Q-02)。S7 アダプタは **実装真実 = S6 公開関数**に従い、S3 の意味契約(引数の本質・エラー区分・副作用)を保存する。差分は下表で reconcile。

| # | S3 I/F 定義(Unit) | S6 ドメイン公開関数 | 一致/差分 | 解消方針 |
|---|---|---|---|---|
| 1 | Unit-01 `createCycle{title,version,taskIds}` → Cycle / EmptyTitle,DuplicateVersion | `createCycle(CreateCycleCmd)` → `Result<Cycle,CycleError>`。`pipeline[]`/`projectId`/`createdAt` を cmd で受ける | 差分(引数追加) | 一致扱い。version 重複・pipeline 採番は **S7 app 層**で検証(DuplicateVersion = repo 一意制約 / EmptyPipeline は domain) |
| 2 | Unit-01 `startPhase{cycleId,step}` → Phase+Run | `startPhase(cycle,{step,runId,startedAt})` → `Result<Cycle,_>` | 差分(集約一括返却) | 集約ルート全体を返す S6 設計に統一。runId/startedAt は S7(IdGen/Clock)が供給 |
| 3 | Unit-01 `advanceRun{runId,to}` / `retryRun` / `backtrackTo` / pause/resume/complete | `advanceRun` / `retryRun` / `backtrackTo` / `pauseCycle` / `resumeCycle` / `completeCycle` | 一致 | そのまま結線。`to: Exclude<RunState,"running">` を API バリデーションに反映 |
| 4 | Unit-02 emit: HumanTaskEmitted/ArtifactEmitted/WikiUpdated/ReviewBlocksEmitted/RunStateChanged | `events.ts`: QuestionRaised/ArtifactEmitted/WikiUpdated/ResultEmitted/RunStateChanged | 差分(命名) | HumanTask→Question, ReviewBlocks→Result に統一(S5 確定)。orchestrator emit を `DomainEvent` に正規化(D-04 系) |
| 5 | Unit-02 `launchRun/resumeRun/retryLaunch/cancelRun` | (domain になし=技術層) | 新規(S7) | `OrchestratorPort` として S7 で定義。Question の `Unit02Command` と 1:1 対応 |
| 6 | Unit-03 `HumanTask{kind,state,payload}` / `answerTask` → Decision + resume | `Question{kind,state,payload}` / `applyAnswer(q,answer,ctx)` → `{question,fact,command}` | 差分(命名+返却) | answerTask = applyAnswer。返却 `{question,fact,command}` を **1 トランザクション**で適用(S6 handoff)→ command を OrchestratorPort へ |
| 7 | Unit-03 `Decision` 不変追記 | `Fact`(append-only / revisions / AI 不変) | 差分(命名) | Decision→Fact。AI パスから editFact 禁止(human のみ / S6 handoff) |
| 8 | Unit-03 `listInbox/openTask/listDecisions` | `isAwaitingHuman` + Repo 投影 | 差分(query は S7) | 一覧/詳細は app 層 query + QuestionRepo。`isAwaitingHuman(questions,runId)` で待ち判定 |
| 9 | Unit-04 `ReviewBlock` 9 種 / `renderReview` / coerce | `review.ts` `ReviewBlock`(9 種一致) / `coerceBlocks` / `isKnownBlockType` / MVP 4 種 | 一致 | レンダラは web 側。`coerceBlocks` で未知 type を skip+warn |
| 10 | Unit-05 `readArtifact{path}` PathOutsideDocs / Ledger carried→into,dropped→reason / reconcile=0 | `docPath` / `makeLedgerEntry` / `reconcileEntry` / `unreconciledCount` / `canStartNextCycleS1` | 一致 | FS read は `docPath` 検証後のみ(S6 handoff)。次サイクル S1 gate に `canStartNextCycleS1` |
| 11 | Unit-06 `addTask/reorderTasks/assignToCycle/propose/validate/accept/reject` | 同名一式 + `makeFinding` | 一致 | そのまま結線。duplicate=addTask 時 / stale=createCycle 時の検証 trigger は app 層 |
| 12 | Unit-07 `ProjectConfig/EnvConfig/Vision/StepPipeline` ops | `openProject/setVision/readConfig/readPipeline/customizePipeline` + `EnvConfig`(絶対パス埋込禁止) | 一致 | env は repoPath/modelName/worktreeRoot/stallTimeoutMin/maxAttempt。AbsolutePathLeak は app 層検証 |
| 13 | Unit-08 `getMinimalBoard/getFullBoard` 4 象限 | (domain になし=read model) | 新規(S7) | app 層 query で Cycle/Question/Task Repo から投影(集約キャッシュ無し) |

**結論**: 集約境界・Repository Port シグネチャの変更は不要。差分はすべて (a) 意図的リネーム(S5 確定済)、(b) 技術層(orchestrator/query/read-model)= S7 新規責務、のいずれか。S3/S5 への手戻りなし。

## アダプタ実装一覧
| # | アダプタ種別 | コードパス | 呼び出すドメイン関数 | テストパス | 対応 US |
|---|---|---|---|---|---|
| 1 | DB / Repository(11 集約 store) | `src/infra/db/*-repo.ts` + `store.ts` + `migrations.ts` + `serde.ts` | 各集約の save/find/list(JSON+索引列) | `tests/integration/store.test.ts` | 全 US 基盤 |
| 2 | UnitOfWork(1 tx) | `src/infra/db/unit-of-work.ts` | applyAnswer 結果の question+fact を 1tx | `store.test.ts`(rollback 含む) | US-12/13 |
| 3 | sys: Clock / IdGen | `src/infra/sys/{clock,id-gen,fakes}.ts` | `instant()` / branded id ctor | `store.test.ts` | — |
| 4 | App services(use-case) | `src/app/services/{project,cycle,inbox}-service.ts` + `event-applier.ts` + `compensate.ts` | createCycle/startPhase/retryRun/applyAnswer/backtrackTo/raiseQuestion/buildReview/advanceRun | `tests/integration/api.test.ts` | US-05/06/07/08/12/13 |
| 5 | HTTP(Hono)+ secureHeaders | `src/infra/http/app.ts` + `routes/*.ts` + `envelope.ts` | (services 経由) | `api.test.ts` | 全画面 |
| 6 | Orchestrator: scripted(決定論) | `src/infra/orchestrator/scripted.ts` + `shared.ts` | emit→sink(QuestionRaised/ResultEmitted/RunStateChanged) | `tests/integration/loop.test.ts` | US-06/07/08/12/13 |
| 7 | Event sink(emit→1tx 永続化) | `src/app/services/event-applier.ts` | raiseQuestion/buildReview/advanceRun/indexArtifact | `loop.test.ts` | US-07/12/13 |
| 8 | Orchestrator: live(ローカル Claude CLI) | `src/infra/orchestrator/live.ts` + `shared.ts` | emit→sink(実 AI 出力を ResultEmitted→done) | `tests/e2e-live/live-run.test.ts` | US-07(実 AI) |
| 9 | Web UI(5 画面 / 全状態) | `web/src/**`(features + lib/api.ts + styles) | API client 経由 | `tests/e2e/*.spec.ts` + 12 screenshot | US-05/06/07/08/12/13 |
| 10 | 合成ルート + SPA 静的配信 | `src/server.ts` + `src/main.ts`(127.0.0.1 バインド) | port→adapter 手結線 | e2e(同一オリジン) | — |

## 技術依存マップ
- ランタイム: **Bun**(既存 / `bun.lock`・`bun test`)
- DB: **bun:sqlite**(D-02)
- HTTP: **Hono**(D-03)
- ID: **crypto.randomUUID**(Bun 組込 / 追加依存ゼロ / D-05)
- Clock: SystemClock(`Instant` = ISO-8601 / D-05)
- Orchestrator: **scripted(決定論)+ live(ローカル Claude Code CLI headless)** の 2 アダプタ(D-01)
- DI 構成: 合成ルート `src/server.ts` で port→adapter を手結線(関数注入 / フレームワーク DI 不使用)
- エラーハンドリング戦略: ドメインは `Result<T,E>`、app 層で HTTP status へ写像、infra 例外は app 境界で捕捉し Result/5xx に正規化

## 質疑応答ログ

### Q-01 — orchestrator(Agent 起動層)の扱い / 実 AI テストの要否
- **回答**(ユーザー記入):
  > api じゃなくてローカル pc に入ってる claude 使って。実際の ai 使ったテストまで(その分前段のテストを緩めるというのは許しません)
- **確定**(AI 記入):
  > `OrchestratorPort` を定義し 2 アダプタを実装する。① **live = ローカル PC の Claude(Claude Code CLI / サブスク認証)を headless 起動**(Anthropic API キーは使わない)。② **scripted = 決定論アダプタ**。実 DB + Playwright 視覚 E2E は ② で全 Human Inbox ループを毎回同結果で網羅(=前段テストは緩めない)。加えて ① を使う **実 AI E2E**(`tests/e2e-live/`)を別レイヤで追加する。

### Q-02 — studio store の実 DB / HTTP スタック既定
- **回答**(ユーザー記入):
  > 最終目的や、ai との親和性をもとに考えて
- **確定**(AI 記入):
  > 最終目的(ローカル常駐サーバ + ローカル Claude headless + worktree 並行)と AI 親和性(全リポが Bun + TS / orchestrator がローカル Claude)から **bun:sqlite + Hono** を採用(D-02 / D-03)。追加ランタイム依存ゼロ、ファイル実体 = 真の実 DB、Bun ネイティブで起動・テストが軽い。

---

## AI が独自に決めたこと と 理由

### D-01 — OrchestratorPort を 2 アダプタ(scripted + live ローカル Claude)で実装
- **理由**: Q-01 回答に従う。決定論網羅(品質ゲート)と実 AI 検証(本物性)を両立。ドメインは OrchestratorPort にのみ依存し、live/scripted 差し替えは合成ルートで行う(依存逆転を保つ)。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-02 — 永続化 = bun:sqlite(ファイル実体)
- **理由**: ローカル常駐 studio サーバに最適。追加依存ゼロ、トランザクション(applyAnswer の 1 tx 要件)を素直に満たす。テストは tmp file DB で実 DB のまま高速。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-03 — HTTP = Hono
- **理由**: Bun ネイティブ・軽量・型安全・テスト容易(`app.request()` で実サーバ起動不要の統合テスト)。常駐サーバの JS バジェットにも収まる。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-04 — orchestrator emit を DomainEvent に正規化して 1 tx で永続化
- **理由**: S6 handoff(emit 正規化は S7 責務)。live/scripted どちらの emit も `events.ts` の `DomainEvent` に写像し、QuestionRaised→Question 永続化 / ResultEmitted→Review 永続化 / RunStateChanged→Cycle.advanceRun を **1 トランザクション**で適用。部分適用による状態不整合を防ぐ。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-05 — ID = crypto.randomUUID / Clock = SystemClock(ISO-8601 Instant)
- **理由**: 追加依存ゼロ。ドメインは IdGen/Clock port を受けるため、テストでは決定論 fake を注入(網羅性確保)、本番は SystemClock/randomUUID。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-06 — live adapter は Claude Code CLI を `-p`(headless / stream-json)で worktree 内に起動
- **理由**: Q-01「ローカル PC の Claude を使う」。Agent SDK + API キーではなく、ローカル CLI のサブスク認証を使う。worktree 隔離で並行サイクル前提も満たす。kit/skills を CWD に load して S1〜S7 skill を headless 実行。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-07 — Repo の owner スコープ = projectId / ProposalRepo.save は projectId を受ける
- **理由**: S5/S6 ドメインに UserId 概念は無い(v0 はローカル単一ユーザ / マルチユーザは v1.0.0 公開軸 backlog)。よって multi-tenant 防御スコープ = `projectId`。`TaskProposal` は projectId を持たないため、`WikiRepo`/`ConversationRepo` と同じく **save(projectId, proposal)** で永続化スコープを供給(ドメイン変更でも越権スコープ追加でもない / port の整合修正)。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-08 — 7 reviewer pipeline は backend-complete / frontend+E2E-complete の 2 ゲートで一括起動
- **理由**: operating-model は「Phase 完了ごとに 7 reviewer」を要求するが、S7 内部 sub-phase ごと(6×7=42+ agent)に回すとユーザー指示「コンテキストを枯渇させない」に反する。Phase = レビュアー視点の塊、の定義に沿い (1) backend 完成(Phase 1〜3: 永続化+app+orchestrator)と (2) frontend+E2E 完成(Phase 4〜5)の 2 塊で full 7 reviewer を並列起動。各 sub-phase には `tsc --noEmit` + `bun test` の hard green gate を必ず通す。
- **判断**(ユーザー記入): 上書き
- **上書き内容**(上書き時のみ):全体に対するレビューだと精度が心配。。オーケストレーションをうまく使えばコンテキスト枯渇させずに両立できないかな？理想はタスクに対してのレビューだけど、Unit of Workとタスクが1:1じゃないから難しいのかな
- **採用(確定 / AI 記入)**: 上書きを採用。レビュー粒度を「backend/frontend 塊一括」から **Unit(=UoW)/縦スライス単位の並列 fan-out** に変更。各 reviewer は1スライス(Cycle ライフサイクル / Inbox+sink / orchestrator 2 アダプタ / DB core / Project+HTTP / Web 各 feature 等)だけを深掘り(=精度)、詳細は subagent context に隔離(=main context 枯渇しない)。タスク↔UoW が 1:1 でないため近似として「Unit/アダプタの縦スライス」を粒度に採用。**この finer 再レビューで塊一括では出なかった追加 CRITICAL/HIGH を捕捉**(backtrack モーダルの確定ボタン恒久 disabled[CRITICAL] / Cycle 詳細トップバー誤アクション / live 終端 emit エスケープ / serde JSON.parse 未捕捉 / DuplicateVersion TOCTOU 等)→ 全件解消(155 test green)。粒度の効果を実証(ユーザー指摘どおり)。

---

## 棄却した案

### R-01 — Anthropic API キーで Agent SDK 起動
- **棄却理由**: Q-01 で明確に「api じゃなくてローカル pc の claude」と指定。サブスク認証のローカル CLI を使う。

### R-02 — Postgres / better-sqlite3+Express
- **棄却理由**: ローカル常駐 + Bun + ローカル Claude という最終目的に対し、コンテナ依存(Postgres)や Node 前提(better-sqlite3)は親和性が低い。bun:sqlite が最小・最速・本物。

## 統合テストログ
| 日付 | テスト | 結果 | 備考 |
|---|---|---|---|
| 2026-06-06 | repo/store 実 DB(bun:sqlite :memory:) | pass | save/find/list/scope/UNIQUE/UoW rollback/upsert |
| 2026-06-06 | app + HTTP API 実 DB(`app.request()`) | pass | 4xx/409/404 / 1tx atomicity / multi-tenant scope |
| 2026-06-06 | full Human Inbox loop(scripted, 実 DB) | pass | create→start→Q→answer→review→approve→done / stall→retry |
| 2026-06-06 | **決定論スイート合計** | **155 pass / 0 fail** | 84 domain + 71 integration / finer per-slice review 修正反映後 / `tsc` クリーン(root+web)|
| 2026-06-06 | Playwright 視覚 E2E(実 DB + scripted, 同一オリジン) | 4 pass | 全画面ループ + 12 状態 screenshot を `aidlc-docs/s7/screenshots/` に生成 |
| 2026-06-06 | **実 AI E2E(ローカル Claude headless, 実 DB)** | **pass** | run→done + 実モデル文を Review として永続化(`test:live`) |

> 注: 実 AI E2E(`tests/e2e-live/`)は決定論スイートとは別レイヤの追加(前段テストは緩めていない / Q-01 回答準拠)。`bun run test:live` は `claude` 不在時のみ skip。

## S7 完了レポート

### 実装サマリ
- 対象: v0.0.1 統合(永続化 + HTTP API + orchestrator 2 アダプタ + Web UI 5 画面 + 視覚 E2E + 実 AI E2E)
- コード: `src/app/`(ports + services)/ `src/infra/`(db / http / orchestrator / sys / log)/ `src/server.ts` + `src/main.ts` / `web/src/**`
- ドメイン層 `src/domain/` は **S6 から無変更**(完了条件 1 達成)
- I/F 整合: S3 ↔ S6 突合表を全件 reconcile(集約境界・Repo Port 変更なし / 完了条件 2 達成)
- 貫通: 画面 → API → ドメイン → 実 DB(bun:sqlite)を US-05/06/07/08/12/13 で確認(完了条件 4 達成)

### Reviewer ゲート結果(D-08 / 2 塊)
| ゲート | 並列 reviewer | CRITICAL | HIGH | 結果 |
|--------|--------------|----------|------|------|
| backend-complete(Phase 1-3) | typescript / security / silent-failure / code / type-design / tdd / comment(7) | 0 | 全件解消 | 解消後 151 test green |
| frontend+E2E-complete(Phase 4-5b) | typescript / security / a11y / code / silent-failure(5) | 0 | 全件解消 | 解消後 全 suite green |
| S7 完了 cross-cut | refactor-cleaner(1) | 0 | DRY 抽出 2 件適用 | 151 test green |

主要解消 HIGH: 回答フローの 1tx 化(backtrack 同一 tx)/ reviews UNIQUE NULL-taskId / orchestrator 失敗時の run 補償 / live adapter のストリーム drain デッドロック・kill・終端 emit 保証 / a11y(コントラスト 5.5:1・モーダル inert/close・skip link・focus 管理)/ XSS(img src スキーム検証)/ secureHeaders。

### テスト結果
- 決定論: **155 pass / 0 fail**、`tsc --noEmit` クリーン(root + web)
- 視覚 E2E: Playwright **4 pass** + 12 状態 screenshot 成果物(`aidlc-docs/s7/screenshots/`)
- 実 AI E2E: **pass**(ローカル Claude headless が実出力 → Review 永続化)
- 完了条件 3(E2E/統合テスト通過)達成

### 人間レビュー(実機+視覚のみ / コードレビューは求めない)
- 視覚成果物 = `aidlc-docs/s7/screenshots/scr-0{1..5}.*.png`(全画面 × 全状態)
- 実機: `bun run src/main.ts`(→ http://127.0.0.1:8787)+ `cd web && bun run dev`、または `cd web && bun run build` 後に server が SPA を同一オリジン配信

## 次サイクルへの引き継ぎ (PDF P.10 準拠・必須)
- **何が漏れていたか**: live adapter の対話型 Q→回答→resume ループ(headless `claude -p` は実行完遂型で run 途中停止しない)。v0 は run→emit→done の実 AI 検証まで。orchestration→web の push(SSE/WS)も未実装(v0 はポーリング/リクエスト駆動)。
- **暫定の解決方針**: 実 AI の Q ループは `--resume`/session 注入で v0.0.x に実装。push は SSE を v0.0.x。いずれも `ledger.yml`(S7-C1 / S7-C2)に carried で台帳化済 → 次サイクル S1 で reconcile 必須。
- **棄却した案とその理由**: Anthropic API キー起動(R-01 / Q-01 で「ローカル PC の claude」指定)/ Postgres・better-sqlite3(R-02 / ローカル常駐+Bun 親和性)/ API 認証・マルチユーザ(`ledger.yml` S7-D1 dropped → BACKLOG B 公開軸 / ドメインに UserId 不在)。
- frontend MEDIUM(PageGuard 共通化等)は機能影響なしのため S7-C3 carried。
- 差し戻し(US-13)後の戻り先 Phase への run 自動再生成は未対応(`backtrackTo` は pipeline rewind+Fact までで run を作らず、戻り先 Phase は domain 上 running(run なし)。既存 `startPhase` は pending 前提のため再起動不可)。S6 に `relaunchPhase` 相当が必要 → `ledger.yml` S7-C4 carried。v0 は SCR-02 で「要再実行 / running(run なし)」を disabled-with-explanation 表示し、壊れて見えないことのみ担保。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (なし — S6 から無変更でドメインが動作し、S3/S5 への手戻りは発生しなかった)

# S6 — 純粋ドメインコード 進行ログ

## メタ
- 工程: S6 (Pure Code)
- 役割: ドメインエンジニア
- ステータス: 確定(完了条件 4/4 充足 + D-01〜D-08 ユーザー承認済み。2026-06-06)
- 入力参照: [s5/](./s5/)
- コード出力先: `src/domain/`
- 言語/テストランナー: **TypeScript** / **`bun test`**(組み込み・Jest 互換・追加依存ゼロ。repo は既に Bun を採用 = bun.lock / `type: module`)
- 作成日: 2026-06-06
- 更新日: 2026-06-06

> 進め方: AI が小単位(値オブジェクト→集約)を TDD で実装(`*.test.ts` を先に書いて通す)。命名/分割/様式の判断は `### D-NN` に追記。**ユーザーは IDE でこの md を開き、`### Q-NN` の `回答` / `### D-NN` の `判断` を直接書き込む**。純粋性チェックを毎集約ごとに記録。完了条件4つが揃ったら `ステータス: 確定` にして S7 を案内。

## 実装一覧

| # | 対象モデル/集約 | コードパス | テストパス | 対応 US | 状態 |
|---|----------------|----------|----------|--------|------|
| — | shared(Result/ids/Instant/Text/Verdict/Step) | [shared/](../src/domain/shared/) | shared/shared.test.ts | 全集約の基盤 | ✅ 9 pass |
| 1 | Cycle(Phase/Run 状態機械) | [cycle/cycle.ts](../src/domain/cycle/cycle.ts) | cycle.test.ts | US-05〜09/29/30 | ✅ 25 pass |
| 2 | Question(Inbox + applyAnswer) | [question/question.ts](../src/domain/question/question.ts) | question.test.ts | US-12〜16/31 | ✅ 12 pass |
| 3 | Facts(確定事項 / 版履歴) | [facts/facts.ts](../src/domain/facts/facts.ts) | facts.test.ts | US-17 | ✅ 8 pass |
| 4 | Review(=Result)+ ReviewBlock | [review/review.ts](../src/domain/review/review.ts) | review.test.ts | US-13/18 | ✅ 6 pass |
| 5 | Task / Backlog | [task/task.ts](../src/domain/task/task.ts) | task.test.ts | US-01〜04/23/24 | ✅ 11 pass |
| 6 | Project(pipelineDef/env) | [project/project.ts](../src/domain/project/project.ts) | project.test.ts | US-22/25/26/27 | ✅ 7 pass |
| 7 | 外部記憶(Artifact/Wiki/Ledger/DocPath) | [external-memory/external-memory.ts](../src/domain/external-memory/external-memory.ts) | external-memory.test.ts | US-19〜21/28/32/33 | ✅ 9 pass |
| — | ドメインイベント契約 | [events/events.ts](../src/domain/events/events.ts) | events.test.ts | S4 引き継ぎ(Unit-02 emit) | ✅ 2 pass |

> 合計 **84 tests pass / 0 fail**(`bun test src/domain`)。`tsc --noEmit` クリーン(strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess)。全ファイル < 800 行(最大 cycle.ts 342 行)。

## 完了条件チェック(全 4/4)
- [x] (1) 全集約/モデルが実装済 — 7 集約 + ドメインイベント契約 + shared(下表すべて緑)
- [x] (2) フレームワーク import がドメイン層に存在しない — 下「純粋性チェックログ」参照(DB/ORM/HTTP/UI/DI 全て NONE)
- [x] (3) ドメインロジックの単体テスト(モック不要)が通る — 84 pass / **mock 0 件**(純粋なので不要)
- [x] (4) 不変条件が型・関数で表現 — `Result<T,E>` + branded VO + 各 INV を弾くコマンド(IllegalTransition / TaskReviewsPending / EmptyReasonOnReject / PathOutsideDocs 等)

## 純粋性チェックログ
| 日付 | チェック対象 | 検出された違反 | 対応 |
|------|------------|--------------|------|
| 2026-06-06 | `src/domain/**` の import 文 | なし(intra-domain のみ: shared/cycle/facts/question/review) | — |
| 2026-06-06 | framework/ORM/HTTP/UI/DI import(express/react/typeorm/prisma/fs/http 等) | なし | — |
| 2026-06-06 | DI 装飾(`@Injectable`/`@Entity`/`@Component` 等) | なし | — |
| 2026-06-06 | 関数内 I/O(`Date.now`/`new Date`/`Math.random`/`crypto.`/`fetch`/`process`/`require`) | なし(時刻・id・乱数は全て引数注入 = D-04) | — |

## 質疑応答ログ

書き方: AI が `### Q-NN` で問いを追記。**ユーザーは IDE でこの md を開き、`回答` に直接書き込む**(複数行・コードブロック OK)。AI は次のやり取りで `確定` を埋める。

(現時点で確認待ちの Q なし。スタック・テストランナー・実装様式は S5 確定 + 下記 D-NN で進行。疑義あれば Q を起こす。)

---

## AI が独自に決めたこと と 理由

書き方: AI が `### D-NN` で決定と理由を追記。ユーザーは `判断` を `承認 / 上書き / 保留` から選び、上書きするなら `上書き内容` に直接書く。

### D-01 — テストランナーは `bun test`(組み込み)を採用
- **理由**: repo は既に Bun(bun.lock / bun 1.3.14 / `package.json type:module` / `s2.5:capture` も `bun run`)。`bun test` は Jest 互換 API(`import { test, expect } from "bun:test"`)で**追加依存ゼロ**・TS をそのまま実行。Vitest/Jest を足すと依存と設定が増える。`[[search-first]]` に従い既存ツールを使う。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-02 — 失敗しうる操作は例外でなく `Result<T, DomainError>`(ok/err)を返す
- **理由**: S5 の各操作は不変条件違反を「エラー列(EmptyTitle / DuplicateVersion / IllegalTransition …)」で定義済み。純粋関数で `throw` を制御フローに使わず、**ドメインエラーを判別可能ユニオンの値**として返すと、① 型でハンドリング漏れを検出 ② テストが try/catch 不要 ③ 副作用なし(純粋)。エラーは集約ごとの union(例 `CycleError = 'EmptyTitle' | 'DuplicateVersion' | …`)。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-03 — 集約は readonly データ型 + 名前空間化した純粋関数(クラス可変を使わない)
- **理由**: ユーザーの CRITICAL 規約「常に新オブジェクトを返し、既存を破壊しない」。集約を `readonly` フィールドの型で表し、コマンドは `Cycle.startPhase(cycle, cmd): Result<Cycle, …>` のように**新インスタンスを返す純粋関数**で表現。クラスの in-place 変更や DI 装飾(`@Injectable` 等)を一切持たない。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-04 — id 生成・時刻・乱数はドメイン内で発生させず引数で注入する
- **理由**: 純粋性要件「I/O(時刻取得・乱数・ID 採番)を関数内に直書きしない → 引数で渡す」。`createCycle({ id, version, title, createdAt })` のように **id(branded string)と `Instant`(ISO-8601)を外から渡す**。`Date.now()` / `crypto.randomUUID()` はドメインに登場させない(採番・時刻取得は S7 のアダプタ責務)。これで全テストがモック不要の決定論になる。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-05 — id は branded string 型 / `Verdict`・`ReviewBlock`・`Step` は共有 types 層に正本を置く
- **理由**: S5 で「ReviewBlock の正本は共有 types 層」「Verdict は Question/Facts 共有」と確定。id は `type CycleId = string & { readonly __brand: 'CycleId' }` の branded type にして異種 id の取り違えを型で防ぐ。共有語彙は `src/domain/shared/` に置き各集約が import(クリーンアーキの内向き依存)。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-06 — 横断ユースケース(answerQuestion の Question close + Fact append + Unit-02 命令)は「純粋ドメインサービスが結果データを返す」形にし、port 呼び出し/トランザクションは S7 に残す
- **理由**: S5 index/question D-02 で「answerQuestion は use-case interactor で 2 集約更新 + Unit-02 命令を束ねる」と確定。ただし port(永続化・Agent SDK)を**呼ぶ**のは技術層(S7)。S6 では純粋な `applyAnswer(question, answer, ctx): Result<{ question, fact, command }, …>` を提供し(新 Question・追記する Fact・Unit-02 へ渡す命令の**データ**を返すだけ)、実際の保存・SDK 呼び出しは S7 のインタラクタが行う。これで「調停ロジックは S6 で純粋にテスト」「I/O は S7」を両立。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-07 — S5「Result(レビュー成果)」の型名を `Review` にする(コード上のみ)
- **理由**: S5 のユビキタス語「Result」は本コードの `Result<T,E>`(ok/err モナド, D-02)と名前衝突する。ドメイン型名を `Review`、ディレクトリを `src/domain/review/` にした(集約ルート = `Review`、構築関数 = `buildReview`)。ユビキタス言語上は「Result(レビュー成果 dossier)」のまま、コード識別子だけ衝突回避。ReviewBlock 名は S5 通り。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-08 — 集約をまたぐ判定値は引数で受ける(approvePhase の `allTaskReviewsApproved` / createCycle の `DuplicateVersion`)
- **理由**: Cycle 集約は Question を直接見ない(INV-5/9 / クリーンアーキの内向き依存)。「全 Task レビュー承認済みか」は Question 集約からアプリ層が集計し、`approvePhase` に boolean で渡す。同様に Version の Project 内一意(`DuplicateVersion`)は単一 Cycle では検証できずリポジトリの一意制約(S7)が担保する。これらは S6 では「外から与えられる事実」として扱い、集約の純粋性を保つ。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

---

## 棄却した案

### R-01 — Vitest または Jest をテストランナーに採用
- **棄却理由**: 追加依存と設定(transform / ts 設定)が増える。repo は Bun 採用済で `bun test` が TS をそのまま走らせる。D-01 参照。

### R-02 — 不変条件違反を例外(throw)で表現
- **棄却理由**: 制御フローに throw を使うとハンドリング漏れがコンパイル時に検出されず、純粋関数のテストも try/catch で煩雑。`Result` 型で型安全に表す(D-02)。

## 次工程 (S7) への引き継ぎ

### S3 の I/F 定義と突き合わせるべき公開関数(Unit ↔ ドメイン)
- **Unit-01(Cycle/Run core)**: `createCycle / startPhase / advanceRun / resumeRun / retryRun / approvePhase / backtrackTo / pauseCycle / resumeCycle / completeCycle`([cycle.ts](../src/domain/cycle/cycle.ts))。S3 Unit-01 I/F の `launchRun/resumeRun/retryLaunch` と突き合わせる。
- **Unit-03(Human Inbox)**: `raiseQuestion / applyAnswer / dismissQuestion / isAwaitingHuman`([question.ts](../src/domain/question/question.ts)) + Facts `append / editFact`([facts.ts](../src/domain/facts/facts.ts))。`applyAnswer` が返す `Unit02Command`(resumeRun/approveTaskReview/backtrack/retryLaunch/cancelRun)を S7 で Cycle コマンド + Agent SDK 呼び出しに配線。
- **Unit-04(Review render)**: `buildReview / coerceBlocks`([review.ts](../src/domain/review/review.ts))。`ReviewBlock` 正本をここに置いた。レンダラ(React)は S7。
- **Unit-06/07/05**: Task / Project / 外部記憶 の各公開関数。

### 技術層が実装すべきポート(S7 で adapter 実装。ドメインは知らない)
- **ID 採番**: 全 `*Id`(branded string)を生成する `IdGenerator`(D-04 でドメインは受け取るだけ)。
- **時刻**: `Clock.now(): Instant`(D-04。全コマンドの `*At` 引数を供給)。
- **永続化リポジトリ**: `Cycle/Question/Fact/Task/Project/Review/外部記憶` の load/save。**Version の Project 内一意制約(`DuplicateVersion`)はここで担保**(D-08)。studio store は状態のみ・成果物内容は持たない(外部記憶 INV-1)。
- **Agent SDK(Unit-02)**: `RunStateChanged / QuestionRaised / ResultEmitted`(+ v0.0.x の Artifact/Wiki)を [events.ts](../src/domain/events/events.ts) の契約型に正規化して emit。`Unit02Command` を実 SDK 操作(resume 注入 / retryLaunch / cancel / worktree)に変換。
- **FS アクセス**: `readArtifact`(`DocPath` 検証は S6 の `docPath` を使い、実 read は adapter)/ Wiki の保存(`regenerateWikiBody` の純粋合成は S6、書き込みは adapter)。

### ドメイン層が前提とする不変条件(統合時に技術層で壊さないこと)
- 集約コマンドは**必ず Result を確認**して反映する(Err を握り潰さない)。直接フィールド書き換え禁止(状態遷移は集約コマンド経由のみ)。
- **回答の原子性**: `applyAnswer` が返す `{question, fact, command}` は **1 トランザクション**で適用(Question close + Fact append + Cycle/Unit-02 命令)。途中失敗で Fact だけ残す等を作らない(question D-02)。
- **待ち = open Question の導出**(index D-01): RunState に waiting を足さない。`isAwaitingHuman` で計算する。
- **Fact は AI から不変**: adapter/AI 経路から `editFact` を呼ばない(人間操作のみ)。過去版を破壊しない。
- **reconcile ゲート**: 次サイクル S1 起動前に `canStartNextCycleS1(ledger) === true` を必須化(外部記憶 INV-4 / kit #5)。
- **DocPath 安全**: FS read は必ず `docPath` を通した値で行う(aidlc-docs ルート外を読まない)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか:
- 暫定の解決方針:
- 棄却した案とその理由:

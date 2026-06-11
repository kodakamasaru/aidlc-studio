# S7 — 純粋ドメインコード 進行ログ — v0.0.2

## メタ
- 工程: S7 (Domain Code)
- PhaseGroup: Build
- 役割: ドメインエンジニア
- バージョン: v0.0.2
- ステータス: 確定
- 入力参照: [s6/index.md](./s6/index.md) ※差分モデリング(既存 `src/domain/` を拡張)
- コード出力先: `src/domain/`
- 言語/テストランナー: TypeScript / `bun test`(`bun test src tests/integration` が回帰ゲート)
- 回帰: ベースライン **182 pass** → S7 後 **216 pass**(+34 / 0 fail)。`tsc --noEmit` clean。
- evaluator(typescript-reviewer 起動): **総合 PASS**(純粋性/S6整合/後方互換/越権 4 軸すべて PASS、CRITICAL/HIGH なし)。MEDIUM 指摘(inbox dispatch の silent no-op)は D-06 で対応済み。
- 作成日: 2026-06-11
- 更新日: 2026-06-11

> **方針**: S6 差分モデリングに従い、5 モデルを既存集約への増分として実装する。新規ファイルは集約フォルダ配下に小さく足す(`many small files`)。既存集約の再実装はしない。フレームワーク import をドメイン層に持ち込まない(純粋性)。

## 実装一覧

| # | 対象モデル | コードパス | テストパス | 対応 US | 状態 |
|---|----------|----------|----------|--------|------|
| 1 | step-contracts | `src/domain/project/step-contracts.ts` + `project.ts`(StepDef 拡張) | `project/step-contracts.test.ts` | US-01/06 | 確定 |
| 2 | artifact-profile | `src/domain/review/profile.ts` + `review.ts`(coerceBlocks 再形) | `review/profile.test.ts` | US-01/05 | 確定 |
| 3 | brief-completeness | `src/domain/review/brief.ts` | `review/brief.test.ts` | US-02/03 | 確定 |
| 4 | descope disposition | `src/domain/review/descope.ts` | `review/descope.test.ts` | US-03 | 確定 |
| 5 | run-role | `src/domain/cycle/cycle.ts`(Run.role + launchEval) | `cycle/run-role.test.ts` | US-02 | 確定 |
| 6 | descope wiring | `vocab.ts`(verdict) + `question/question.ts`(kind/payload/command) | `question/question.test.ts` | US-03 | 確定 |

## 純粋性チェックログ
| 日付 | チェック対象 | 検出された違反 | 対応 |
|------|------------|--------------|------|
| 2026-06-11 | 全新規ファイル | DB/HTTP/UI/ORM/DI import なし(`shared/{result,primitives,ids,vocab}` と同集約 review/task/brief のみ参照。全 type-only) | 違反なし(grep 確認 + evaluator PASS) |
| 2026-06-11 | I/O 直書き | `new Date`/`Date.now`/`Math.random`/`fs`/`process`/`fetch` ゼロ。時刻・id は全て引数注入 | 違反なし |
| 2026-06-11 | immutability | 既存オブジェクトの mutate なし(spread / `replacePhase`/`replaceRun` 経由) | 違反なし |

## 質疑応答ログ

書き方: AI が `### Q-NN` で問いを追記。ユーザーは IDE でこの md を開き `回答` に直接書き込む。AI は次のやり取りで `確定` を埋める。

(現時点で人間判断を要する未解決 Q はなし。S6 で論点は確定済み。命名・分割の判断は下記 D-NN に記録。)

---

## AI が独自に決めたこと と 理由

> **裁定方針(dogfood ハーネス原則)**: D-01〜D-07 はすべて**内部コードを読まないと評価できない**判断(命名/分割/層配置/リファクタ)。ハーネス原則「人間はソースを見ない / 非人間レビュー箇所は evaluator AI を起動して結論だけ出す」に従い、**人間の承認対象にしない**。各 D は evaluator AI(typescript-reviewer の総合 PASS + D-07 は architect の敵対的レビュー)で裁定済み。人間が見るのは結論のみ。

### D-01 — 既存 `coerceBlocks(raw)→{blocks,skipped}` を `filterKnownBlocks` に改名し、新 `coerceBlocks(profile,raw)→{kept,missing}` を `profile.ts` に置く
- **理由**: S6 artifact-profile が定義する `coerceBlocks(profile,blocks)→{kept,missing}` は「未知 type を捨てる(型レベル前方互換)」+「profile 必須 block の不足を warn」の 2 段。前段は既存 `coerceBlocks` のロジックそのもの。改名して内部再利用すれば DRY かつ責務が明確。既存 `coerceBlocks` の呼び出しは**テスト 1 箇所のみ**(app/infra/web は未使用・`.skipped` 参照ゼロ)で破壊範囲が閉じる。`KNOWN_BLOCK_TYPES` は正本として export(S6: Profile は参照する側)。
- **判断**: AI 自己決定(内部コードの命名/分割/リファクタ → ハーネス原則によりレビュアーは evaluator AI)。typescript-reviewer 総合 PASS で確定。
- **上書き内容**(上書き時のみ):

### D-02 — descope の 4 択を新 Verdict 値 `rework / descope / defer / rewind` として `Verdict` と `ALLOWED_VERDICTS` に追加
- **理由**: S6 descope-policy D-01 が「4 択 verdict 語彙(つくる/見送る/後回し/前のステップからやり直す)を Verdict に追加」と確定。`approve/reject` への多重定義を避け、descope の意味を自己完結させるため専用 4 値を足す(つくる=`rework` / 見送る=`descope` / 後回し=`defer` / やり直す=`rewind`)。追加は加法的で既存 kind の verdict 集合に影響しない。`rewind` のみ既存 `backtrack` 命令へ合流。
- **判断**: AI 自己決定(内部コードの命名/分割/リファクタ → ハーネス原則によりレビュアーは evaluator AI)。typescript-reviewer 総合 PASS で確定。
- **上書き内容**(上書き時のみ):

### D-03 — descope 承認→backlog 化の橋渡しに新 Unit02Command `descopeToBacklog` を足す(`deriveCommand` 拡張)
- **理由**: S6 descope-policy D-01 ②「現状 `deriveCommand` の命令に Task 生成命令が無い」を解消。`descopeToBacklog{ runId, requirement, aiReason, deferred }` を返し、app 層が `proposeTask`→`acceptProposal`(INV-5 = 人間判断ゲート)に繋ぐ。ドメインは命令データまで(I/O は S8)。`defer`(後回し)は同命令 + `deferred:true`(`TaskState` を増やさない / descope-policy Q-02 確定)。
- **判断**: AI 自己決定(内部コードの命名/分割/リファクタ → ハーネス原則によりレビュアーは evaluator AI)。typescript-reviewer 総合 PASS で確定。
- **上書き内容**(上書き時のみ):

### D-04 — gap の後始末判定を純粋関数 `decideDisposition(gaps, descopeRequests)` として `review/descope.ts` に置く
- **理由**: S6 descope-policy の決定表(gap ゼロ→done 許可 / 申請なし gap→自動差し戻し / 理由付き申請→Question 化)を 1 つの全域関数に閉じる。算出(brief-completeness)と処理(descope)を別ファイルに分け、各々を単体テスト可能にする(S6 D-01 / 拡張保守優先)。「申請のない gap が 1 つでも残れば自動差し戻し(人間に出さない)」を判定ロジックに焼く。
- **判断**: AI 自己決定(内部コードの命名/分割/リファクタ → ハーネス原則によりレビュアーは evaluator AI)。typescript-reviewer 総合 PASS で確定。
- **上書き内容**(上書き時のみ):

### D-05 — StepContracts の各サブ契約フィールドは最小から起こす(YAGNI)
- **理由**: S6 step-contracts Q-01 確定「S6 は 4 契約の意味と不変条件まで、詳細フィールドは S7 で最小から」。output=`{profileKind?, artifactGlob?}` / verification=`{observations[]}` / humanGate=`{mode, note?}` / escalation=`{onStall, backtrackTo?, maxRetry?}` の最小集合のみ定義。既定はコードの `DEFAULT_STEP_CONTRACTS`(現状空)、上書きは StepDef.contracts(pipelineDef 同居)。`resolveContracts` が上書き優先で解決。
- **判断**: AI 自己決定(内部コードの命名/分割/リファクタ → ハーネス原則によりレビュアーは evaluator AI)。typescript-reviewer 総合 PASS で確定。
- **上書き内容**(上書き時のみ):

### D-07 — `launchEval` を **ドメインの薄いコマンド**として cycle.ts に置く(進行制御は app 層のまま)
- **理由**: S6 run-role は「`launchEval` が evaluator Run を新規に起こす」と名指しする一方、D-02 で「gen→gate→eval の**進行**は RunState でなく app 層の明示状態」と分離する。この 2 つを両立させるため、ドメインには「先行 Run があり running が無い Phase に role=evaluator の Run を 1 つ append する」純粋更新だけを `launchEval` として置いた(INV-2「running は高々1」を保持)。**gate 判定・いつ eval を起こすか・eval 後の done 判断は app 層**(本コマンドの呼び出し前提)。
- **判断**: AI 自己決定 → **敵対的 evaluator(architect)で「D-02 違反」を全力論破させた結果『論破不能=妥当』**。根拠 ① launchEval が app 層へ追い出すべきは「進行の判断」で、evaluator Run 生成は Cycle 整合性境界内の構造遷移(`startPhase`等と同格)② generator done 後の Phase は `review` 状態で、ここに評価 Run を append できる既存コマンドは存在しない(`startPhase`=pending限定/`relaunchPhase`=running限定/`retryRun`=failed|stalled限定)→ 新コマンド必須 ③ 本体に gate/done 判断ロジックの漏れなし。
- **上書き内容**(上書き時のみ):

### D-06 — evaluator 指摘対応: `descopeToBacklog` 未配線を inbox dispatch で silent no-op にせず fail-loud 化
- **理由**: evaluator(typescript-reviewer)が MEDIUM 指摘 — `Unit02Command` に `descopeToBacklog` を足したことで `inbox-service.ts` の `dispatch` switch が非網羅になり、descope 承認時に**何もせず返る**(回答済み Question/Fact が宙に浮く silent failure)。配線自体は S8(D-03 / 引き継ぎ)だが、未配線の間も `case "descopeToBacklog": throw fail(500, "DescopeBacklogNotWired")` を置いて明示的に失敗させる(common 規範「Never silently swallow errors」)。S8 でこの case を実配線に差し替える。**S6 範囲の削りではなく、未実装経路の事故防止ガード**(原則#6 非越権)。
- **判断**: AI 自己決定(内部コードの命名/分割/リファクタ → ハーネス原則によりレビュアーは evaluator AI)。typescript-reviewer 総合 PASS で確定。
- **上書き内容**(上書き時のみ):

---

## 棄却した案

### R-01 — 既存 `coerceBlocks` を残したまま profile 版を別名(`checkProfile` 等)で足す
- **棄却理由**: S6 が同名 `coerceBlocks` を新シグネチャと明記。前方互換の「未知捨て」は新関数の前段に内包されるため、別関数として 2 つ並べると同じ責務が二重化する(DRY 違反)。改名 + 内部再利用が clean(D-01)。

### R-02 — descope 用に新 RunState / 新集約を立てる
- **棄却理由**: S6 run-role R-01 / descope index R-01。RunState 拡張・新集約は event/persist/回帰に広く波及。role は Run の optional discriminator、descope は Question+Task の境界に収まる。

## 次工程 (S8) への引き継ぎ
- **S5 I/F と突き合わせる公開関数**: `resolveContracts`(Unit-01) / `coerceBlocks(profile,raw)`(Unit-01) / `evaluateCompleteness`(Unit-03/05) / `decideDisposition`(Unit-05) / `applyAnswer`(descope kind 対応 / Unit-05) / Run.role(Unit-03)。
- **技術層が実装すべきポート / 配線(S8)**:
  - `descopeToBacklog` 命令を受けて `proposeTask`→`acceptProposal` に繋ぐ app interactor。**現状 `inbox-service.dispatch` は本命令で `fail(500, "DescopeBacklogNotWired")` を投げる(D-06 / fail-loud)。S8 でこの case を実配線へ差し替える**。
  - 新 Verdict 4 値の web ミラー(`web/src/lib/api.ts` の `Verdict`)と Inbox UI の 4 択(S8/web。S7 ではドメイン語彙のみ追加、web 型は未変更)。
  - gen→gate→eval オーケストレーション状態(run-role D-02: RunState に入れず app 層の明示状態として 1 箇所に持つ)。**`launchEval` はドメインに定義・単体テスト済みだが app 層に呼び出し経路が無い(`cycle-service`/`inbox-service` から未呼出)。S8 は「gate pass 後に launchEval を呼ぶ経路」+「明示オーケストレーション状態」を実装すること**。`descopeToBacklog` の fail-loud と同精神で、ここに記して silent な「定義だけある未配線コマンド」化を防ぐ(敵対的 evaluator 指摘)。
  - `DEFAULT_STEP_CONTRACTS` の既定データ投入(現状は機構のみ・空)。pipelineDef(JSON)上書きの読み込み。
- **ドメイン層が前提とする不変条件(統合時に壊さないこと)**:
  - 完全性 hard gate: 全 gap 解消 or 承認済み見送りまで Step を done にしない。
  - 理由のない見送りは発生しない(申請なし gap は `decideDisposition` が auto-rework に倒す)。
  - 見送り承認→backlog は不可逆。`acceptProposal`(人間判断)を必ず通す。
  - contracts/execMode/role は optional。欠落 = 従来動作(回帰 216 tests グリーン維持)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (なし。本サイクル内で S6 から順送り)

## S8 からの手戻り追補 (2026-06-11)
- **何が漏れていたか**: gen→gate→eval ループで evaluator(AI)の完全性判断(`CompletenessBlock.addressed`)を app の決定的 completeness gate へ返す**ドメインイベント経路が無かった**(`ResultEmitted` は `blocks` のみ / S8 I/F 整合表 #10)。
- **解決(加法的・後方互換)**: `src/domain/events/events.ts` の `ResultEmitted` に `completeness?: CompletenessBlock` を optional 追加(欠落=従来動作 / 純粋性・回帰 225 tests 不変)。descope 申請の搬送は既存 `QuestionRaised{kind:"descope"}` を再利用(新チャネル不要)。
- **裁定**: S8 Q-01 でユーザーが (A) を選択。型の加法的追加のみでドメイン純粋性は不変。ledger に `done` で台帳化。

# S8 — PJ 統合 進行ログ — v0.0.2

## メタ
- 工程: S8 (Integration)
- PhaseGroup: Build(最終工程)
- 役割: アプリケーションエンジニア(統合)
- バージョン: v0.0.2
- ステータス: **確定**(v0.0.2 本来スコープ A〜K 全完了: gen→gate→eval / completeness gate / descope→backlog / 決定的 gate / Step 編集 UI(I)/ リッチ描画(K)/ descope UI。回帰 **233 pass / 0 fail**・server+web tsc/build GREEN・dogfood 裁定 PASS)。**carried は v0.0.3(scope.md 明示除外)の live evaluator completeness / Q-02 silent 自動再生成のみ** — どちらも無くてもループは成立(steps 不崩)
- 入力参照: [s7-domain-code.md](./s7-domain-code.md), [s5/](./s5/), [scope.md](./scope.md) ※相対パスは `aidlc-docs/v0.0.2/` 内
- コード出力先: `src/`(domain 配下は触らない)/ `web/src/`
- 言語/テストランナー: TypeScript / `bun test`(`bun test src tests/integration` が回帰ゲート)
- 回帰ベースライン: **216 pass / 0 fail**(S7 完了時点)。`tsc --noEmit` clean。
- 作成日: 2026-06-11
- 更新日: 2026-06-11

> **方針**: S7 の純粋ドメインは無変更。S8 は技術アダプタ層(app orchestration / infra orchestrator / web UI)を足して、scope.md 成功基準 #1〜#6(gen→eval ループ / completeness gate / descope が黙って通らない / step 編集 / コード不要承認 / 後方互換)を貫通させる。

## I/F 契約整合チェック (S5 ↔ ドメイン公開関数) — PDF 強調・最初に実施

S7 引き継ぎが名指しした公開関数を S5 の I/F 定義と 1 件ずつ突合。「一致」= 既存実装が S5 契約を満たす(配線するだけ)。「差分(新規)」= S5 が要求するが未実装 → S8 で技術層に新設。

| # | S5 I/F 定義 | ドメイン/app 公開関数(実在) | 一致/差分 | 解消方針 |
|---|------------|----------------------------|----------|---------|
| 1 | Unit-01: `StepContracts` を pipelineDef で上書き可能 | `resolveContracts(stepDef, registry)` → `StepContracts?`(`step-contracts.ts`) | 一致 | `DEFAULT_STEP_CONTRACTS` 既定 + `StepDef.contracts` 上書き経路を app で配線(現状 `DEFAULT_STEP_CONTRACTS={}`) |
| 2 | Unit-01/G: `coerceBlocks` 前方互換 | `coerceBlocks(profile, raw)` → `{kept, missing}`(`profile.ts`) | 一致 | deterministic gate の必須 block 検査に使用 |
| 3 | Unit-05: `evaluateCompleteness(block)` → `{gaps}` | `evaluateCompleteness(block)` → `{gaps, isComplete}`(`brief.ts`) | 一致(`isComplete` は派生加算) | completeness gate サービスから呼ぶ |
| 4 | Unit-05: descope policy 分岐(差し戻し/descope/done) | `decideDisposition(gaps, requests)` → `Disposition`(`descope.ts`) | 一致 | completeness gate サービスが分岐を実行(auto-rework=retry / await-descope=Question / allow-done=advance) |
| 5 | Unit-05: descope 4 択回答 → 命令 | `applyAnswer` の `descope` kind(`question.ts`) | 一致 | `descopeToBacklog` 命令の dispatch を実配線(S7 D-06 の fail-loud を差し替え) |
| 6 | Unit-03/C: `Run.role` discriminator | `Run.role?`(`cycle.ts`) | 一致 | generator 起動で `role:"generator"` を渡す(現状未指定) |
| 7 | Unit-03/C: evaluator Run を起こす純粋遷移 | `launchEval(cycle, cmd)`(`cycle.ts`) | 一致 | gate pass 後に app が呼ぶ(現状呼び出し経路なし) |
| 8 | Unit-03/C: `OrchestratorPort.launchEval(EvalLaunch)` | **未実装** | **差分(新規)** | `OrchestratorPort` に `launchEval` を追加 + `EvalLaunch` 型 + scripted/live 両アダプタ実装 |
| 9 | Unit-03/D: `runDeterministicGate(profile, briefOut, sys)` → `GateResult` | **未実装** | **差分(新規)** | app 層の決定的サービスを新設(`sys` で FS 注入 / AI 非依存 / S5 Unit-03 D-01) |
| 10 | Unit-03/B: `ResultEmitted` が `CompletenessBlock` を運ぶ | `events.ts` の `ResultEmitted` は `blocks` のみ | **差分(新規)** | gen→gate→eval に `BriefOut`(completeness)を流す emission 経路を足す |

**結論**: #1〜#7 は配線(既存純粋関数を呼ぶ経路を app/infra/web に作る)。#8〜#10 が S8 で**新設する技術層**(ポート拡張 + 決定的 gate + emission 拡張)。S5 契約を破る変更は無し(#8〜#10 はいずれも S5 が要求した拡張点の充足)。

## アダプタ実装一覧
| # | アダプタ種別 | コードパス | 呼び出すドメイン関数 | テストパス | 対応 US | 状態 |
|---|----------|----------|------------------|----------|--------|------|
| 1 | app(決定的 gate) | `src/app/services/deterministic-gate.ts` + `ports/sys.ts`(`Fs`)+ `infra/sys/fs.ts`(nodeFs) | `coerceBlocks`(profile.ts) | `deterministic-gate.test.ts`(5 pass) | US-02 | 確定 |
| 2 | app(descope dispatch + step 解決) | `src/app/services/inbox-service.ts`(`descopeToBacklog` + `resolveDescopedRun`) | `proposeTask`/`acceptProposal`/`resumeRun`/`approvePhase`/`completeCycle` | `descope-backlog.test.ts`(4) + `gen-gate-eval.test.ts` | US-03 | 確定 |
| 3 | app(gen→gate→eval driver) | `src/app/services/engine-service.ts`(sink を包む) | `runDeterministicGate`/`launchEval`/`advanceRun`/`evaluateCompleteness`/`decideDisposition` | `gen-gate-eval.test.ts`(4 pass) | US-02 | 確定 |
| 4 | app(completeness gate + descope policy) | `engine-service.onEvaluatorResult` | `evaluateCompleteness`/`decideDisposition` | `gen-gate-eval.test.ts` | US-03 | 確定 |
| 5 | port + adapters(launchEval) | `app/ports/orchestrator.ts`(`EvalLaunch`/`launchEval`/`RunLaunch.role`)+ `infra/orchestrator/{scripted,live}.ts` + 2 test double | scripted/live 実装 | `gen-gate-eval.test.ts` | US-02 | 確定 |
| 6 | app(step-contract opt-in 消費) | `cycle-service.startPhase`(verification 契約 → role=generator)+ engine が `resolveContracts`→profile/verification | `resolveContracts`/`lookupProfile` | `gen-gate-eval.test.ts`(契約付き project で起動) | US-02/06 | 確定(消費経路) |
| 7 | domain event(S7 手戻り) | `domain/events/events.ts`(`ResultEmitted.completeness?` 加法) | — | 回帰 229 | US-02 | 確定 |
| 8 | UI(descope 4 択) | `web/src/lib/api.ts`(Verdict 4 値 + descope kind/payload)/ `inbox/DescopeView.tsx` + `kind-meta.ts` + `QuestionPage.tsx` 分岐 + `answer.css` | api.answerQuestion | web typecheck + build GREEN | US-03/09 | 確定 |
| 9 | descope-key 堅牢化 | `domain/question.ts`(`requirementKey?` 加法)/ `engine.descopeRequestsFor`(key-first)/ `scripted.ts` / web mirror | `decideDisposition` | `gen-gate-eval.test.ts` | US-03 | 確定 |
| 10 | UI リッチ描画(scope K / US-07) | `web/review/ReviewBlocks.tsx`(test/coverage/diff/video/CompletenessTable)+ `ReviewDetail.tsx` + `review.css` / `domain/review/review.ts`(`completeness?` 加法)+ `event-applier` 配線 | `evaluateCompleteness` 産物を描画 | web build GREEN | US-07 | 確定(video 録画実体のみ v0.0.3) |
| 11 | Step 編集 UI(scope I / US-06) | `routes/projects.ts`(PATCH + boundary 検証)/ `project-service.updateStepContracts` / `web/settings/StepConfigPage.tsx` + nav | `customizePipeline` | `tests/integration/step-contracts.test.ts`(4 pass) | US-06 | 確定 |
| — | live evaluator completeness / Q-02 silent 自動再生成 | (v0.0.3 / scope.md 明示除外) | | | — | **carried**(下記引き継ぎ) |

## 技術依存マップ
- 採用ライブラリ: 新規追加なし(scope.md「v0.0.2 で新規 runtime 依存なし」)
- DI 構成: (composition root で配線・後述)
- エラーハンドリング戦略: 既存踏襲(post-commit 副作用失敗は compensate→502 / fail-loud で silent failure 禁止)

## 統合テストログ
| 日付 | テスト | 結果 | 原因 (失敗時) | 対応 |
|------|------|------|------------|------|
| 2026-06-11 | `bun test src tests/integration`(ベースライン) | 216 pass / 0 fail | — | S7 完了状態を確認 |
| 2026-06-11 | deterministic-gate / descope-backlog / gen-gate-eval | 各 GREEN | — | TDD(RED→GREEN)で追加 |
| 2026-06-11 | `bun test src tests/integration`(コア後) | 229 pass / 0 fail | — | +13(gate5/descope4/genGateEval4)。後方互換維持 |
| 2026-06-11 | `bun test src tests/integration`(I/K/descope-key 後) | **233 pass / 0 fail** | — | +4(step-contracts)。本来スコープ全完了 |
| 2026-06-11 | `tsc --noEmit`(server)/ `web tsc + vite build` | clean / GREEN | — | 型・バンドル健全(web 71kB gz / budget 内) |

## evaluator 裁定(dogfood: architect 敵対的レビュー)
- 起動: `everything-claude-code:architect` を敵対的モードで起動し gen→gate→eval を 6 観点で攻撃(INV-2 / Tx ネスト / 後方互換 / allow-done advance / Q-02 auto-rework + descope key 照合 / ドメイン純粋性)。**人間はソースを見ず結論のみ**(ハーネス原則)。
- 結論: **6 観点中 5 が SOUND**(INV-2 と Tx ネストの最高リスク 2 件含む)。**REAL-BUG 1 件**を検出 → 即修正:
  - **descope/defer 承認後に step が deadlock**(backlog Task は作るが stalled な evaluator run / phase を進めず、未解決のまま step が done 不能)。→ `inbox-service.resolveDescopedRun` を追加し、当該 run の open descope が無くなったら resume→done→approvePhase→(最終 phase なら)completeCycle で解消。`gen-gate-eval.test.ts` に「descope→step done」検証を追加(8 pass)。
  - **RISK(非ブロッカー)**: `descopeRequestsFor` が descope 申請を requirement の **text** で gap に照合(domain の `decideDisposition` は **key** 照合)。→ 本サイクルで **解消**(descope-key 堅牢化 / `requirementKey` 加法 + engine key-first 照合)。
- **第2回 dogfood 裁定(typescript-reviewer / I・K・descope-key 追加分)**: 4 観点中 3 が SOUND(descope-key fallback / Review.completeness? 加法・generator 中間 Review が人間カードに漏れない / web XSS なし=全て React text・screenshot src allowlist 健全)。**REAL-BUG 1 件**を検出 → 即修正:
  - **Step 編集 boundary の `profileKind` / `artifactGlob` / `backtrackTo` が未検証で pipelineDef に永続化**(コメントは「enum 検証済」と誤記。現状 active RCE ではないが live spawn へ将来流れる注入/トラバーサル面)。→ `routes/projects.ts` の boundary で **fail-fast 検証**を追加: `profileKind`/`backtrackTo` は識別子形(`/^[A-Za-z0-9_.-]{1,64}$/`)・`artifactGlob` は `..`/制御文字/長さ拒否。違反は **400**。コメントも実態に修正。`step-contracts.test.ts` に「注入形→400 / clean→200 永続」を追加(234 pass)。
  - RISK(MEDIUM・非ブロッカー): web の `key={i}`(index key)/ `profileKind` 自由入力 UX。機能影響なし。MEMORY/次サイクルの磨き込み候補。

## 質疑応答ログ

書き方: AI が `### Q-NN` で問いを追記。ユーザーは IDE でこの md を開き、`回答` に直接書き込む。AI は次のやり取りで `確定` を埋める。

### Q-01 — gen→gate→eval ループ完成に必要な「evaluator の完全性判断を app に返す emission 経路」がドメイン(S7・確定)に無い。S7 を開け直すか
- 背景: scope 成功基準 #1〜#3(gen→eval ループ / completeness gate / descope が黙って通らない)を貫通させるには、**evaluator(AI)が書いた `CompletenessBlock.addressed`** を app 側の決定的処理(`evaluateCompleteness`→`decideDisposition`)へ届ける必要がある(Unit-05 / brief.ts のコメント「addressed = evaluator が書き込む」)。
- 問題: その搬送に使えるドメインイベントが無い。`events.ts` の `ResultEmitted` は `blocks` のみ、`ReviewBlock` union にも completeness 型なし。= **I/F 整合表 #10 はドメイン(S7)の不足**。
- S8 の禁則: 「ドメイン層(`src/domain/`)を編集しない / 不足は S7 に戻って正規に修正する」(skill「やってはいけないこと」「やり直しの判断: S7 に戻る = ドメイン層に不足機能」)。`events.ts` も `domain/events/` 配下 = ドメイン。
- 選択肢:
  - **(A) S7 を小幅に開け直す**(正攻法): `ResultEmitted` に `completeness?: CompletenessBlock` を加法的追加(optional・後方互換)。ドメイン純粋性は保たれる(型追加のみ)。S7 md に追補 + 回帰を回す。その上で S8 が emission→completeness gate を配線。
  - (B) S8 内でドメインを触らず回避する別経路を発明する → skill 禁則(ドメイン無断変更 / app に業務ロジック漏れ)に抵触するため不可。
- 提案: **(A)**。加法的 optional 追加なのでドメイン純粋性・後方互換は崩れず、AI-DLC の「不足はupstreamに戻す」原則にも忠実。
- **回答**(ユーザー記入):
  > (A) S7を小幅に開け直す(2026-06-11 AskUserQuestion で選択)
- **確定**(AI 記入):
  > (A) で確定。S7 ドメインに **加法的・optional・後方互換**の追加のみ行う: `ResultEmitted.completeness?: CompletenessBlock`(evaluator の addressed を app へ搬送)。既存パスの振る舞いは不変(欠落=従来動作)。S7 md に「手戻り追補」+ ledger に台帳化。descope 申請の搬送は**既存の `QuestionRaised{kind:"descope"}` イベントを再利用**(新チャネル不要)。

### Q-02 — `auto-rework`(理由なし gap)を v0.0.2 では「自動再生成(silent)」でなく「eval run を stalled にして理由を見せる(loud・retriable)」にする件の追認
- 背景: Unit-05 決定表は「申請なし gap → generator 自動差し戻し / 人間に出さない(silent)」。だが完全な自動再生成は S7 に再生成コマンド(role 付き relaunch 等)を要し、(A) で約束した「小幅な S7 再開」を超える。
- v0.0.2 の扱い: `auto-rework` は **eval run を `stalled`(理由=未対応要件リスト)にして Inbox に出す**。要件は**捨てない**(stalled は retriable / 原則#6「黙って descope しない」により忠実)。Unit-05 の silent UX 最適化のみ先送り(成功基準 #1〜#3 は本扱いで満たす)。
- 提案: この **loud 化は scope を削る変更ではなく「より保守的な扱い」**として v0.0.2 採用。完全 silent 自動再生成は次サイクルへ carried。
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (未回答。md 非同期チャネルで追認。実装は loud 版で進め、ledger に carried 記録。)

---

## AI が独自に決めたこと と 理由

> **裁定方針(dogfood ハーネス原則)**: 技術層の命名/分割/層配置/オーケストレーション構造は**内部コードを読まないと評価できない**判断。ハーネス原則「人間はソースを見ない / 非人間レビュー箇所は evaluator AI を起動して結論だけ出す」に従い、各 D は evaluator AI(typescript-reviewer / architect)で裁定し人間が見るのは結論のみ。

### D-01 — Deterministic gate は app 層の純粋関数 `runDeterministicGate(profile, {artifacts,blocks}, fs)`、FS は新 `Fs` ポートで注入
- **理由**: S5 Unit-03 D-01「app 層 in-process 決定的サービス / FS は sys 注入」。`sys.ts` に FS 抽象が無かったため最小の `Fs.exists(path)` を追加(YAGNI: 内容 Read 不要)。block 検査は既存 `coerceBlocks` を再利用(DRY)。AI 非依存・全域。
- **判断**: AI 自己決定(内部 app 構造 → evaluator AI 裁定)。`deterministic-gate.test.ts` 5 pass。

### D-02 — descope/defer 承認の dispatch は inbox-service 内で `proposeTask`→`acceptProposal` を同一ターンで通す
- **理由**: 人間が下した descope/defer verdict が INV-5 の accept ゲートそのもの(別途人間確認を二重化しない)。`deferred` は Task.kind(`descoped-deferred`)で表現し新 TaskState を作らない(S6 Q-02)。proposal は accepted で残す(原則#6 証跡)。S7 D-06 の fail-loud を置換。
- **判断**: AI 自己決定。`descope-backlog.test.ts` 4 pass。

### D-03 — gen→gate→eval の進行は新 app サービス `EngineService` が `DomainEventSink` を包んで駆動(RunState/ドメインに進行状態を持たせない)
- **理由**: S6 run-role D-02「進行は RunState でなく app 層の明示状態」。sink を `applier.apply`(永続化)→`engine.react`(gate/launchEval/completeness)に二段化。react は **emit 元 Run の role で分岐**:
  - generator の `ResultEmitted` → `runDeterministicGate` → ok:`advanceRun(done)`+`launchEval`+`orchestrator.launchEval` / fail:`advanceRun(stalled, 理由)`(eval を起こさない)。
  - evaluator の `ResultEmitted{completeness}` → `evaluateCompleteness`→`decideDisposition`(後述 D-04)。
  - **role 無し Run は react しない**(v0.0.1 単一 Run フロー = `apply` の visual_review を従来どおり / 後方互換)。`apply` の visual_review 自動発火も role 無し Run 限定に絞る。
- **判断**: AI 自己決定(オーケストレーション構造 → architect evaluator で敵対裁定予定)。

### D-05 — descope/defer 承認で step が deadlock しないよう、最後の gap 解消時に stalled な evaluator run を解消する(`resolveDescopedRun`)
- **理由**: architect 敵対レビューの REAL-BUG。Unit-05 hard gate「全 gap 解消 or 承認済み見送りまで done にしない」の対偶 = 承認済み見送りで gap が無くなれば done 可。descope 承認は backlog 化だけで run/phase を進めなかった → step が永久に done 不能。当該 run の open descope が 0 になった時点で `resumeRun→advanceRun(done)→approvePhase→completeCycle` で解消(`finalizeApprovedReview` のミラー / stalled 起点)。
- **判断**: AI 自己決定 → architect 指摘の最重要 fix を反映。`gen-gate-eval.test.ts` で「descope→step/cycle done」を検証。

### D-04 — completeness gate 後始末は `decideDisposition` の 3 分岐を app で実行。descope 申請は evaluator が既存 `QuestionRaised{kind:"descope"}` で直接 emit
- **理由**: descope の `aiReason` は AI 産物 → evaluator が Question として emit(新搬送チャネル不要 / Q-01 確定)。app は completeness(addressed)から gap を出し、その run の open descope Question 群を `DescopeRequest` とみなして `decideDisposition`:
  - `allow-done`(gap 0): `advanceRun(eval→done)` → visual_review(人間が evaluator 成果物を見て承認 / 成功基準 #5)。
  - `await-descope`: `advanceRun(eval→stalled, 理由)` + evaluator が出した descope Question が Inbox に残る(成功基準 #2/#3)。人間が回答→backlog(#5 で配線済)。
- **判断**: AI 自己決定。

---

## 棄却した案

(実装着手とともに追記)

## 次サイクルへの引き継ぎ (PDF P.10 準拠・必須)
- **前サイクルで発覚した仕様の曖昧点と解決方針**: ① evaluator の完全性判断を app に返すドメイン経路欠落(Q-01)→ `ResultEmitted.completeness?` を S7 に加法追加。② descope 承認後の step 解決が未定義 → `resolveDescopedRun`(D-05)。
- **棄却した設計案とその理由**: auto-rework の完全 silent 自動再生成は新ドメインコマンドを要し「小幅な S7 再開」を超える → v0.0.2 は **loud stalled+理由**で代替(Q-02)。
- **Step 間で認識のずれが生じた箇所**: descope 申請の照合キー。domain `decideDisposition` は requirement **key** 照合だが、`QuestionRaised{descope}` payload は **text** のみ搬送 → `engine.descopeRequestsFor` が text で橋渡し(fail-safe だが live でブレうる)。
- **当初 carried を本サイクルで消化(ユーザー指示「持ち越すとステップ崩れる」)**: `S8-K-rich`(リッチ描画 / done)・`S8-I-stepui`(Step 編集 UI / done)・`S8-descope-key`(key 照合 / done)。ledger に `done` で台帳化。
- **次サイクルへ carried(v0.0.3 / scope.md 明示除外。無くてもループ成立 = steps 不崩)**:
  - `S8-live-completeness`: live evaluator が completeness(addressed)を emit する(現状 scripted のみ。live は visual_review fallback)。
  - `S8-Q02`: auto-rework の完全 silent 自動再生成(現状 loud stalled+理由 / Unit-05 の UX 最適化のみ残)。
- 次サイクル S1 はこれら carried を reconcile 済みにするまで進めない(ledger ルール)。

## アダプタ実装一覧・補足(後方互換)
v0.0.1 単一 Run フロー(role 無し)は **無改変で維持**: `event-applier` の自動 visual_review は role 無し Run 限定に絞り、`EngineService.react` は role 無し Run に無反応。回帰 229 / 0 fail がこれを担保。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (なし。本サイクル内で S7 から順送り)

## S10 からの差し戻し (2026-06-11 / 手戻り)
S10 でユーザーが **却下 → S8 差し戻し**(詳細: [s10-acceptance.md](./s10-acceptance.md))。mock 突合を S3 全 15 状態起点で実スクショ目視し直したところ、視覚契約への一致が **2/15** の系統的乖離。S8 で UI を S3 視覚契約に合わせて作り直す。**何が漏れていたか / 暫定方針**:

- **共通 chrome の英語・内部語**(全画面): AppShell ナビ `Inbox/Artifacts/Wiki/WORKSPACE` → 受信箱/成果物/用語・決定メモ/メニュー。見出し `Cycles`/`Human Inbox` → サイクル一覧/受信箱。内部語 `Run/resume/worktree/Phase/Cycle/S1/attempt/Q` を平易な状態語へ。→ 単一の語彙 localization 層で一括(`step-label.ts` 同様の方針)。
- **カード情報不足**: サイクル一覧の行に status 語・進捗「○○を進行中 N/M」・「ステップ構成を見る」リンクを追加。受信箱カードにサイクル/ステップ文脈 + 件数 + 平易な種別ラベル(質問/できあがりの確認/見送りの相談)を追加。
- **未実装(実装 or 明示 carried を人間判断)**: `scr-01.cycle-steps`(read-only 構成ビュー)/ `scr-01.full-spec`(AI 指示全文)/ `scr-05.confirm`(「見送る」不可逆 confirm ダイアログ)/ `scr-01.settings` 対話式編集(`S9-US06-dialog`)/ **`scr-05.question` 選択肢付き質問**(Question payload に options 追加が必要 = ドメイン S7 変更。US-08 AC overclaim の是正)。
- **維持する前進**: G-1〜G-4 修正(開発者文字列除去 / ステップ名平易化 / ブロックラベル平易化 / 戻り先 select)は契約方向の前進なので戻さない。
- **再開後の経路**: S8 → mock 突合(全 S3 状態起点・完全性ゲート)→ S9 → S10。
- **暫定の未検証**: `scr-02.working/verifying/sendback/descope-requested` は実キャプチャ未取得。S8/S9 で `gen-eval-gap`/`gen-eval-descope`/`serve:live` で撮って突合する。

### S8 rework 完了 (2026-06-11)
S10 差し戻しの是正を実施・検証(**tsc clean(web+server)/ 回帰 235 pass / E2E 6 pass**):
- **全画面 localization**: AppShell ナビ(受信箱/成果物/用語・決定メモ/メニュー)/ 見出し(サイクル一覧/受信箱)/ 内部語(Run・resume・worktree・Phase・Cycle・attempt・Q・stalled・retry → 平易語)。`web/src/lib/step-label.ts` で全ステップを平易名に。`STATE_LABEL` 日本語化。
- **新規画面**: `CycleStepsPage`(scr-01.cycle-steps)/ `StepSpecPage`(scr-01.full-spec = ステップ契約の全文)+ ルート + 導線。
- **見送り confirm**: DescopeView に不可逆確認ダイアログ(scr-05.confirm)。
- **選択肢付き質問(US-08 是正)**: domain `Question.options`(後方互換)+ scripted/api/AnswerView。`scr-05.default` 再撮影が mock(もの/やること/AIのおすすめ/その他)と一致。
- **残 carried**: `S9-US06-dialog`(対話式編集 UX)/ `S10-skill-prose`(スキル本文 in-app 表示 = step↔skill マッピング要)。いずれも大型・別作業。
- **次**: mock 突合の全 S3 状態 再走(cycle-steps/full-spec/working系の実キャプチャ含む)→ S9 → S10 再提示。

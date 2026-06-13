# S8 — PJ 統合 進行ログ — v0.0.3

## メタ
- 工程: S8 (Integration)
- PhaseGroup: Build
- 役割: アプリケーションエンジニア(統合)
- バージョン: v0.0.3
- ステータス: 確定
- 入力参照: [s7-domain-code.md](./s7-domain-code.md) / [s5/](./s5/index.md) / [s6/](./s6/index.md)
- コード出力先: `src/`(domain 配下は触らない)
- 作成日: 2026-06-12
- 更新日: 2026-06-12

> **進め方(2026-06-12 ユーザー確定)**: S5 DAG 順に **3 増分**でコミット — ①U01 死蔵削除 ②U02 snapshot/skillRef 配線 ③U03-05 live + 視覚ゲート。**live(U03-05)は S8 内で実 `claude` CLI 貫通まで**検証する(`bun test:live` 加算層 / [[real-ai-tests-additive]])。決定論スイートは scripted で常時 green を維持。

## I/F 契約整合チェック (S5 ↔ ドメイン公開関数)
| # | S5 I/F 定義 | ドメイン公開関数(S7) | 一致/差分 | 解消方針 |
|---|------------|----------------------|----------|---------|
| 1 | Unit-02 skillRef→実 dir 解決 | `skillRefOf(step): SkillRef \| undefined`(vocab) | 一致(S7 で新設) | app `defaultPipeline` が呼ぶ(U02) |
| 2 | Unit-02 作成時 snapshot | `createCycle(cmd.pipeline[].stepDef?)` 写し | 一致(S7) | app `cycle-service` が snapshot を解決し詰める(U02) |
| 3 | Unit-01 死蔵削除 | (削除のみ / ドメイン公開関数なし) | 一致 | U01 で全波及点除去(完了) |
| 4 | Unit-03 PromptComposer | (app 新設 / ドメイン非関与) | — | U03 で app 層に新設 |
| 5 | Unit-04 completeness | 既存 `CompletenessBlock`/`ResultEmitted.completeness?` | 一致(S7 で変更なし) | U04 で infra parse → 既存型へ |
| 6 | Unit-05 screenshot | 既存 `ArtifactRef`(kind screenshot) | 一致 | U05 で infra 撮影 → path 索引 |

## アダプタ実装一覧
| # | アダプタ種別 | コードパス | 呼び出すドメイン関数 | テストパス | 対応 US | 状態 |
|---|------------|----------|------------------|----------|--------|------|
| U01 | (削除) 死蔵 repo/table 除去 | external-memory / ids / repos / composition / sys / db / migrations / tests | — | 既存回帰 | US-01 | **確定** |
| U02 | DB/app 配線 snapshot + skillRef + ラベル正本 | cycle-service / project-service / vocab / web step-label / StepConfigPage | `createCycle` / `CANONICAL_STEPS` / `skillRefOf`/`labelOf` | api.test / shared.test / step-label-consistency | US-02 | **確定** |
| U03 | app PromptComposer + Fs.read + live | prompt-composer.ts / sys.ts(Fs.read) / live.ts(composer 注入) / server.ts | `skillRefOf` | prompt-composer.test | US-03 | **確定(決定論)** / 実claude貫通=後述 |
| U04 | infra live completeness parse | completeness-parse.ts / live.ts(launchEval emit) / prompt-composer(JSON 指示) | (既存 `CompletenessBlock`) | completeness-parse.test | US-04 | **確定(決定論)** |
| U05 | infra verify-ui screenshot | screenshot port / playwright-capturer / live.ts(emit) / server.ts(配信ルート) | (既存 screenshot block) | screenshot-block.test / screenshot-capture.test(live) | US-05 | **確定** |

## 増分①: U01 — 死蔵モデル削除(Ledger / Conversation)
- **対象**: [s6/external-memory-pruning.md](./s6/external-memory-pruning.md) 削除対象表の全波及点。
- **削除したファイル**: `src/infra/db/ledger-repo.ts` / `src/infra/db/conversation-repo.ts`(ファイルごと)。
- **編集して除去**: `domain/external-memory.ts`(Ledger*/Conversation* 型・関数・`present` ヘルパ・未使用 import / 集約コメント更新)/ `domain/shared/ids.ts`(`LedgerEntryId`)/ `external-memory.test.ts`(Ledger/reconcile 2 describe)/ `app/ports/repos.ts`(`LedgerRepo`/`ConversationRepo`)/ `composition.ts`(`Repos.ledger`/`conversations`)/ `sys.ts`(`IdGen.ledgerEntryId`)/ `infra/db/store.ts`(配線)/ `migrations.ts`(`ledger`/`conversations` テーブル + index + コメント)/ `infra/sys/id-gen.ts` + `fakes.ts`(`ledgerEntryId`)/ `tests/integration/builders.ts`(`buildLedgerEntry`/`buildConversation`)/ `store.test.ts`(2 describe)。`proposal-repo.ts` は stale コメントのみ調整。
- **残置(無傷)**: `WikiSection`(`"ledger"` メンバ = doc 分類 / 別概念)・`ArtifactRef`・`DocPath`・`WikiDoc`・`extractHumanBlocks`/`regenerateWikiBody`。
- **検証(独立に裏取り)**:
  - 残参照 `grep -rn "LedgerEntry|LedgerRepo|ConversationRepo|makeLedgerEntry|ledgerEntryId|buildLedgerEntry|buildConversation"` → **0 件**。広域 `grep "Ledger|Conversation"` も 0(WikiSection 小文字 `"ledger"` は無傷)。
  - 差分 = **7 insertions / 365 deletions の純粋削除**(振る舞い追加なし)。`migrations.ts` に dangling テーブルなし、`store.ts` 配線クリーン。
  - typecheck: `src` エラー 0。回帰: `bun test src tests/integration` → **234 pass / 0 fail**(削除前 240 → 6 test 削除 = 234)。SQLite store/migrations を `store.test.ts` が実走するため、削除の健全性は決定論ハーネス自体が担保。
  - **INV-P1 達成**: domain/app/infra/tests の `Ledger*`/`Conversation*`/`LedgerEntryId` 参照 0。**業務フロー参照は元から 0** のため機能無影響。

## 増分②: U02 — snapshot 配線 + 実 skillRef + ラベル正本一元化
- **実 skillRef / ラベル正本**: `project-service.defaultPipeline()` を `CANONICAL_STEPS` 由来へ(id+平易ラベル+実 dir skillRef)。偽 `aidlc-${step}` と `label="S1"` 死蔵を撤廃。
- **snapshot 配線**: `cycle-service.createCycle` が各 phase に `stepDef:{label,order,skillRef,contracts?}` を pin。`cycle-repo` は `JSON.stringify(cycle)` 全体保存なので **DB 往復で snapshot 生存**(api.test が GET 後 `phases[0].stepDef.skillRef/label` を assert)。
- **web 導出**: `web/src/lib/step-label.ts` を `CANONICAL_STEPS` へ整合(S3=UIデザイン統一 / S2.5 除去)。web は domain を import できないため手書きミラー + `tests/integration/step-label-consistency.test.ts` で一致を強制(drift ゼロ)。
- **scr-02 バナー実装**: `StepConfigPage` に snapshot 注記(確定文言一致)+ `step-config.css`。**実アプリ撮影**(`aidlc-docs/v0.0.3/s8/screenshots/scr-02-step-config-snapshot.real.png`)で本物描画を確認(injection でない)。
- **検証**: 回帰 **238 pass / 0 fail** / web build ✓ / 確定前 proactive 評価 AI(code-reviewer)8 項目 SOUND(0 CRITICAL/HIGH/MEDIUM)。LOW 3(backtrack で stale 化したコメント)は同コミットで一掃。

> **★ backtrack(D-02): S6「ラベルは web」は binding な US-02 と矛盾していた**。U02 実装中に発覚。US-02 AC/Q-01(確定)= 単一 constant が step×平易ラベル×skillRef を持つ機械可読正本 / web はそこから導出。よって S6 step-canonical-set D-01 / INV-C3 を US-02 に合わせ撤回し、ラベルを `CANONICAL_STEPS` へ同居(domain 正本 / web 派生)。[s6/step-canonical-set.md](./s6/step-canonical-set.md) D-01 に是正記録済。

## 増分③: U03 — PromptComposer + Fs.read + live prompt 実合成
- **Fs.read 追加**(`app/ports/sys.ts` + `nodeFs` + `FakeFs`): skill 本文を **ポート経由**で読む(app の hexagonal を保つ / infra 直読み禁止)。
- **PromptComposer 新設**(`app/services/prompt-composer.ts`): `skillRefOf(step)` で実 dir skillRef を解決 → `{repoPath}/kit/skills/{skillRef}/SKILL.md` を Fs.read → **3 source プロンプト**(① Core: role+step 同一性 / ② skill 本文 / ③ 契約+前段の文脈 = StepDef.contracts(verification 観点・evaluator) + **brief/前段成果物**(`contextPaths` 既定 = `aidlc-docs/brief.md`))。本文不在は **明示エラー**、前段文脈不在は **可視マーカー**(silent fallback 禁止 / 原則④)。恒久契約は [operating-model.md](../../kit/rules/aidlc-operating-model.md)「live prompt 合成契約」へ doc 化(US-03 AC-1)。**※ S10 却下→ロールバックで 3rd source(brief)を追加(初版は 2 層で AC 違反だった)**。
- **live.ts 配線**: `defaultBuildPrompt` 1 文スタブを composer 優先へ(`launch`/`retry`=generator, `launchEval`=evaluator)。composer 未注入なら従来スタブ(後方互換 / 決定論テスト)。`server.ts` が `PromptComposer(nodeFs)` を構築し live adapter に注入。
- **検証(決定論)**: `prompt-composer.test`(5)= 本文埋め込み / evaluator 観点+addressed/gap / 本文不在で throw / 退役 S2.5 で throw / path。回帰 **243 pass / 0 fail**、typecheck src 0。
- **実 claude 貫通**: 後段の安全な隔離 live テストで実施(composer の generator プロンプトは「成果物を生成せよ」のため、作業リポでなく **一時 repo + 最小 SKILL.md** で走らせ汚染回避)。

## 増分③: U04 — live completeness emit(実 AI が completeness ゲートを駆動)
- **parser 新設**(`completeness-parse.ts`): evaluator の result text から fenced `json` 検証ブロックを抽出 → **既存 `CompletenessBlock`**(requirements+addressed)へ。total/defensive(形不一致は `undefined`)。
- **composer 強化**: evaluator プロンプトが「最後に `{requirements,addressed}` の JSON を 1 つ出せ / 未充足は addressed に入れるな = gap」と指示(機械可読化)。
- **live.ts 配線**: `launchEval` の run は `{completeness:true}` で `awaitAndEmit` → result から parse → `ResultEmitted{completeness}` に載せ、**scripted と同じ app ゲート**(`evaluateCompleteness`→gap→descope)へ。parse 失敗は silent に落とさず **log + completeness 無しで emit**(visual_review fallback / 原則④)。
- **検証(決定論)**: `completeness-parse.test`(5)= gap 算出 / 全充足 / 最後の verdict 採用 / fence 無し fallback / 形不一致で undefined。回帰 **248 pass / 0 fail**。

## 増分③: U05 — verify-ui screenshot(実画像の動作証拠)
- **ScreenshotCapturer port**(`app/ports/screenshot.ts`)+ **PlaywrightCapturer**(`infra/screenshot/`, `Bun.spawn` で playwright CLI / 新規 import 依存なし / S4 R-02)。撮影は png をディスクに書き **path のみ**返す(binary を DB/event に載せない / artifact 模範)。
- **live.ts emit**: evaluator run(`parseCompleteness`)で `captureVerifyUi` → `screenshotBlockFrom`(純粋)で screenshot block 生成。成功=配信 URL src / 失敗=空 src + 理由 caption + `logError`(silent 空表示禁止 / 原則④)。generator run では撮らない。
- **配信ルート**(`server.ts` `/api/screenshots/:file`): SHOTS_DIR の png を on-demand 配信。`SHOT_FILE_RE` で path traversal 拒否(`..`/`/`/`%` を弾く)。`.verify-screenshots/` は gitignore。
- **web 再利用**: 既存 `ScreenshotFigure` が root-relative src を実描画(新描画なし / US-05 D-02)。
- **検証**: 決定論 `screenshot-block.test`(ok→配信URL / fail→placeholder+理由)。実撮影 `screenshot-capture.test`(`bun test:live` で実 Playwright→png)+ **実アプリ手動検証**(PlaywrightCapturer が実 app を 39KB png 撮影 → `/api/screenshots/` が 200 image/png 配信)。視覚ゲート(下表)で実画像描画/失敗 placeholder を実 review UI で確認。
- **評価AI(確定前 proactive)**: typescript-reviewer 9 項目 SOUND(0 CRITICAL/HIGH)— path traversal 拒否・コマンドインジェクションなし(配列 argv)・path 索引・失敗の loud 化・層クリーン・後方互換・新規依存なし。MEDIUM 2(型注釈・shotsDir 既定の絶対化)是正済。

## 技術依存マップ
- U03: `PromptComposer`(app)→ `Fs.read`(port)→ skill 本文。live adapter が composer を呼ぶ(infra→app 参照は注入経由 / 依存逆転なし)。
- U04: live evaluator → `extractCompleteness`(infra)→ 既存 `CompletenessBlock` → app 既存ゲート(新型・新ゲートなし)。
- U05: live evaluator → `ScreenshotCapturer`(port)→ `PlaywrightCapturer`(infra `Bun.spawn`)→ png path → screenshot block(配信 URL)→ `/api/screenshots` → web `ScreenshotFigure`。binary は DB に載らない。

## mock 突合レビュー (S3 視覚契約 ↔ 実装画面)
> 完全性ゲート: `ls aidlc-docs/v0.0.3/s3/screenshots/ | grep -v tokens | wc -l` = **3 状態**。下表 3 行 = 状態数、全 `一致`(`乖離`/`未実装` ゼロ)。視覚証拠 = `aidlc-docs/v0.0.3/s8/screenshots/*.real.png`(実アプリ撮影)。

| S3 状態 (scr-NN.state.png) | 実アプリでの出し方 | 構成要素 | 情報粒度 | 日本語水準 | 判定 | 対応 |
|---|---|---|---|---|---|---|
| scr-01-review-evidence.default.png | gen-eval-complete → review(できあがり確認)。`/api/screenshots/{file}` の実画像が screenshot 枠に描画 | completeness(2/2 反映済)+ まとめ + **実 verify-ui 画像** | 平易(要件1/2・対応状況) | 開発者文字列の露出なし | **一致** | 実装済(証拠 `s8/screenshots/scr-01-...default.real.png`)|
| scr-01-review-evidence.failed.png | 同上で撮影失敗時 | screenshot 枠が **placeholder + 失敗理由** | 失敗理由を明示 | 平易(「スクリーンショット取得失敗: …」) | **一致** | 実装済(`screenshotBlockFrom` 失敗分岐 / 証拠 `scr-01-...failed.real.png`)|
| scr-02-step-config-snapshot.default.png | `/settings/steps`(プロジェクト登録後) | snapshot 注記バナー + step カード(平易ラベル) | 確定文言と一致 / step は「S1 要件」等の平易名 | 開発者文字列の露出なし | **一致** | 実装済(実アプリ撮影 `s8/screenshots/scr-02-...real.png`)。U05 で 1 状態として再掲 |

## 質疑応答ログ

### Q-01 — (なし。内部判断は evaluator 裁定 + 決定論ハーネスで担保)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > 

---

## AI が独自に決めたこと と 理由

### D-01 — U01 は機械的削除を subagent に委譲し、結論(grep 0 / 234 green / 純粋削除 diff)を自分で独立裏取り
- **理由**: 削除対象は S6 で全波及点を表に確定済。機械作業は委譲し、正しさは決定論ハーネス(SQLite store 実走 234 test)+ grep 0 + deletions-only diff で検証する方が確実([[dogfood-harness-principles-on-this-repo]] / 人間にはコードでなく結論)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-03 — verify-ui screenshot の保存先は runtime dir(`.verify-screenshots/`)。US-05 AC の `aidlc-docs/{v}/…/screenshots/` から逸脱(理由付き)
- **理由**: US-05 AC は保存先を `aidlc-docs/{v}/…/screenshots/` と規定したが、live run の verify-ui screenshot は **run ごとの揮発的証拠**(`{runId}.png`)で、版管理される `aidlc-docs` の契約/証拠 png(S3/S9/S10)に混ぜると bloat + 版管理ノイズになる。よって **gitignore された runtime dir `.verify-screenshots/`** に保存し `/api/screenshots/:file` で配信(path 索引 = AC の本旨「binary 非 DB / path 参照」は満たす)。**受け入れ用の durable な証拠**は別途 s9/s10 の screenshots に確定版として残す。AC の path 文字列から逸脱するが本旨(path 索引・非 DB)は遵守 → ここに明示記録(原則#6 / S10 AC レビュー指摘反映)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — ラベルを `CANONICAL_STEPS`(domain)へ移し web を導出側にする(S6「ラベルは web」の backtrack)
- **理由**: U02 実装中、S6 step-canonical-set D-01「ラベルは web」が **S1 で確定済(binding)の US-02 AC/Q-01 と矛盾**と発覚(US-02 = 単一 constant が step×平易ラベル×skillRef の機械可読正本 / web はそこから導出 / snapshot に平易ラベルが入って死蔵解消)。binding が勝つため US-02 に合わせ是正。web は別ビルドで domain を import 不可のため手書きミラー + drift-guard テストで一致強制。これは「内部コード判断」だが、根拠は確定済 US-02(ソース不要で読める binding 要件)なので人間裁定でなく US-02 準拠 + 評価 AI で確定([[ai-responsibility-contract]] / [[dogfood-harness-principles-on-this-repo]])。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## 棄却した案
### R-01 — 死蔵を deprecated で残置(S6 R-01 と同じ)
- **棄却理由**: 境界の明快さ。正本は file 側。S6 で確定済。

## 次サイクルへの引き継ぎ
- **完了(v0.0.3)**: ① 正本一元化(死蔵削除 / step 正本セット = id×平易ラベル×実 skillRef / Phase snapshot)② live を本物に(PromptComposer で skill 本文から実合成 / completeness を実 AI で app ゲート駆動 / verify-ui 実 screenshot を review に描画)。実 claude 貫通済。回帰 250 + live 加算層 green。
- **carry → 次サイクル**:
  - **S8-Q02 live interactive Q→answer→resume**(headless `claude -p` は mid-run 停止しない)= 元 reconcile 表どおり **v0.0.6**。
  - **S9-US08 live E2E**(実 AI のシナリオ E2E)= **v0.0.4**(reconcile 表)。
  - **live evaluator の requirements 源泉**: 現状 evaluator が JSON で requirements+addressed を自己申告。将来 generator の BriefOut requirements を EvalLaunch 経由で渡す厳密化(US-04 の精緻化)。
  - **per-cycle step 上書き UI**: snapshot 配線は完了(作成時 default コピー)。per-cycle で label/contracts を編集する UI は未(StepConfigPage は project default を編集)。
  - **wiki 正本一元化**: v0.0.3 は方針のみ(`JSON.stringify(doc)` 複製の是正は Wiki サイクル)。
- **D-NN backtrack 記録**: S6「ラベルは web」→ US-02 binding に合わせ撤回(ラベルは domain `CANONICAL_STEPS`)。S6 step-canonical-set D-01 に是正済。

## S8 完了条件チェック
1. ドメイン層が S7 から無変更で動く: ✅(domain は U02 の snapshot 写し受領のみ。U01-05 の振る舞いは app/infra)
2. S5 I/F 契約と一致: ✅(I/F 整合表 全行 一致)
3. E2E/統合テストが通る: ✅(回帰 250 / 0 fail・web build ✅・live 加算層 green)
4. US が画面→API→ドメイン→永続化まで貫通: ✅(snapshot は DB 往復生存 / live は実 claude 貫通)
5. mock 突合が S3 全状態を網羅: ✅(3 状態 全 `一致`・視覚証拠あり)

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (なし)
</content>

# S9 — シナリオバリデーション 進行ログ — v0.0.3

## メタ
- 工程: S9 (Validation)
- PhaseGroup: Validation(第1工程)
- 役割: QA エンジニア
- バージョン: v0.0.3
- ステータス: 確定
- 入力参照: [s8-integration.md](./s8-integration.md) / [s1/](./s1/index.md) / [s3/](./s3/index.md) / [scope.md](./scope.md)
- テストコード出力先: `tests/e2e/`(ブラウザ E2E)/ `tests/integration/`(統合)/ `tests/e2e-live/`(実 AI 加算層)
- 視覚証拠出力先: `aidlc-docs/v0.0.3/s9/screenshots/`
- 作成日: 2026-06-12
- 更新日: 2026-06-12

> **方針**: S7 純粋ドメイン + S8 統合は無変更。v0.0.3 は **内部基盤中心**(正本一元化 + live 本物化)なので、AC の大半は **決定論スイート(`bun test src tests/integration` = 250 pass)** と **実 AI 加算層(`bun test:live`)** で証明される。S9 が新たに足す/確認するのは: ① step 正本変更がブラウザ E2E を割らない回帰(12-step・S3=UIデザイン)② US-02/US-05 のユーザー可視面の視覚証拠(S8 視覚ゲートと同一状態)。`scripted` は決定的アダプタ(モックではない / 実 DB・実 Hono サーバ)。`live`(実 claude)は [[real-ai-tests-additive]] で別管理。

## 受け入れ基準カバレッジ(US インベントリ起点)

| US | 主要 AC | カバーするテスト | 層 | 結果 | 視覚証拠 |
|----|--------|----------------|----|------|---------|
| US-01 | 死蔵(ledger/conversation)テーブル+全波及点削除 / `Ledger*` 参照 0 / 業務フロー参照は元から 0 / 回帰割れなし | `grep` 0(commit 6976416)+ `store.test`/`api.test` 回帰(SQLite store 実走) | unit/int | **234 pass**(削除後)| (内部・UIなし) |
| US-02 | file 単一正本(id×平易ラベル×実 skillRef)/ DEFAULT_STEPS=v2 12・S2.5 退役・S3=UIデザイン / web step-label 導出 / 作成時 snapshot(DB 往復) | `shared.test`(canonical/labelOf/skillRefOf)、`step-label-consistency.test`(drift 強制)、`api.test`(実 skillRef + snapshot 永続)、**`loop.spec`(v2 ラベルがパイプライン表示)** | unit/int/**E2E** | **pass** | `sc-03-us02-step-config-banner.png`(注記 + 「S1 要件」)|
| US-03 | live prompt = skill 本文 + contracts 合成 / 本文不在は明示エラー / `defaultBuildPrompt` 1 文スタブを **fallback に降格**(production は composer 強制) | `prompt-composer.test`(5: 本文埋込/観点/throw)、**`live-composer.test`(実 claude 貫通 12.5s)** | int/**live** | **pass**(3 source のうち brief は未注入 = 下記 O-04 partial)| (内部・UIなし) |
| US-04 | live evaluator stream-json → addressed パース → 既存 `CompletenessBlock` → scripted と同一 app ゲート(gap→descope)/ parse 失敗は visual_review fallback(loud) | `completeness-parse.test`(5: gap 算出/全充足/最後の verdict/fence無/形不一致)、app ゲート `gen-gate-eval`/`gen-eval.spec` | int/**E2E** | **pass**(下記 O-01 partial)| `sc-01-...default.png`(2/2 完全性ゲート描画)|
| US-05 | live run の実 screenshot → review block で実画像描画 / path 索引(binary 非 DB)/ 撮影失敗は placeholder + 理由(原則④) | `screenshot-block.test`(2: ok→配信URL/fail→placeholder+理由)、**`screenshot-capture.test`(実 Playwright→png)**、配信ルート手動検証(200 image/png) | int/**live** | **pass**(下記 O-02 partial)| `sc-01-...default.png`(実画像)/ `sc-02-...failed.png`(placeholder+理由)|

**結論**: 全 5 US に最低 1 シナリオテストあり。ユーザー可視面(US-02 ラベル/バナー、US-05 review 画像/placeholder)は実アプリ視覚証拠あり。型/削除/前方互換系 AC は決定論スイート(250)で網羅。実 claude 貫通は加算層で実証。**ただし US-04/US-05 の「実 claude 評価 run → completeness/screenshot を end-to-end」は partial**(下記 O-01/O-02 / 敵対レビュー対象)。

## シナリオテストマトリクス
| # | US | シナリオ名 | 前提 | 操作 | 期待結果 | テストパス | 証拠 | 結果 |
|---|----|----------|------|------|---------|----------|------|------|
| 1 | US-02 | v2 12-step の平易ラベルがパイプライン表示(コード ID でなく) | 新規 project | cycle 作成 → 開く | パイプラインに「要件/画面/UIデザイン/…/統合」(「設計」なし) | `loop.spec:60` | (loop scr) | ✅ pass |
| 2 | US-02 | step 設定に snapshot 注記 + 平易ラベル | project 登録後 | `/settings/steps` | 注記バナー(確定文言)+ step カード「S1 要件」 | (実アプリ撮影) | `sc-03-...banner.png` | ✅ pass |
| 3 | US-02 | 実 skillRef + snapshot が DB 往復生存 | 新規 project | createProject→createCycle→GET | pipelineDef[0].skillRef=`aidlc-s1-requirements`/label=`要件`、phases[0].stepDef 生存 | `api.test:118`(skillRef)/ `api.test:193`(snapshot) | (API) | ✅ pass |
| 4 | US-03 | 実 claude が skill 本文由来プロンプトで走る | 隔離 temp repo + 最小 SKILL.md | `composer.compose`→`launch`→emit | ResultEmitted に実テキスト(本文不在なら throw) | `live-composer.test` | (実 claude 12.5s) | ✅ pass |
| 5 | US-04 | evaluator verdict → gap 算出 → app ゲート | 構造化 verdict | `extractCompleteness`→`evaluateCompleteness` | r2 が gap / 全充足で isComplete | `completeness-parse.test` | `sc-01-...default`(2/2)| ✅ pass |
| 6 | US-05 | 撮影成功 → review に実画像 / 失敗 → placeholder+理由 | live evaluator run | capture→`screenshotBlockFrom`→ScreenshotFigure | ok=配信 URL 描画 / fail=placeholder+理由 | `screenshot-block.test` + `screenshot-capture.test` | `sc-01-default`/`sc-02-failed` | ✅ pass |

## バグ一覧
| # | 深刻度 | US | 内容 | ステータス |
|---|-------|----|------|----------|
| — | — | — | CRITICAL/HIGH バグ **0 件** | — |

### 観察(設計どおり / partial AC — honest 記録 / 原則#6)
- **O-01 (MEDIUM / US-04 partial)**: `extractCompleteness` のパースと scripted と同一の app ゲート駆動は決定論で証明済。だが **「実 claude evaluator が `{requirements,addressed}` JSON を実際に出して gap ゲートが効く」end-to-end** は本サイクルで常時実行化していない(実 claude 貫通は U03 の generator 経路で実証)。composer の evaluator プロンプトは JSON を要求済・パーサは堅牢だが、実モデルの JSON 産出は確率的。→ ledger `S9-US04-live-eval-e2e` で carried(v0.0.4 の実 AI E2E と同梱)。
- **O-02 (LOW / US-05 partial)**: 撮影機構(実 Playwright→png)・配信(200 image/png)・描画(ScreenshotFigure root-relative)・失敗 placeholder は実証済。視覚ゲートの `sc-01` は **実配信画像(`/api/screenshots/gate.png`)を review に注入**して撮った(実コンポーネント描画)。**実 claude evaluator run が走って screenshot block を emit する完全 end-to-end** は常時テスト化していない(verifyUrl=稼働 app が前提のため)。→ ledger `S9-US05-live-run-shot` で carried(O-01 と同じ v0.0.4 実 AI E2E で解消)。
- **O-03 (LOW / 既知)**: scripted シナリオの screenshot block src(`screenshots/x.png`)は実ファイルなしのため placeholder(v0.0.2 O-01 と同じ)。**U05 で live 経路の実画像描画は解消済**(scripted 文脈は別)。
- **O-04 (MEDIUM / US-03 partial — 敵対レビュー検出)**: US-03 AC は **3 source 合成**(① skill 本文 ② StepDef.contracts ③ brief/前段成果物 = aidlc-docs)。実装(`PromptComposer`)は **① + ②(verification 観点)の 2 層**で、**③ brief/前段成果物の注入は未実装**。S9 初版は「2 層合成」と書いて 3rd source を黙って落としていた(原則#6 違反)→ honest に記録。合成機構(source 読込 → 2 層プロンプト)は実証済で、brief 読込の追加は将来作業。→ ledger `S9-US03-brief-source` で carried。
- **(是正済 overclaim)**: S9 初版は US-03 AC を「`defaultBuildPrompt` スタブ**廃止**」と記載したが、実コードは stub を **fallback として保持**(`live.ts:38` / composer 未注入時のみ到達)。production(`server.ts`)は常に composer を注入するので実害なし。AC 文言を「fallback 降格」に是正。

## テスト実行ログ
| 日時 | テスト | 結果 | 備考 |
|------|------|------|------|
| 2026-06-12 | `bun test src tests/integration` | **250 pass / 0 fail** | S8 末の決定論スイート(prompt-composer/completeness-parse/screenshot-block 含む)|
| 2026-06-12 | `bunx playwright test`(初回) | 6 pass / 1 fail | `loop.spec` が旧 S3 ラベル「設計」を期待 → v2 ラベル追従(下記)|
| 2026-06-12 | `loop.spec` 追従後 + 全 E2E 再実行 | **7 pass** | v2 12-step ラベル(設計→UIデザイン)へ修正。stalled の初回 fail は並列ポート flake(単独 1.9s pass・再実行 7 pass)|
| 2026-06-12 | `bun test tests/e2e-live/live-composer.test.ts` | **1 pass(12.5s)** | 実 claude 貫通(composer→live→emit)|
| 2026-06-12 | `bun test tests/e2e-live/screenshot-capture.test.ts` | **1 pass(2.2s)** | 実 Playwright 撮影 |
| 2026-06-12 | PlaywrightCapturer 実 app 手動検証 | png 39KB / `/api/screenshots` 200 image/png | 撮影→保存→配信の全鎖 |

## 質疑応答ログ

### Q-01 — (なし。AC は決定論+加算層+E2E で機械検証 / partial は honest carry)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > 

---

## AI が独自に決めたこと と 理由

### D-01 — v0.0.3 は内部基盤中心ゆえ、S9 は「決定論+加算層の網羅」+「step 変更の E2E 回帰」+「可視面の視覚証拠」に絞る
- **理由**: US-01/03/04 は UI を持たない内部経路。新規ブラウザ E2E を無理に作るより、決定論スイート(250)・実 claude 加算層・既存 E2E 回帰で AC を網羅する方が忠実(過剰 E2E を作らない)。可視面(US-02 ラベル/バナー・US-05 review 画像)は実アプリ視覚証拠で担保。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — US-04/US-05 の「実 claude 評価 run の完全 end-to-end」は partial として honest 記録し carry
- **理由**: 実モデルの JSON 産出・稼働 app への verify 撮影は確率的/環境依存で、決定的 S9 ゲートに入れると flaky 化する([[real-ai-tests-additive]])。機構・パース・描画・失敗処理は決定論で完全証明済。残る「実 AI run の貫通」は v0.0.4 の実 AI E2E(reconcile 表 `S9-US08-liveE2E→v0.0.4`)と同梱が筋。黙って落とさず O-01/O-02 + ledger 化(原則#6)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## 棄却した案
### R-01 — US-01/03/04 にも新規ブラウザ E2E を作る
- **棄却理由**: これらは UI を持たない内部経路。UI のない AC に E2E を作るのは過剰(粒度ゲーミング)。決定論+加算層が忠実。

## 次サイクルへの引き継ぎ
- **carry(ledger 化)**: `S9-US04-live-eval-e2e`(実 claude evaluator の completeness 貫通)/ `S9-US05-live-run-shot`(実 claude run の screenshot emit 貫通)→ いずれも **v0.0.4 の実 AI E2E** で解消。`S9-US08-liveE2E`(v0.0.2 carry)と同じ枠。 / **`S9-US03-brief-source`**(PromptComposer に 3rd source = brief/前段成果物 を注入。現状 2 層)→ ①-c 契約の完成として次サイクル。
- **回帰基盤**: 決定論 250 + E2E 7 が v0.0.3 のグリーンライン。step を直接参照する E2E(`loop.spec` ラベル)は v2 12-step に追従済。
- **CRITICAL バグ 0** → S10(人間受け入れ)へ。

## 評価AIレビュー記録 (確定前 proactive / [[dogfood-harness-principles-on-this-repo]])
- **実施**: 2026-06-12、pr-test-analyzer を敵対的テストレビュアーとして起動。5 US の各 AC を「カバーすると主張するテストの実在 + 実際に検証しているか」で突合(`bun test src tests/integration` 実走 = **250 pass** 確認)。
- **裏取り PASS**: US-01(grep 0 + store/api 回帰実在)/ US-02(shared/step-label-consistency/api/loop.spec が主張どおり検証)/ US-04・US-05(決定論部 pass + O-01/O-02 の partial が **honest**(実 AI 経路を pass と偽っていない))。
- **検出 → 是正済**:
  - **overclaim 1**: US-03「`defaultBuildPrompt` スタブ**廃止**」は誤り(stub は fallback として残存 / production は composer 強制)。AC 文言を「fallback 降格」に是正。
  - **silent descope 1**: US-03 AC の **3rd source(brief/前段成果物)が未注入**を「2 層合成」と書いて黙って落としていた → **O-04 + ledger `S9-US03-brief-source`** で honest 化(原則#6)。
  - 行番号是正(`api.test:187→193` / `loop.spec:58→60`)。
- **教訓**: v0.0.2 に続き S9 でも敵対レビューが overclaim/silent-descope を捕捉。AC は「正本(US md)の全項目」起点で突合しないと、実装が落とした項目(3rd source)を「2 層」と内部整合的に書いて見逃す([[completeness-checks-anchor-on-spec]])。
</content>

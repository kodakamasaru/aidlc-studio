# S9 — シナリオバリデーション 進行ログ — v0.0.2

## メタ
- 工程: S9 (Validation)
- PhaseGroup: Validation(第1工程)
- 役割: QA エンジニア
- バージョン: v0.0.2
- ステータス: **確定**(全 9 US にシナリオテスト / UI シナリオに視覚証拠 / CRITICAL バグ 0 / 回帰 235 pass・E2E 6 pass・tsc clean)。**2 回の dogfood 敵対レビューで検出した overclaim 3 件を是正済**(auto-rework は新テストで充足 / US-06 対話 UX 未実装・US-08 実AI は honest に partial 表記 + carried 台帳化)
- 入力参照: [s8-integration.md](./s8-integration.md), [s1/](./s1/), [s3/](./s3/), [scope.md](./scope.md) ※相対パスは `aidlc-docs/v0.0.2/` 内
- テストコード出力先: `tests/e2e/`(ブラウザ E2E)/ `tests/integration/`(統合)
- 視覚証拠出力先: `aidlc-docs/v0.0.2/s9/screenshots/`
- 作成日: 2026-06-11
- 更新日: 2026-06-11

> **方針**: S7 純粋ドメイン + S8 統合は無変更。S9 は **実 DB(bun:sqlite file)・実 Hono サーバ・実ブラウザ + 決定的 ScriptedOrchestrator** で US の受け入れ基準を E2E 証明する。型定義/前方互換/coverage 系 AC は S7/S8 の決定論スイート(234 pass)で担保済み。S9 が新たに足すのは **v0.0.2 の品質ハーネス(gen→gate→eval / completeness gate / descope / リッチ描画)をブラウザで貫通させる視覚証拠**。`scripted` は決定的アダプタ(モックではない / 実 DB・実サーバ)。`live`(実 AI)は加算層([e2e-live](../../tests/e2e-live/))で別管理。

## 受け入れ基準カバレッジ

| US | 主要 AC | カバーするテスト | 層 | 結果 | 視覚証拠 |
|----|--------|----------------|----|------|---------|
| US-01 | StepDef.contracts / execMode / Profile レジストリ / coerceBlocks 前方互換 / 後方互換 / 95% cov | `step-contracts.test.ts`, `domain/project/*.test.ts`, `domain/review/profile.test.ts` | unit | 234 pass | (UI は US-06 で) |
| US-02 | BriefIn/Out / Run.role / launchEval / deterministic gate(AI非依存)/ gen→det→eval E2E | `gen-gate-eval.test.ts`(8), **`gen-eval.spec.ts`(complete)** | int + **E2E** | pass | `us-02.gen-eval-advanced.png`, `us-07.completeness-review.png` |
| US-03 | requirements↔addressed 照合 / 理由なし gap→自動差し戻し(loud)/ AI申請→4択人間判断 / backlog 化 / 全gap解消まで done不可 | descope路: `gen-gate-eval.test.ts`+`descope-backlog.test.ts`(4)+**`gen-eval.spec.ts`(descope)** / **auto-rework路: `gen-gate-eval.test.ts`「auto-rework: gap with NO request stalls loud」(新規)** | int + **E2E** | pass | `us-03.descope-decision.png`, `us-03.descope-resolved.png` |
| US-04 | Prompt 2層(Core常時 + Step Payload遅延)/ gen と eval で payload 差異 / lazy ロード | `prompt`/composition 系 unit + `live.ts` payload 構築 | unit | 234 pass | (UIなし) |
| US-05 | BugfixDossierProfile(cause 2層/impact/fix/prevention/video)/ レジストリ登録 / coerceBlocks 前方互換 | `domain/review/profile.test.ts`, `brief.test.ts` | unit | 234 pass | (UIは US-07 video枠) |
| US-06 | 各契約編集 / 永続化→次Run反映 / 進行中読取専用【充足】 ‖ **対話式(要望→AI提案→差分プレビュー→承認)【未実装】** | `step-contracts.test.ts`(PATCH boundary), **`gen-eval.spec.ts`(optInGenEval + reload 永続化検証)** | int + **E2E** | **partial**(編集→永続→反映=pass / 対話 UX=未実装→O-02 carried) | `us-06.step-config.png` |
| US-07 | completeness table(gap赤)/ impact / dossier / video枠 / screenshot証拠 / approve・reject / レスポンシブ / リッチ描画→承認 E2E | **`gen-eval.spec.ts`(complete)**, `loop.spec.ts`(ac-map/mermaid/screenshot), `responsive.spec.ts` | **E2E** | pass | `us-07.completeness-review.png`(2/2 ✓)、`loop` scr-04 |
| US-08 | 受信箱お知らせ一覧 / サイクル側で回答 / 1件ずつ / 選択肢+その他 / resume→2周以上【scripted で充足】 ‖ **「実AI使用 E2E」AC【加算層のみ】** | `loop.spec.ts`(Q→回答→resume→review→approve), `stalled.spec.ts`(retry) / 実AI: `live-run.test.ts`(`bun test:live` / 環境ゲート・S9 決定的ゲート外) | **E2E** | **partial**(scripted=pass / 実AI E2E は additive 方針で別管理→O-03) | `loop` scr-02/03/05, `stalled` |
| US-09 | PageGuard/Comparator 抽出 / SCR-01〜05 動作不変 / 重複なし / 既存テスト全pass | 全 E2E(既存5spec回帰)+ 234 pass | **E2E** + unit | pass | 既存 scr-* 不変 |

**結論**: 全 9 US に最低 1 シナリオテストあり。UI を持つ US(02/03/06/07/08)はブラウザ視覚証拠あり。型/前方互換/coverage 系 AC は決定論スイートで網羅。**ただし US-06「対話式編集 UX」と US-08「実AI使用 E2E」の 2 AC は本サイクルで充足しきれていない**(下記 O-02/O-03 / 敵対レビューで検出)。いずれも品質ハーネスの縦ループ成立(steps 不崩)には不要のため carried とし、`確定` 後も honest に残す(原則#6「黙って descope しない」)。

## シナリオテストマトリクス
| # | US | シナリオ名 | 前提状態 | 操作 | 期待結果 | テストパス | 証拠 | 結果 |
|---|----|----------|---------|------|---------|----------|------|------|
| 1 | US-06→02→07 | step opt-in → gen→gate→eval → 2/2 完全性レビュー | 新規 project(契約なし) | Step 設定で S1 に検証観点付与→保存→**reload で永続化検証**→cycle作成→S1起動→Inboxでレビュー→承認 | 永続化された契約で gen→gate→eval 起動 / レビューに「完全性チェック 2/2 要件 対応」✓✓ / 承認で S2 起動可 | `gen-eval.spec.ts`(complete 8893) | `us-06.step-config`, `us-07.completeness-review`, `us-02.gen-eval-advanced` | ✅ pass |
| 2 | US-06→02→03 | gap → 理由付き見送り判断 → backlog | 同上 | 同手順で descope シナリオ→Inboxで見送り判断→「見送る」 | Inbox に「見送り判断」カード / 要件2 + AI理由 + 4択表示 / 「見送る」で cycle へ戻り Inbox から消費(backlog 化・黙殺なし) | `gen-eval.spec.ts`(descope 8894) | `us-03.descope-decision`, `us-03.descope-resolved` | ✅ pass |
| 2b | US-03 | auto-rework: 申請なし gap → loud stall(人間カードなし) | S1 契約付与 + gen-eval-gap | S1起動→evaluator が r2 を gap・descope 申請なし | evaluator run stalled + 理由「見送り申請なし」/ open question 0 件(黙殺せず・人間にも出さず AI 再生成ループ) | `gen-gate-eval.test.ts`(auto-rework) | (API層・視覚UIなし) | ✅ pass |
| 3 | US-08 | Human Inbox 縦ループ(Q→回答→resume→review→approve→次Phase) | 新規 cycle(happy) | S1起動→Q回答→review承認 | 1フェーズが IDE 不要で回り S2 起動可 | `loop.spec.ts:13`(happy 8891) | scr-01〜05 | ✅ pass |
| 4 | US-08 | stalled → retry | stall-first | S1起動→stall→retry | 停止理由 + retry導線 / retryで attempt2 + 新Q | `stalled.spec.ts:14`(stall 8892) | scr-02.stalled | ✅ pass |
| 5 | US-03/08 | Inbox 空状態 | 新規 happy | /inbox | 「いま捌くものはありません」+ 0件 | `inbox-empty.spec.ts:10` | scr-03.empty | ✅ pass |
| 6 | US-07/09 | 390px レスポンシブ健全性 | 新規 happy | / と /inbox を390px | 横溢れなし / nav 到達可 | `responsive.spec.ts:24`(mobile) | scr-01.mobile | ✅ pass |

## バグ一覧
| # | 深刻度 | US | シナリオ | 再現手順 | 期待 | 実際 | 証拠 | ステータス |
|---|-------|----|---------|---------|------|------|------|----------|
| — | — | — | — | — | — | CRITICAL/HIGH バグ **0 件** | — | — |

### 観察(バグではない・設計どおりの fallback / 既知の未充足 AC)
- **O-01 (LOW / not-a-bug)**: `us-07.completeness-review.png` の Screenshot ブロックが「スクリーンショット未取得」プレースホルダになる。scripted シナリオの block src(`screenshots/x.png`)は実ファイルのない相対パスのため、`ReviewBlocks` の安全 src 検査 + onError fallback(US-07 の前方互換 AC)が発火した結果。**実 verify-ui 成果物がある live 実行では実画像が描画される**。S9 の scripted 文脈では期待挙動。次サイクルで live verify-ui screenshot を流す経路(s8 carried `S8-live-completeness`)が埋まれば実画像に解消。
- **O-02 (MEDIUM / 未充足 AC — 敵対レビュー検出)**: US-06 の S3 更新 AC「編集は**対話式**(要望→AI が変更案提案→差分プレビュー→承認して適用)」は**未実装**。現状 `StepConfigPage` は手入力フォーム(直接編集→保存)。**編集→永続化→次Run反映**の AC は E2E で充足(reload 検証込み)だが、対話 UX 自体は S8 で手入力フォームとして実装された(scope 判断)。次サイクルで対話式編集 UX を実装するまで本 AC は未充足。→ ledger `S9-US06-dialog` で carried。
- **O-03 (LOW / 方針上の別管理)**: US-08 AC「**実 AI 使用**の E2E で Q→回答→resume が pass する」は決定的 S9 ゲートには含めない(`live-run.test.ts` は `bun test:live` の環境ゲート付き加算層 / [real-ai-tests-additive] 方針)。scripted の `loop.spec` で縦ループの振る舞いは証明済。実AI E2E の常時実行化は v0.0.x。→ ledger `S9-US08-liveE2E` で carried。

## テスト実行ログ
| 日時 | テスト | 結果 | 備考 |
|------|------|------|------|
| 2026-06-11 | `bun test src tests/integration`(初回) | 234 pass / 0 fail | S8 ベースライン維持(server.ts シナリオ配線は回帰ゼロ) |
| 2026-06-11 | `bunx playwright test`(全6・初回) | 6 pass | 新規2 + 既存回帰4 無破壊。視覚証拠 5 枚取得 |
| 2026-06-11 | **dogfood 敵対レビュー#1**(pr-test-analyzer) | overclaim 3件検出 | auto-rework 未テスト / US-06 対話UX未実装 / US-08 実AI別管理。是正に着手 |
| 2026-06-11 | `bun test src tests/integration`(auto-rework 追加後) | **235 pass / 0 fail** | +1(auto-rework: 申請なし gap→loud stall・人間カード0)。gen-eval-gap fixture 追加 |
| 2026-06-11 | `bunx playwright test`(全6・永続化検証追加後) | **6 pass** | complete に reload 永続化検証を追加(pre-save badge の弱点を是正) |
| 2026-06-11 | `tsc --noEmit`(server)/ `web tsc` | clean / clean | 型健全 |

## evaluator 裁定(dogfood: 敵対的テストレビュー)
- 起動: `everything-claude-code:pr-test-analyzer` を敵対モードで起動し、新規 E2E が **vacuous(空振り)か / 経路が実装と一致するか / doc が overclaim していないか / env シナリオ公開の妥当性** の 4 観点で攻撃。**人間はソースを読まず結論のみ**(ハーネス原則)。
- 結論: **4 観点中 2 が SOUND**(経路一致 = scripted の QuestionRaised→ResultEmitted 順序は sink 逐次 await で決定的・race なし / env シナリオは allowlist ガードで安全)。**是正対象 を検出 → 即対応**:
  - **(test 品質) pre-save badge アサーション**: バッジは client state のみで保存検証にならない → complete テストに **reload 後の `#S1-obs` 値 + バッジ再描画**を追加し、PATCH 永続化を実証。
  - **(overclaim) US-03 auto-rework 未テスト**: `engine-service.onEvaluatorResult` の auto-rework 分岐(申請なし gap→loud stall)に到達するテストが皆無 → `gen-eval-gap` fixture + 統合テストを追加(235 pass)。
  - **(overclaim) US-06 対話 UX 未実装 / US-08 実AI E2E 別管理**: doc を partial 表記に是正 + O-02/O-03 + ledger carried 化(隠蔽せず honest 化)。
- 是正後の再検証: 235 pass / E2E 6 pass / tsc clean を確認。

## 質疑応答ログ

### Q-01 — (なし)
- 本サイクルは S8 確定のスコープを実システムで検証するのみ。仕様の曖昧点(実装漏れ)は **O-02(US-06 対話UX)** として検出したが、これは S8 のスコープ判断に起因し新たな仕様曖昧ではない。upstream への Q 差し戻しは不要、carried で次サイクルへ送る。

---

## AI が独自に決めたこと と 理由

> **裁定方針(dogfood ハーネス原則)**: テスト戦略・E2E の配線は内部実装に依存する判断だが、本サイクルの D は「既存の決定的シナリオ資産をブラウザから選べるようにする test-enablement 配線」に限定し、新ビジネスロジック/アダプタは書いていない(S9 禁則の遵守)。視覚証拠は AI が実ブラウザで取得し、人間はソースを読まず screenshot とテスト結果のみで承認できる。

### D-01 — gen→gate→eval の 2 シナリオ(`gen-eval-complete`/`gen-eval-descope`)を `AIDLC_SCENARIO` env から選べるよう server.ts に配線
- **理由**: 両シナリオは S8 で既に `ScriptedOrchestrator` に実装済(新ロジックではない)。だが server.ts は `happy`/`stall-first` のみ env 公開だったため、ブラウザ E2E から completeness gate / descope / リッチ描画に到達できなかった。env の許可値を 2 つ広げるのみ(allowlist + 不正値は happy fallback)。ドメイン・app・アダプタのロジックは無変更。US-02/03/07 のブラウザ視覚証拠(原則#1「視覚確認」)を取得する唯一の経路。
- **判断**: AI 自己決定(test-enablement 配線 / 回帰 234 pass・tsc clean で無破壊を担保)。

### D-02 — gen→gate→eval の起動は「Step UI で検証観点を付与(US-06)→ role=generator 起動」という縦ループで E2E 化
- **理由**: `DEFAULT_STEP_CONTRACTS={}` のため既定パイプラインは role-less。`startPhase` は live project を読み `verification` 契約があれば generator 起動(S8 配線)。よって「設定画面で契約を付ける」が gen→gate→eval の自然な入口であり、US-06(契約編集)→US-02(パイプライン)→US-03/07(ゲート/描画)を**1本の縦スライス**で証明できる。シナリオ固有の seed コードを足さず、ユーザーが実際に踏む導線そのものでテストした。
- **判断**: AI 自己決定。`gen-eval.spec.ts` の `optInGenEval` ヘルパに集約。

### D-03 — 視覚証拠は `aidlc-docs/v0.0.2/s9/screenshots/` に US キーで保存(`shotS9` ヘルパ)
- **理由**: 既存 `shot` は v0.0.1 の `aidlc-docs/s7/screenshots/` に書く。S9 成果物を自己完結させるため別ヘルパ `shotS9` を追加(加法的)。命名は証明対象 US に紐付け(`us-06.* / us-07.* / us-03.* / us-02.*`)。
- **判断**: AI 自己決定。

---

## 棄却した案

### R-01 — gen→gate→eval を専用 seed スクリプト/固定 project fixture で E2E 化
- **棄却理由**: 「ユーザーが踏まない経路」をテストすることになり、US-06 の契約編集 UI を迂回してしまう。D-02 の「設定画面から契約付与」縦ループの方が、実導線・US 横断・追加コード最小の三拍子で優れる。

### R-02 — live(実 AI)で US-08 の Q→resume を S9 ゲートとして必須化
- **棄却理由**: 実 AI テストは加算層(scripted を緩めない / 別アダプタ)という確定方針([real-ai-tests-additive])。コスト・CLI 依存があり S9 の決定的ゲートには含めない。scripted の `loop.spec` で縦ループは証明済。live は `bun test:live` で随時(環境ゲート付き)。

## 次サイクルへの引き継ぎ (必須)
- **テストで発見された未充足 AC**(敵対レビュー検出 / 黙って閉じない):
  - **O-02 US-06 対話式編集 UX**(要望→AI提案→差分プレビュー→承認)は未実装(手入力フォームのみ)。次サイクルで対話 UX を実装 → ledger `S9-US06-dialog` carried。
  - **O-03 US-08 実AI使用 E2E** の常時実行化(現状 `bun test:live` 環境ゲート付き加算層)→ ledger `S9-US08-liveE2E` carried。
- **観察 O-01(screenshot プレースホルダ)**: scripted では実画像が無いため設計どおり fallback。**live verify-ui screenshot を review block に流す経路**(S8 carried `S8-live-completeness`)が次サイクルで埋まれば実画像に解消。US-07「screenshot 証拠」AC の live 完全充足は v0.0.3。
- **棄却したテスト戦略**: 専用 seed fixture(R-01)/ live 必須化(R-02)。理由は上記。
- **Step 間で認識のずれ**: なし。S8 の I/F 整合・descope-key 堅牢化が効いており、ブラウザ経路でも text↔key 照合のブレは観測されず。
- **確定 D-01〜D-03 / 新規テスト / carried O-02・O-03 は `ledger.yml` に台帳化**(下記)。次サイクル S1 は into: が当該版を指す carried を全消し込みするまで進めない。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (なし。S8 から順送り。手戻りなし。)

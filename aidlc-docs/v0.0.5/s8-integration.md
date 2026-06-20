# S8 — PJ 統合 進行ログ

## メタ
- 工程: S8 (Integration)
- 役割: アプリケーションエンジニア(統合)
- ステータス: 核 5 Unit + housekeeping 実装完了(決定論検証緑)/ live 視覚証拠は S9
- 入力参照: s7-domain-code.md / src/domain / s5(Unit I/F)
- コード出力先: `src/`(domain 配下は触らない)
- 作成日: 2026-06-20
- 更新日: 2026-06-20

## 進捗サマリ
- **Unit-06 housekeeping(US-06/07/08/09): 実装完了・検証緑**。
- **核 5 Unit: 実装完了・決定論スイート緑(2026-06-20 追補)**:
  - Unit-01 証拠ゲート: `engine-service.allowDone` に evidence gate を配線(evaluator allow-done 前に live 証拠を機械検証)。port `EvidenceGatePort` + 実装 `FsEvidenceGate` + `Ports.evidence?`(live 合成のみ装着 / D-04)。
  - Unit-02 ルート ledger + §6: `aidlc-docs/ledger.yml`(全版横断 append-only)+ parser/loader(`root-ledger.ts`、依存追加なし)+ context-resolver §6 を「ルート + 現サイクル」注入に拡張 + 移行 script。
  - Unit-03 reconcile: `reconcileCycle`(domain `reconcileStatus`/`detectEscalation` 利用)+ `scripts/reconcile-check.ts`(S1 完了ゲート / 未消し込み non-zero)。
  - Unit-04 seeded+証拠生成: manifest writer(`evidence-manifest.ts` / Unit-01 ゲートと round-trip 検証済)+ `scripts/generate-evidence.ts`(screenshot+log → manifest)+ `scripts/seed-cycle.ts`(任意 step 状態を sandbox DB に seed)。
  - Unit-05 probe: `binding-probe.ts`(composer 出力に rule 本文が届くか機械検証)+ `scripts/probe-binding-rules.ts` + operating-model Rule D にチェックリスト明文化。
- 完全性ゲート: 決定論スイート **741 pass / 0 fail**、`reconcile`/`probe:rules`/`ledger:check` 全 pass、src typecheck 0、web build green。**live 視覚証拠(seeded 実機)= Unit-04 script で生成可能(手動フロー)/ S9 で実施**。

## I/F 契約整合チェック (S5 ↔ ドメイン公開関数)
| # | S5 I/F 定義 | ドメイン公開関数 | 一致/差分 | 解消方針 |
|---|------------|----------------|----------|---------|
| 1 | Unit-01 `checkEvidenceGate(version, step)→{ok,missing}` | `evaluateStepDoneEligibility(manifest, opts)→{eligibility,missing}` | 差分: ドメインは manifest を引数に取る純関数。アダプタが version/step → manifest 解決を担う | アダプタ(Unit-01 統合)で manifest 読み込み + Run 開始時刻取得を配線 |
| 2 | Unit-02 `loadRootLedger/resolveSection6/migrate` | `validateLedgerEntry(entry)` | 一致(ドメインは entry 検証 / load・migrate・§6 結合はアダプタ) | アダプタで yaml I/O + §6 注入 |
| 3 | Unit-03 `reconcileCheck(version)→exit code` | `reconcileStatus(entry, targetVersion, addressedIds)` / `detectEscalation(...)` | 一致(ドメインは判定 / 由来→addressedIds 抽出・exit はアダプタ/script) | script で US 由来抽出 + 非0 終了 |

## アダプタ実装一覧
| # | アダプタ種別 | コードパス | 呼び出すドメイン関数 | テストパス | 対応 US |
|---|------------|----------|------------------|----------|--------|
| 1 | scripted(orchestrator) | `src/infra/orchestrator/scripted.ts` | — | 既存スイート | US-06 |
| 2 | HTTP(server) | `src/server.ts` | — | 既存スイート | US-07 |
| 3 | UI(web) | `web/src/features/thread/ConversationThread.tsx` | — | web build + 既存 | US-08 |
| 4 | UI 削除 | `web/src/features/settings/StepConfigPage.tsx`(削除) | — | web build | US-09 |
| 5 | 証拠ゲート(app) | `src/app/services/engine-service.ts`(allowDone)+ `src/infra/evidence/fs-evidence-gate.ts` + `src/app/ports/evidence-gate.ts` | `evaluateStepDoneEligibility` | `evidence-gate.test.ts` | US-01 |
| 6 | ルート ledger + §6(app) | `src/app/services/root-ledger.ts` + `context-resolver.ts`(§6) | `validateLedgerEntry` | `root-ledger.test.ts` | US-02 |
| 7 | reconcile(script) | `scripts/reconcile-check.ts` + `root-ledger.ts`(reconcileCycle) | `reconcileStatus`/`detectEscalation` | `root-ledger.test.ts` | US-03 |
| 8 | manifest writer + seed/gen(infra/script) | `src/infra/evidence/evidence-manifest.ts` + `scripts/{seed-cycle,generate-evidence}.ts` | — | `evidence-manifest.test.ts` | US-04 |
| 9 | probe(app/script) | `src/app/services/binding-probe.ts` + `scripts/probe-binding-rules.ts` | — | `binding-probe.test.ts` | US-05 |
| 10 | 移行 script | `scripts/migrate-root-ledger.ts`(→ `aidlc-docs/ledger.yml`) | — | `root-ledger.test.ts` | US-02 |

## mock 突合レビュー (S3 視覚契約 ↔ 実装画面)
S3 視覚契約の全 data-state インベントリ(`ls aidlc-docs/v0.0.5/s3/screenshots/`、tokens 除く):
| S3 状態 (scr-NN.state.png) | 実アプリでの出し方 | 構成要素 | 情報粒度 | 日本語水準 | 判定 | 対応 |
|---|---|---|---|---|---|---|
| scr-02-conversation-thread.default.png | 会話スレッドでレビュー emit 済(visual_review あり)状態 | 既存 review トークンのバッジ「できあがりの確認」+ 本文 CTA | 一致 | プロダクト語 | **要 live 検証(verify:visual / 実機 + seeded 状態)** | 実装は既存 review トークンに一致(コード突合済)。実機 visual-eval は seeded 環境(Unit-04)上で核 Unit 実装後に実施 |

> 注: 行数 = S3 非 tokens screenshot 数(1)と一致。verify:visual(独立 vision 評価)は実機状態の再現が要るため、seeded 環境(Unit-04)完成後に回す。それまで本行は「要 live 検証」で未確定。

## US-AC 機能フロー突合 (Rule B / 完了条件6)
| US | 受け入れ条件(AC) | 動く動線 | 判定 | 対応 |
|----|----------------|---------|------|------|
| US-06 | scripted summary 日本語化 / live 不変 | scripted 経路 → レビュー表示が日本語 | 貫通(コード + 既存スイート緑) | live 表示確認は seeded で |
| US-07 | allowed に multi-turn / happy fallback 解消 | AIDLC_SCENARIO=multi-turn → 正ルート | 貫通(allowed 追加 / 既存スイート緑) | — |
| US-08 | レビュー emit 後バッジが review / CTA 整合 | thread が openReview で review バッジ | 貫通(コード突合 / S3 契約一致) | 実機 visual は seeded で |
| US-09 | StepConfigPage 削除 / build green | 削除 + web build green | 貫通 | — |
| US-01 | 証拠存在で done 機械ゲート | evaluator allow-done 前に `FsEvidenceGate` で manifest を機械検証 → 不在/不足/古い証拠は stall(レビュー不出)| 貫通(`evidence-gate.test.ts` 10 件 / live は seeded で S9)| 視覚証拠は seeded で |
| US-02 | ルート ledger + §6 横断注入 | `aidlc-docs/ledger.yml` 生成 → §6 が「ルート+現サイクル」を headless prompt に注入 | 貫通(`root-ledger.test.ts` / 実 ledger parse + §6 + 移行)| — |
| US-03 | 未 US 化で S1 fail | `reconcile-check.ts` が未消し込み carried / 未対応 escalation で exit≠0 | 貫通(reconcile v0.0.5 PASS + 単体 / 実 ledger)| — |
| US-04 | seeded + 毎 step 証拠自動生成 | manifest writer が Unit-01 ゲートと round-trip / `seed-cycle`+`generate-evidence` script | 貫通(`evidence-manifest.test.ts` round-trip)| live 撮影は seeded で S9 |
| US-05 | 注入点到達 probe | `probe-binding-rules.ts` が契約/運用モデル本文の prompt 到達を assert(reached:true)| 貫通(`binding-probe.test.ts` 10 件 / 実 repo)| — |

## 統合テストログ
| 日付 | テスト | 結果 | 原因 | 対応 |
|------|------|------|------|------|
| 2026-06-20 | `bun test src tests/integration`(Unit-06 後) | 693 pass / 0 fail | — | — |
| 2026-06-20 | `bun run typecheck`(src/web) | エラーなし(scripts 既存除く) | — | — |
| 2026-06-20 | `cd web && bun run build` | green | — | — |
| 2026-06-20 | `bun test src tests/integration`(核 5 Unit 後) | **741 pass / 0 fail**(+48) | — | — |
| 2026-06-20 | `bun run reconcile v0.0.5` | PASS(S11-P04 消し込み後)| 3 サイクル跨ぎの id 不一致で未消し込み検出 | v0.0.5 ledger に S11-P04 done 追記 |
| 2026-06-20 | `bun run probe:rules` | PASS(契約+運用モデル reached)| — | — |
| 2026-06-20 | `bun run ledger:check` | up to date | — | — |
| 2026-06-20 | `bun run typecheck`(src)| 0(scripts 既存 dom 型のみ残)| — | — |
| 2026-06-20 | `cd web && bun run build`(核 Unit 後)| green | — | — |

## 質疑応答ログ
(未解決 Q なし)

---

## AI が独自に決めたこと と 理由

### D-01 — S8 を Unit 単位で段階統合し、Unit-06(housekeeping)から着手
- **理由**: Unit-06 は他 Unit に依存しない leaf で完全検証可能(既存スイート緑 + web build)。核 Unit(証拠ゲート/ledger/reconcile/seeded/probe)は依存と完全性ゲート(verify:visual / live)が重く、seeded 環境(Unit-04)を土台に順次配線する。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — US-08 バッジは `openReview`(visual_review カード存在)で review トークン表示
- **理由**: S3 SCR-02 視覚契約(run→review)。run=running を表示根拠にせずレビュー emit(visual_review)を状態源にし、本文 CTA と整合。既存 `badge--review` クラス再利用(新規色なし)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — Unit-01 証拠ゲートは evaluator allow-done(技術 step の自己申告完了)に 1 点配線
- **理由**: US-01 は「各**技術** step」が対象。S1 等の hearing は role-less で `event-applier` の RunStateChanged→done を通り live-backend 証拠を持たない。技術 step は gen→gate→eval を通り、人間レビュー(visual_review)は evaluator の allow-done(`onEvaluatorResult`)で起票される。そこが「claude の自己申告 done」かつ「人間がレビューする時点」なので、その直前に証拠ゲートを置く(US-01 D-01 の「done 遷移の直前フックに 1 点」/「human がレビューする時点で既に live 証拠が揃っている」を最も忠実に満たす)。generator の内部 done は deterministic-gate、evaluator の網羅は completeness-gate が既に担い、本ゲートが live 証拠という第3の脚を足す。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-04 — 証拠ゲートは live 合成のみに装着(scripted は決定論ダブルゆえ非装着)
- **理由**: `Ports.evidence?` は optional。`server.ts` は `AIDLC_ORCHESTRATOR=live` のときだけ `FsEvidenceGate` を装着する。scripted orchestrator は E2E/デモの決定論ダブルで実 backend 証拠を生成しない(装着すると全 gen→eval が stall する)。ハードゲートは実 AI が done を自己申告する live 経路でこそ要る([real-ai-tests-additive] の scripted+live 2 アダプタ分離)。決定論スイート(harness)は gate 非装着で従来どおり緑、専用 `evidence-gate.test.ts` が実ゲートの block/pass を検証する。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-05 — ledger parser は依存追加せず自前実装(folded scalar 対応)+ 実 ledger で検証
- **理由**: `yaml` パッケージ未導入かつ ledger 形式は自リポ管理で制約的。indent ベースの最小 parser を `root-ledger.ts` に実装し、合成 fixture に加え **実 v0.0.1〜v0.0.5 ledger** を parse する回帰テストで担保(スキーマ drift をテストで検出)。`closed_in`(YAML)→`closedIn`(domain)写像も内包。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案
### R-01 — Unit-01 を `event-applier` の RunStateChanged→done に置く
- **棄却理由**: そこは role-less(S1 hearing 等)の経路で、技術 step の gen→gate→eval 完了(= 人間レビュー起票点)を通らない。US-01 の「各技術 step」「human レビュー時点で証拠が揃う」を満たせない。evaluator allow-done に移した(D-03)。

## 次サイクルへの引き継ぎ (PDF P.10 準拠)
- **S8 完了(核 5 Unit + housekeeping)**。決定論スイート 741 緑 + gate script 全 pass。
- **live 視覚証拠の seeded 実機緑化は S9 で実施**: `verify:test`(sandbox+backend)→ `seed:cycle`(高コスト状態へ)→ `evidence:gen`(per-step manifest)→ Unit-01 ゲートが pass する動線を実機で 1 本通す。
- **移行で表面化した歴史的 carried 債務**(S7-C1〜C4 `into:v0.0.x` 等)はルート台帳に可視化済。v0.0.6 S1 の reconcile で具体 into を付け直すか dropped にする(本サイクルの新規作業ではない)。詳細は s11-retrospective.md に記録。

## 残作業(S9 以降)
1. **live 視覚証拠(seeded 実機)**: 上記動線を 1 本通し、Unit-01 ゲートの pass を実機証拠として残す(S9)。
2. **mock 突合 verify:visual**: S3 視覚契約(scr-02)を seeded 実機で独立 vision 評価(S9)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか: (手戻り時に追記)

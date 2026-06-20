# v0.0.5 — 全 US エビデンス対応表(どの操作/手段で確認したか)

> ユーザー指示「全てにおいてエビデンスは出すべき」に対応。各 US を「変更内容 → 確認手段 →
> 証拠アーティファクト」で対応付ける。証拠形式は step 性質に応じる(US-01 D-02): UI=screenshot、
> backend/script/gate=テスト結果・CLI 実行ログ(test-report)、live=実 claude 操作の dossier。

## US-01 — live 証拠ハードゲート(★ 実 claude で live 実証)
- 変更: 技術 step の done を live 証拠の存在で機械検証。証拠が無ければ done を拒否(自己申告を拒否)。3 提示経路(role-less done / role-less review / gen→eval allow-done)を `evidence-gate-check.ts` で共有ゲート。`requiresLiveEvidence`(S7/S8/S9)。
- **live 実証 — BLOCK 経路(証拠なし→拒否)**: `s9/live-gate/02-block-stalled.png` — 実 claude(runId `3822f2d6…`)が S1 done を自己申告 → ゲートが manifest 不在を検出 → **done 拒否 → 行き詰まり**(UI に停止理由表示)。動画 `s9/live-gate/*.webm`。dossier = `s9/live-gate/README.md`。
- **live 実証 — PASS 経路(証拠あり→done 許可 / 2026-06-21 追加)**: seed で S1–S8 done → **実 claude で S9** → 証拠 auto-written → レビュー承認 → 証拠ゲートが **done を許可**。`S9=done`。dossier = `s9/live-pass/`(attach-pass.log / S9-manifest.json / S9-run.log 132KB / S9-shot.png)。実証中に 2 実バグを発見・修正(deterministic gate の studio 固有パス hardcode=P-S9-03 / seed chat ドメインバグ=カタカナ長音符)。= BLOCK/PASS 両経路 live 実証済。
- 決定論: `evidence-gate.test.ts`(16)= role-less done/review + gen→eval の各経路で block(証拠なし)→ pass(証拠あり)。
- 本番配線: `verify:v005` = live 合成に `FsEvidenceGate` 装着 / scripted 非装着(D-04)。
- ※ S8 当初は gen→eval 1 点のみ配線で **実運用で発火しない欠陥**だった(s11 P-S9-02)。実 claude live 確認で発見・是正。

## US-02 — ルート単一 append-only ledger + §6 横断注入

**UI 画面なし(internal-only)。以下はこの US が何を保証しているかの正直な説明。**

この US の変更(aidlc-docs/ledger.yml の導入 + context-resolver §6 拡張)は、headless AI が
受け取るプロンプトの内容を変えるものであり、サイト上でユーザーが目で見る画面は存在しない。
ユーザーが観察できる保証は「サイクルを跨いだ未解決提案が headless AI に本文として届き、
見落としが構造的に起きなくなる」ことだが、これはプロンプト本文の内容という AI 内部の状態であり、
現在の web UI はそれを可視化するビューを持たない。

可視化するには「AI が受け取ったプロンプトの §6 部分を web 画面に表示する ledger ビュー」が
必要だが、それは v0.0.5 スコープ外(v0.0.6 以降)。

- 内部証拠(参考): `verify:v005`(本番 composer で §6 にルート `AUTO-ORCH-core` + 現サイクル `SPLIT-v005-scope` が載るのを実機確認)/ `root-ledger.test.ts`(23, 実 v0.0.1〜5 ledger parse + §6 + 移行)/ 生成物 `aidlc-docs/ledger.yml`(歴史的 carried 10 件可視化)。
- live: 実 claude S1 run の実プロンプト promptChars=33,421(契約+運用モデル+§6 を本文注入)= `s9/live/README.md`。
- **画面の動きで実証(2026-06-21 / 裏方を画面挙動で見せる)**: 隔離 repo の root 台帳に carried 項目「CSV エクスポート(前サイクル見送り→into v0.0.1)」を設置 → **実 claude で S1 を起動** → AI が §6 注入を取り込み、**US-07「支出を CSV で書き出す」を専用 US として生成**し、**D-01 で台帳 ID `CARRY-csv-export` を引用して reconcile 済**と明記。= 横断注入が AI の出力(要件/レビュー画面)に自然に反映されることを実機で確認。dossier = `s9/live-us02/`(s1-index.md / s1-us-07-csv-export.md / seeded-root-ledger.yml / board.png / attach.log)。「画面なし」は ledger 専用ビューの話で、**効果自体は既存の要件/レビュー画面に現れる**。

## US-03 — reconcile 検査(S1 完了ゲート)

**UI 画面なし(CLI/script-only)。以下はこの US が何を保証しているかの正直な説明。**

この US の変更(reconcile script + S1 完了ゲート)は CLI ツールおよびバックエンドの動作であり、
サイト上でユーザーが目で見る画面は存在しない。ユーザーが観察できる保証は「前サイクルの未解決
項目が US 化されていないと S1 が exit≠0 で止まる」ことだが、この停止は CLI/CI 上の挙動であって、
web UI のカード・バッジ・画面として表示されるものではない。

可視化するには「reconcile 状態を web 画面に表示するゲートビュー」が必要。現在は CLI 実行ログのみ。

- 内部証拠(参考): `s9/evidence/us-03-reconcile.txt`(`reconcile v0.0.5` = PASS / 3 サイクル跨ぎ S11-P04 を検出→消し込み)/ `root-ledger.test.ts`(reconcileCycle: 未消し込み→fail / escalation / 消し込み→pass)。
- **画面の動きで実証(部分)**: US-02 の live S1 run で、AI は carried 項目を**実際に reconcile**(US-07 化 + 台帳 reconcile 記録)した = reconcile の**正方向の挙動**は画面(要件出力)に現れた(`s9/live-us02/`)。一方 **reconcile ゲートの「未消し込みなら S1 を止める」を画面に出すには、reconcile/ledger CLI の repoPath パラメータ化(P-ARCH-02)+ web S1 開始への配線が必要**で、これは v0.0.6(BACKLOG §K)。studio 自身の dogfood では cwd 固定 CLI で機能。→ v0.0.5 は CLI+テスト+AI 挙動で accept、ゲート BLOCK の画面化は P-ARCH-02 へ carry。

## US-04 — 各 step を即確認できる seed データ生成スイート(BT-04 / S1 再ヒアリング Q-01)

- 変更(Q-01 反映): seed は「**走らせずに任意 step を即検証できる、もっともらしいサイクル群(スイート)**」。`fixtures/seed-cycles/` に 5 サイクル(todo-app@S2 / inventory@S4 / booking@S6 / expense@S8 / chat@S9 = 別アプリ・別 step 停止)をコミット。各 step の成果物は**実 skill 出力形に沿ったもっともらしい本文**(US/画面/モデル/純粋 .ts コード/シナリオ報告)、証拠 screenshot は**実 studio ボードの実キャプチャ**(1×1 placeholder を廃止)。`seedCycleCore`(fixtureDir 複製)+ `seedSuiteCore`(project ごと seed)。
- **実機 screenshot(実アプリ実キャプチャ)**: `fixtures/seed-cycles/chat/evidence/S9/shot.png` ほか計 5 点(約 90KB / 1440×900)。
  - 撮り方: `seed:capture` がスイートを隔離 seed → 実 studio を in-process 起動 → 各サイクルのボード `/cycles/<id>` を Playwright で全画面撮影。
  - 見えるもの(chat@S9 例): タイトル「社内チャット」v0.0.1、ボードに 要件/設計/実装=完了・検証=進行中・改善=未着手、「『検証』の成果」レビューパネル。= 実 run と同様の実画面。
- **即確認(実証 / live AI ゼロ)**: seed 後、`FsEvidenceGate.check` が chat@S9・expense@S8 を即 `eligible`(走らせない)。
  - CLI 実演: `seed:suite` = 5 サイクル seed(chat 3 manifest / expense 2 manifest)。各 `_evidence/<step>/{manifest.json,run.log,shot.png}` 生成。
  - 決定論テスト: `tests/integration/seed-immediate-verify.test.ts`(9 pass)= 各サイクル別 step 停止(distinct)/ chat@S9・expense@S8 即 eligible + 実 screenshot >2KB / 産物は実コード・実本文(`(seeded product)` なし)/ none→blocked / log-only→blocked / sandbox guard。
- これにより「いろいろな step を即確認」(US-04 原意 + Q-01)が満たされ、**遅い live hearing 無しで各 step の done ゲート/証拠レビューを即検証できる**(記録者≠レビュアー監査も seed した実証拠上で即実行可能)。
- **正直な限界**(非 descope / [[harness-quality-vision]]): seed は対象アプリ(ToDo/チャット)の画面そのものは撮らない — それは実 live run の `captureVerifyUi` の領域。seed が証明するのは「即確認の**機構**がもっともらしいデータ + 実 studio キャプチャ上で動く」こと(S5 unit-04 D-04)。

## US-05 — binding-rule 到達 probe

**UI 画面なし(test-infra/script-only)。以下はこの US が何を保証しているかの正直な説明。**

この US の変更(probe test テンプレ + operating-model チェックリスト)は binding ルールの
注入到達を機械検証する CI/テスト基盤の仕組みであり、サイト上でユーザーが目で見る画面は存在しない。
ユーザーが観察できる保証は「新しい kit/rules/*.md を追加したとき headless AI に本文が届く」
ことだが、それはプロンプト内部の検証であり web UI では現在可視化されていない。

- 内部証拠(参考): `s9/evidence/us-05-probe.txt`(`probe:rules` = 契約/運用モデル reached:true)/ `binding-probe.test.ts`(10, 実 repo + link-only 負例で reached:false)/ `verify:v005`。
- **画面の動きで実証(同じ注入機構)**: US-02 の live S1 run と同一機構 = composer が kit 散文(契約/運用モデル)を本文注入 → AI 挙動に反映。同 run の AI 出力は注入された運用モデル規範どおり(carried を reconcile / user-facing な US / D-NN 構造)に振る舞っており、binding 注入が画面上の AI 出力に効くことを実機で確認(`s9/live-us02/`)。US-05 固有の「新規ルールの到達検証」は本質的に CI/probe(画面でなく機械検証)。

## US-06 — scripted summary 日本語化(live 不変)
- 変更: scripted orchestrator の要約を日本語化(英語 placeholder "Step output / Deterministic scripted result" → 日本語)。
- **実機 screenshot(Playwright + 実 backend)**: `s9/screenshots/us-06-review-detail-japanese-summary.png`
  - ユーザー操作: S1 開始 → 質問に回答(もの ごとにまとめる) → 受信箱の「できあがりの確認」をクリック → レビュー詳細ページを開く
  - ユーザーが見るもの: 概要ブロックに日本語タイトル「ステップ出力」と日本語本文「スクリプテッドの確定済み結果です。」が表示される(英語ではない)
  - 補記: SCRIPTED_BLOCKS("直したこと")は gen→eval 経路で使われる。happy フロー(resume PATH A)の日本語化も同時に確認済み。実 claude 経路(本番)の出力は従前どおり。

## US-07 — allowed に multi-turn(happy fallback 解消)
- 変更: `server.ts` の許可シナリオに "multi-turn" を追加し、multi-turn サーバー(8895)が happy フォールバックせず実際に multi-turn シナリオを処理するように修正。
- **実機 screenshot(Playwright + 実 backend 8895)**: `s9/screenshots/us-07-multiturn-two-ai-bubbles.png`
  - ユーザー操作: multi-turn サーバー(8895)でサイクル作成 → S1 開始 → 受信箱の「回答する」でスレッドを開く → 質問に回答 → AI から追加質問が届く
  - ユーザーが見るもの: スレッド画面に AI バブルが2つ積み重なる(1つ目=最初の質問「進め方を選んでください」、2つ目=追加質問「追加質問: 優先度を教えてください」)。これは実 backend からネイティブに届いたもの(route intercept ではない)。

## US-08 — レビュー emit 後バッジ = review / CTA 整合
- 変更: 会話スレッド/受信箱のレビューバッジを review 状態に整合。
- **実機 screenshot(Playwright + 実 backend)**: 2点
  - `s9/screenshots/scr-02-conversation-thread.review.png`(受信箱面): 回答送信後、受信箱に「できあがりの確認」バッジが付いたカードが表示され、CTA「確認する」が使えるようになる。
  - `s9/screenshots/us-08-thread-review-badge.png`(スレッド面 ★ 追加): 回答送信後にスレッド画面(URL `/cycles/<id>/thread`)に留まった状態で撮影。トップバー右に `◎ できあがりの確認`(紫バッジ `badge--review`)が表示され、スレッド本文下部に「AI が「できあがりの確認」を出しました。内容を確認して承認 / 差し戻しできます。」パネルと「できあがりを確認する」CTA ボタンが表示される。スレッド画面自体がレビュー状態を正確に反映していることを確認。
- `s9/screenshots/scr-02-conversation-thread.default.png`(参考): スレッドのデフォルト表示(質問バブルのみ)。

## US-09 — dead code 削除(StepConfigPage)
- 変更: 未使用 `web/src/features/settings/StepConfigPage.tsx` 削除。
- **実機 screenshot(Playwright + 実 backend)**: 2点
  - `s9/screenshots/us-09-cycle-list-no-stepconfig.png`: ユーザーがアプリを開いたときのサイクル一覧画面が壊れていないことを確認。「最初のサイクルを作る」ボタンが正常に表示される。
  - `s9/screenshots/us-09-inbox-no-stepconfig.png`: サイクル作成・S1 開始後の受信箱画面に質問カードが正常に表示され、StepConfigPage 削除後もアプリ全動線が動作することを確認。

---

## まとめ(証拠形式の内訳)
| 形式 | 対象 US |
|---|---|
| 実機 screenshot(Playwright + 実 backend) — ユーザーが画面で見るもの | US-04(seed スイート 5 点)· US-06 · US-07 · US-08 · US-09(計 11 点) |
| CLI 実行ログ(test-report) | US-03 · US-05 |
| 決定論テスト pass | US-01〜09 全て(振る舞い担保) |
| 本番コードパス実機確認(verify:v005) | US-01 · US-02 · US-05 |
| 画面の動きで実証(裏方を AI 挙動で / live S1) | US-02(carried→US-07 生成)· US-05(同じ注入機構)· US-03(reconcile 正方向の挙動) |
| **専用画面なし(v0.0.6 で可視化候補)** | **US-02/03/05 の専用ビュー**(ledger ビュー / reconcile ゲート BLOCK の画面化=P-ARCH-02) |

全ゲート: `live:check` / `reconcile` / `probe:rules` / `verify:v005` = PASS。

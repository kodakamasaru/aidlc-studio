# S4 — 技術仕様

## メタ
- 工程: S4 (Tech Spec)
- PhaseGroup: Design
- 役割: ソフトウェアアーキテクト
- バージョン: v0.0.5
- ステータス: 確定
- 入力参照: brief / s1(US-01〜09) / s2(SCR・フロー) / s3(視覚踏襲)
- 作成日: 2026-06-20
- 更新日: 2026-06-20

## このサイクルの S4 方針

技術スタックは確立済み(Bun / TypeScript / SQLite / React+Vite / Playwright / claude CLI spawn)。**本サイクルで新規スタックは追加しない**(Agent SDK 全面移行は v0.0.7)。S4 の主眼は ① 5 機構(US-01〜05)のアーキテクチャ設計と ② **AI 入力コンテキスト設計 + 出力フォーマット設計**(BT-03 恒久ルール / 完了条件7)。

## 技術スタック(確立済 / 参照)

| 用途 | 選定 | 理由 |
|------|------|------|
| ランタイム/PM | Bun | 既存。ローカル常駐 + テスト/ビルド一体 |
| 言語 | TypeScript | 既存。境界は Zod で検証 |
| 永続化 | SQLite(唯一の真実) | 既存。プロセス使い捨て + 起動毎 reconcile の土台 |
| web | React + Vite | 既存 |
| 視覚/E2E 証拠 | Playwright(同梱 Chromium / verify:shot) | 既存。live 証拠の screenshot/動画生成に流用 |
| AI 実行 | claude CLI spawn(-p / --resume) | 既存。SDK 移行は v0.0.7 |

新規スタックなし。代替案(Agent SDK 即移行)は v0.0.7 へ分割済(ledger AUTO-ORCH-monitoring-parallel)。

## アーキテクチャ方針(5 機構)

### US-01 live 証拠ハードゲート
- **証拠の置き場**: `aidlc-docs/{version}/_evidence/{step}/` に manifest + 成果物(ログ / screenshot / 動画 / test-report)。step 単位ディレクトリ。
- **ゲート判定**: step を done に遷移させる前に「当該 step の evidence manifest が存在し、必須エントリ(実 backend 縦経路ログ + step 性質に応じた視覚/動作証拠)が揃っているか」を機械検証。欠落なら done 遷移を拒否(現行は人手 retry / 自動 retry 配線は v0.0.6)。
- **証拠の形式は step 性質で選ぶ**(US-01 D-02): 静的 UI=screenshot / 操作・遷移=動画 / backend・スクリプト=test-report・実行ログ。manifest 内 EvidenceForm の `kind` で宣言(S6 ドメインに統一)。
- **claude 非依存**: 証拠ファイルの存在は OS 観測事実。claude の「done です」自己申告を権威にしない。

### US-02 ルート単一 append-only ledger
- **形式**: `aidlc-docs/ledger.yml`(全版共通 / brief.md と同じルート)。既存 schema(id/origin/decision/state/into/reason/closed_in)維持。
- **移行**: 既存版別 ledger(v0.0.1〜v0.0.4)の未解決(carried)を抽出してルートへ集約。版別 ledger は履歴として残す(改変しない / US-02 D-01)。
- **注入変更**: context-resolver Section 6 を「現サイクル ledger + ルート ledger」に。詳細は下記「AI 入力コンテキスト設計」。

### US-03 reconcile のコード化
- **配線点**: S1 完了ゲート(script/hook)。`aidlc-docs/ledger.yml`(ルート / US-02 産物)を入力に、前(全)サイクルの未解決 + escalation 項目が当サイクルの s1/ で US 化されているか検査。
- **fail 機構**: 未 US 化が残れば非ゼロ終了 → S1 を `確定` にできない。2 サイクル連続 carried を自動 escalate 検出。
- **依存**: US-02(ルート台帳)が前提。S5 DAG で US-02 → US-03 を順序化。

### US-04 seeded cycle-state 環境 + 安価 live
- **seed**: 使い捨て隔離リポ(/tmp 等 / studio 実 aidlc-docs を汚染しない / US-04 D-01)に、任意ステップ状態のサイクルを fixture から投入。
- **安価 live**: backend `--watch` + verify:shot/visual(+ 動画/test-report)を毎 step 自動実行し、US-01 が要求する証拠形式を生成。
- **用途**: 高コスト状態(例: v0.0.4 US-05 完了バナー)を低コストで実 backend 到達・目視。

### US-05 binding-rule 到達 probe
- **probe**: 新 kit/rules/*.md について、context-resolver(composer)の注入経路を通って headless prompt 本文に到達するかを assert するテスト。リンク参照止まり(到達しない)を fail として検出。
- **チェックリスト**: operating-model に「新 rule 追加時に注入点到達 probe を必須化」を明文化。

## 外部 I/F 仕様

| 名称 | 用途 | 通信/形式 | 備考 |
|------|------|----------|------|
| claude CLI | AI 実行 | spawn(-p / --resume) | 既存。SDK 移行は v0.0.7 |
| git worktree | seeded 隔離リポ | CLI | US-04。真の並行(N>1)は v0.0.7 |
| SQLite | 状態の唯一の真実 | better-sqlite 系(既存) | run/HumanTask/session |
| ファイル(aidlc-docs) | 成果物 / ledger / evidence | yaml / md / png / mp4 / json | ルート ledger + _evidence/ 追加 |

## 非機能要件

| 指標 | 目標 | 測定 |
|------|------|------|
| reconcile script 実行 | < 2s(S1 着手時にブロックしない) | script 計時 |
| 証拠生成(verify:shot 1 枚) | < 10s | 既存 verify:shot 実測 |
| seeded サイクル投入 | < 5s で目的状態到達 | seed script |
| 決定論スイート | 既存 green を維持(退行ゼロ) | bun test |

---

## ★ AI 入力コンテキスト設計(BT-03 必須)

「何を・どの source から・どう構造化して headless AI に渡すか」。本サイクルの核心は context-resolver Section 6 の拡張。

| セクション | source | 構造 | 本サイクルの変更 |
|---|---|---|---|
| §6 引き継ぎ台帳(ledger) | **現サイクル ledger(file)+ ルート ledger(file)** | carried/escalation エントリを id/decision/into で列挙 | **現サイクルのみ → 現+ルートへ拡張(US-02)**。全サイクル横断の未解決が常に届く |
| binding rules | kit/rules/*.md(file) | 本文を prompt 先頭へ注入 | **到達を probe で保証(US-05)**。リンク参照止まりを排除 |
| 証拠コンテキスト | _evidence/{step}/manifest(file) | step ごとの証拠所在・形式 | live ゲート判定の入力(US-01) |

- **却下理由の注入**(既存 Section 9)はルート ledger 化で全サイクル横断に強化(US-02 と連動)。
- 入力は**ファイル source を正規に読む**(best-effort parse でなく manifest/yaml の構造化読み取り)。

## ★ 出力フォーマット設計(BT-03 必須)

「成果物・完了状態をどの構造で受け取るか」。

| 出力 | 構造 | 受け手 |
|---|---|---|
| live 証拠 manifest | `{ step, forms: [{ kind: "screenshot"\|"video"\|"test-report"\|"log", path, capturedAt }] }`(json / S6 EvidenceManifest と同形) | US-01 done ゲートが存在・必須充足を機械検証 |
| reconcile 検査結果 | exit code(0=pass / 非0=未 US 化あり)+ 未消し込み id 列挙 | US-03 が S1 完了ゲートで判定 |
| probe 結果 | rule ごと reached: bool + 注入点 | US-05 が pass/detect |

- step done は**観測事実(証拠ファイル存在)で裏取り**し、claude の自己申告 status を権威にしない(責務契約③ / §7 ハードニング規則 2)。

---

## 質疑応答ログ
(本サイクルは技術判断中心で未解決の事業 Q なし。live コストは前サイクル承認済 / 証拠形式は US-01 で確定)

---

## AI が独自に決めたこと と 理由

### D-01 — 証拠は `aidlc-docs/{version}/_evidence/{step}/` に manifest + 成果物で置く
- **理由**: step 単位で証拠を辿れる所在を固定(US-01 AC「所在・形式が定義され後から人間が辿れる」)。manifest(json)で form/path を宣言し、done ゲートが機械検証できる構造にする。
- **種別**: 技術判断(AI 自走で確定 / 事後 double-check)
- **上書き**: なし

### D-02 — 本サイクルは新規スタックを足さない(SDK 移行は v0.0.7)
- **理由**: 検証/台帳の土台に集中。CLI spawn のまま証拠ゲート/ledger/reconcile を組む。SDK 移行は監視の質を上げるが移行コスト大で v0.0.7 に分割済。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — reconcile script は CI/hook でなくまず S1 完了ゲートのスクリプトとして配線
- **理由**: US-03 の本質は「S1 を進めさせない」。最小構成は S1 完了判定で script を呼び非0 で止める。CI 連携は後の強化(YAGNI)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案

### R-01 — 本サイクルで Agent SDK へ移行して監視・証拠取得を query() に寄せる
- **棄却理由**: 移行コスト大。v0.0.7(AUTO-ORCH-monitoring-parallel)へ分割済。本サイクルは CLI spawn + Playwright で証拠を取る。

### R-02 — 証拠を DB(SQLite)に blob で持つ
- **棄却理由**: 証拠(screenshot/動画)はファイルが自然で、人間が辿れる所在(契約)に置く方が良い。DB は run/状態の真実に専念。

## binding 逆引きゲート(完了条件6)
- **US-01**: AC「証拠存在で done 機械検証 / 形式は step 性質で選択」 ⇄ _evidence manifest + form 宣言で満たす。矛盾なし。
- **US-02**: AC「ルート ledger 移行 / §6 を現+ルートに」 ⇄ 入力コンテキスト設計で満たす。矛盾なし。
- **US-03**: AC「未 US 化で S1 fail / 入力はルート台帳」 ⇄ 出力フォーマット(exit code)+ §6 連動で満たす。矛盾なし。
- **US-04**: AC「seed + 毎 step 証拠自動生成 / 隔離」 ⇄ 隔離リポ + --watch + verify:shot で満たす。矛盾なし。
- **US-05**: AC「注入点到達 probe / チェックリスト明文化」 ⇄ probe(reached) + operating-model 追記で満たす。矛盾なし。
- **US-06**(scripted 日本語化): AC「scripted summary 日本語化 / live 不変」 ⇄ scripted fixture のみ修正(Unit-06)。実 claude 経路は不変。矛盾なし。
- **US-07**(multi-turn allowed): AC「server.ts allowed に multi-turn 追加 / happy fallback 解消 / 既存テスト green」 ⇄ allowed 配列追記 + 既存スイート green を非機能で担保(Unit-06)。矛盾なし。
- **US-08**(thread バッジ整合): AC「レビュー emit 後バッジがレビュー準備完了 / CTA と整合」 ⇄ S3 SCR-02 視覚契約(run→review トークン / `aidlc-docs/v0.0.5/s3/scr-02-conversation-thread.md` 確定済)に一致(Unit-06)。矛盾なし。
- **US-09**(dead code 削除): AC「StepConfigPage.tsx 削除 / build・tsc・playwright green」 ⇄ 削除 + green を非機能で担保(Unit-06)。矛盾なし。

## 次工程 (S5) への引き継ぎ
- **Work Units 分割で考慮すべき技術的制約**: US-02(ルート ledger)→ US-03(reconcile)は順序依存。US-04(seeded+証拠生成)は US-01(ゲート)の前提土台 → 並走/先行。US-05(probe)は US-01〜03 が触る注入経路・新 rule に乗る。
- **優先実装基盤**: ① _evidence manifest 構造 + done ゲート(US-01)② ルート ledger 移行 + §6 注入(US-02)。
- **技術的リスク**: 証拠形式(動画)の生成コスト/容量 → 既定は screenshot+log、動画は遷移 step のみ(US-04 で安価化)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか: (手戻り時に追記)
- 暫定の解決方針:
- 棄却した案とその理由:

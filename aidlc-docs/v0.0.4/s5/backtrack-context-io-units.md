# S5 再分割 — コンテキスト/IO 契約 + 設定ヒアリング(S8→S4 手戻り / 2026-06-14)

親: [index.md](./index.md) / 由来: [s4-tech-spec.md §C7](../s4-tech-spec.md) / ledger: [BT-01 / BT-02](../ledger.yml)

> S8 実機レビューで US-01 コンテキスト/IO 設計と US-06 設定ヒアリングフローの機能ギャップを検出し S4 へ手戻り。S4 §C7 で契約を設計し直したので、本書で Work Unit に再分割する。既存 Unit-01〜07 の一部を**置換/拡張**する(下表)。

## 既存 Unit との関係

| 既存 Unit | 本手戻りでの扱い |
|---|---|
| Unit-01 wire 契約 | **拡張** → `aidlc-result` 出力エンベロープへ(`aidlc-question` は `questions[]` に吸収)= BU-2 |
| Unit-02 前段文脈注入(パス列) | **置換** → 構造化コンテキスト resolver(DB+docs+file)= BU-1 |
| Unit-03 質問 emit | **吸収** → 出力は `aidlc-result.questions[]`(BU-2)。session-id parse(extractSessionId)は存置 |
| Unit-04 resume turn | **存置+整合** → resume 入力/出力が `aidlc-result`/`aidlc-answers` エンベロープに乗る |
| Unit-05 md 描画 | **存置+整合** → レビューは `aidlc-result` の artifacts/completeness/decisions から構造化して描く |
| Unit-06 会話スレッド UI | **拡張** → 設定ヒアリング(BU-3)の起動・回答・グローバル対応 |
| Unit-07 可変ステップ進捗 | 影響なし(存置) |

## 新 Work Unit(本手戻り)

### BU-1 — 構造化コンテキスト resolver(DB + docs + file)
- **責務**: §C7.1 の名前付きセクション列を、§C7.2 の 3 source(DB=対話状態/設定/run状態・docs=成果物・file=ledger)から引いて構造化コンテキストを組む。Unit-02 のパス列返却を置換。
- **触る**: [context-resolver.ts](../../../src/app/services/context-resolver.ts)(格上げ)/ [prompt-composer.ts](../../../src/app/services/prompt-composer.ts)(セクション列描画)/ repos port(questions/answers/cycle/project 読取)/ Fs port(成果物/ledger)。
- **I/F(案)**: `composeContext(input): StructuredContext` → セクション配列 `{role, methodology, productInvariant(brief), requirements, priorArtifacts[], decisionsLedger, dialogState, outputContract}`。欠落は可視マーカー。
- **依存**: なし(leaf 寄り)。出力契約(BU-2)の型を参照。
- **粒度/劣化**: 下記 per-step 粒度表 + §C7.3 劣化規則。

### BU-2 — `aidlc-result` 出力 protocol(質問・非質問を統一)
- **責務**: §C7.4。AI 出力を ` ```aidlc-result ` minified JSON 1 つに統一 schema 受領(`artifacts[]`/`questions[]`/`decisions[]`/`completeness`/`status`)。`status` で done/needs_human(レビュー)/stalled を分岐。成果物本文は md ファイル(パス参照)。
- **触る**: [src/wire/](../../../src/wire/)(`aidlc-result` schema + parse/validate / 純関数)/ [live.ts](../../../src/infra/orchestrator/live.ts)(出力走査を envelope 受領へ)/ [scripted.ts](../../../src/infra/orchestrator/scripted.ts)(同型エンベロープ返却 / C6 パリティ)/ engine/app(status ルーティング)/ web review(envelope から構造化描画 = Unit-05 整合)。
- **I/F(案)**: `parseAidlcResult(text): Result<AidlcResult, WireError>`。`AidlcResult = {artifacts: string[], questions: AidlcQuestion[], decisions: {...}[], completeness: {requirements, addressed}, status}`。
- **依存**: Unit-01 wire(既存 `aidlc-question` を内包)。
- **互換**: envelope 無し出力は可視エラー + 安全側フォールバック(原則④)。

### BU-3 — 設定ヒアリングフロー(US-06 / グローバル+サイクル)
- **責務**: §C7.6。「会話で直す」が**設定ヒアリング run を起動**(scope=global/cycle)→ AI が全ステップ設定の質問群を `questions[]` で出す → 回答(`aidlc-answers`)を **StepContracts へ書き込む app 経路**で保存(グローバル=project.pipelineDef / サイクル=cycle スナップショット)→ scr-04 で確認。グローバルは cycleId 必須を外す。
- **触る**: web settings(「会話で直す」起動 / グローバル thread ルート新設=現 `/settings/thread` dead route の解消)/ thread(cycleId optional の settings モード)/ app(設定ヒアリング run 起動 + 回答→contracts 書込サービス)/ orchestrator(設定ヒアリング run 種別 or scope 付き launch)。
- **依存**: BU-1(設定コンテキスト)/ BU-2(`questions[]` 出力)/ Unit-06(スレッド器)。
- **AC 紐付け**: US-06 AC(個別フォーム廃止 / 2 層 / 全文確認 / 会話で修正)を end-to-end 貫通(新 US-AC ゲートで検証)。

## 依存 DAG(着手順)
```
Phase 1(leaf): BU-2 出力 protocol(wire 純関数)  ← 最初に schema を確定
Phase 2:        BU-1 構造化コンテキスト resolver(BU-2 型を参照)
Phase 3:        BU-3 設定ヒアリングフロー(BU-1 + BU-2 + Unit-06)
```
クリティカルパス = BU-2 → BU-1 → BU-3。BU-2 の `aidlc-result` schema 確定が下流の前提。

## per-step コンテキスト粒度表(§C7.3 の宿題 / 各工程の入力)
常時セクション(全工程): brief / 確定US(S1後) / 決定+ledger / 出力契約 / 対話状態(ヒアリング時)。下表は**前段成果物**の選択と粒度。

| 工程 | 前段成果物(粒度) | 備考 |
|---|---|---|
| S1 要件 | なし(brief + task/scope のみ) | ヒアリング Q&A=対話状態 |
| S2 画面要素 | S1 index | |
| S3 UI設計 | S2 index + S1 index | |
| S4 技術仕様 | S3 index + S1 US | |
| S5 作業分割 | S4 全文 + S3 index + S1 US | |
| S6 ドメインmodel | **S5 unit 詳細** + S1 US | index だけでは Unit 詳細が落ちる |
| S7 ドメインcode | **S6 集約詳細** | |
| S8 統合 | **S3 モック(scr-NN.md + screenshots=path参照)** + S5 + S6 + S7 詳細 | モックは必須入力(画像は AI が view) |
| S9 シナリオ検証 | **S3 モック(path参照)** + S1 US + S8 | 視覚証拠の契約 |
| S10 受け入れ | S9 結果 + S1 US | |
| S11 振り返り | 全 done index + ledger | |
| S12 改善提案 | S11 | |

- **可変ステップ耐性**: 上表は「その工程が存在する時」の宣言依存。欠落工程(任意 S4/S9 不採用等)は done 集合から自動で外れスキップ(§C7.3)。
- **劣化**: 直前=詳細、古い段=index、閾値超過で段階縮退。不変/要件/決定セクションは縮退対象外。

## S6/S7 への引き継ぎ
- S6: `aidlc-result` / `StructuredContext` / 設定書込の型整合(既存集約で足りるか)。出力エンベロープはドメインでなく wire/app の関心(S6 D-02 境界踏襲)。
- S7: BU-2 の `aidlc-result` parse/validate を純関数で(wire モジュール)。
- S8: 実装後、**US-AC 機能フロー突合(新ゲート / operating-model Rule B)**で US-01・US-06 を end-to-end 検証してから確定。

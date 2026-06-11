# Unit-01: 型契約 & Profile レジストリ基盤

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-01](../s1/us-01-stepdef-contracts.md)(StepDef 契約 + Profile), [US-05](../s1/us-05-bugfix-dossier.md)(bugfix dossier プロファイル)
- Phase: Phase 1(leaf)
- レイヤ: `domain/`(純粋)
- ステータス: 確定

## 責務 (1〜2 行)
全ハーネス機能が参照する **宣言型の型語彙**を定義する純粋 domain。`StepDef` への 4 契約 + `execMode`(`domain/project/`)、成果物 Profile レジストリ + `coerceBlocks`(`domain/review/`)、その 1 エントリとしての bugfix dossier プロファイル。FS/DB/AI に触れない。

## 外部依存
- なし(leaf)。既存の `domain/shared/`(primitives / ids / vocab / result)と `domain/review/review.ts` の既存 `ReviewBlock` union のみ利用。

## I/F 定義 (この Unit が公開する契約)

### 1) StepDef 契約拡張(`domain/project/project.ts`)— US-01 / A
全 optional。既存 `StepDef`(契約なし)は従来動作。`validatePipeline`(非空 + id 一意)は不変、契約は検証対象外。

| 操作/型 | 入力 | 出力 | エラー |
|--------|------|------|--------|
| `StepContracts`(型) | — | `{ output?, verification?, humanGate?, escalation? }` | — |
| `StepDef` 拡張 | 既存 + `contracts?: StepContracts` + `execMode?: 'sequential'\|'parallel'` | 拡張型 | — |

- `output`: 成果物パス + 必須 block 集合(= Profile 参照)
- `verification`: evaluator が見る観点
- `humanGate`: 人間に渡すタイミング(視覚レビュー / 実機確認)
- `escalation`: 詰まった時の戻り先・retry 方針

### 2) 成果物 Profile レジストリ + coerceBlocks(`domain/review/`)— US-01 / G
| 操作/型 | 入力 | 出力 | エラー |
|--------|------|------|--------|
| `Profile`(型) | — | `{ taskKind, requiredBlocks: ReadonlySet<ReviewBlockType> }` | — |
| `profileRegistry` | `taskKind` | 対応 `Profile`(未知種別は既定/空) | — |
| `coerceBlocks(profile, blocks)` | Profile + `readonly ReviewBlock[]` | `{ kept: ReviewBlock[]; missing: ReviewBlockType[] }` | **throw しない**。未知 block 破棄 / 既知不足は `missing` で warn |

- 既存 `review.ts` の `KNOWN_BLOCK_TYPES` / `isKnownBlockType` / `MVP_BLOCK_TYPES` を土台に拡張(重複定義しない)。

### 3) bugfix dossier プロファイル(`domain/review/`)— US-05 / H
| 操作/型 | 入力 | 出力 | エラー |
|--------|------|------|--------|
| `BugfixDossierProfile` | — | 必須 block: `cause`(2層: 直接/根本)/ `impact` / `fix` / `prevention` / `video` | — |
| レジストリ登録 | `taskKind='bugfix'` | `profileRegistry` の 1 エントリ | — |

- `cause` は **2 層**(直接原因 + 根本原因)。`video` は **型と必須宣言のみ**(録画実体は v0.0.3)。

## 主な AC(US 由来)
- `contracts` / `execMode` optional 追加、4 契約タイプ定義、既存 155 tests 全 pass。
- Profile レジストリ + `coerceBlocks` 前方互換(未知 block 無視・既知不足 warn)。
- BugfixDossierProfile(cause 2層含む)登録、`coerceBlocks` で前方互換処理。
- 追加型の unit test **95%+ coverage**。

## この Unit 固有の 質疑応答ログ

### Q-01 — `coerceBlocks` の `missing` は warn 戻り値だけでよいか(ログ出力は呼び出し側に委ねる)
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  >

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — Profile の `requiredBlocks` は既存 `ReviewBlockType` を再利用する
- **理由**: 成果物 block の正本は `review.ts` の `ReviewBlock` union(summary/ac-map/mermaid/screenshot/test/coverage/risk/diff/video)。Profile はその部分集合を指す純粋データにする。block 型を二重定義しない。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

### D-02 — bugfix dossier の cause/impact/fix/prevention は block 型を追加せず構造化メタで表現
- **理由**: 既存 `ReviewBlock` に `summary`/`risk`/`diff` 等があり、dossier は「どの block が必須か」の Profile 制約として表現できる。新 block 型の追加は Unit-08(描画)の必要に応じて最小限にする(YAGNI)。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — StepDef 契約を専用テーブル/型ファイルに分離
- **棄却理由**: S4 D-01。編集導線(US-06)は既存 `customizePipeline` を使い、`pipelineDef` JSON 同居で足りる。新テーブルは serde/migration コスト増。

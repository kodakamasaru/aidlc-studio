# モデル: StepContracts(Step 契約)

## メタ
- 親: [s6/index.md](./index.md)
- 対応 US: [US-01](../s1/us-01-stepdef-contracts.md), [US-06](../s1/us-06-step-custom-ui.md)(編集対象の型として)
- 所属 Unit: [Unit-01](../s5/unit-01-contract-profile-foundation.md), [Unit-07](../s5/unit-07-step-custom-ui.md)
- 既存集約: Project(`domain/project/project.ts`)の `StepDef` を拡張(新集約ではない)
- ステータス: 確定

## モデル定義(DDD 採用 / Project 集約内の VO 拡張)

`StepDef`(Project 集約の構成要素)に optional な VO を 2 つ足す。**全 optional**で、契約なしの既存 StepDef は従来どおり動く。

- **StepContracts**(値オブジェクト): Step の振る舞い宣言。4 つの契約を内包。
  - `output`(OutputContract): 何を出すか = 成果物パス + 必須 block 集合(Profile 参照 → [artifact-profile](./artifact-profile.md))
  - `verification`(VerificationContract): 何で検証するか = evaluator が見る観点
  - `humanGate`(HumanGateContract): いつ人間に渡すか = 視覚レビュー / 実機確認 等
  - `escalation`(EscalationContract): 詰まったときの戻り先・retry 方針
- **execMode**(値オブジェクト / enum): `sequential | parallel`(optional)。

## 不変条件
- `contracts` / `execMode` はともに **optional**。欠落 = 従来動作(後方互換 / 155 tests 回帰)。
- 契約は `validatePipeline`(非空 + Step id 一意)の**検証対象に含めない**(optional のため、形式検証は既存のまま)。
- 契約の**正本(既定)**はコードの既定レジストリ、**上書き**は Project の `pipelineDef`(JSON)に同居。**新テーブル/新集約を作らない**(S4 D-01)。
- `output` の必須 block 集合は Profile の語彙を参照する(二重定義しない)。

## この集約固有の 質疑応答ログ

### Q-01 — 4 契約の中身(OutputContract 等)の具体フィールドは S6 で確定するか S7 実装時に詰めるか
- 提案: S6 では「4 契約の意味と不変条件」までを固定し、各契約の細かいフィールド(例: verification の観点リスト構造)は S7 実装時に最小から起こす(YAGNI)。本モデルの責務は「契約が optional・後方互換・pipelineDef 同居」の保証。
- **回答**(ユーザー記入):
  > OK(推奨どおり / 2026-06-11)。
- **確定**(AI 記入):
  > S6 は 4 契約の意味と不変条件まで固定。各契約の詳細フィールドは S7 実装時に最小から起こす。

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — StepContracts を Project 集約内の VO 拡張とし、新集約にしない
- **理由**: 契約は Step 定義の一部で、Step は Project の `pipelineDef` が保持。独立集約にするとライフサイクルが重複し event-sourced 整合が二重化する。S4 D-01(新テーブル不可)とも一致。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

---

## この集約固有の 棄却した案

### R-01 — 契約を required にして全 Step に強制
- **棄却理由**: US-01 R-01。既存 155 tests が全壊。段階移行(optional)に反する。

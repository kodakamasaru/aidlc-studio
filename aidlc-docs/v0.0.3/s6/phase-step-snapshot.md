# モデル: Phase の StepDef スナップショット(新規 / Cycle 集約拡張)

## メタ
- 親: [s6/index.md](./index.md)
- 対応 US: [US-02](../s1/us-02-step-definition-canonical.md)
- 所属 Unit: [Unit-02](../s5/unit-02-step-canonical-snapshot.md)
- ステータス: 確定
- 集約: **Cycle**(既存)。本書は `Phase`(Cycle 内エンティティ)を拡張する増分のみ。

## なぜモデル化するか
サイクル作成時、その時点の default step 定義を **ピン留め(snapshot)** し、以後 file default が変わっても既存サイクルの実行が分岐しないことを保証する(scope.md「per-cycle = DB snapshot / 作成時点で固定」)。現状 `Phase` は step **識別子だけ**を持ち、label/skillRef/contracts を持たないため、prompt 合成や表示が file の後変更に引きずられる(drift)。

## 現状(差分の起点)
- `Phase = { id, step, order, state, runs }`(`src/domain/cycle/cycle.ts:54`)— **step 定義の写しを持たない**。
- `createCycle` は `CreateCycleCmd.pipeline`(= `{ phaseId, step }[]`, `cycle.ts:132`)から Phase を作り、コピーするのは `{ id, step, order, state, runs }` のみ(`cycle.ts:145`)。
- → **snapshot フィールドが型に存在しない**。これを足すのが本モデルの核(S5 評価 AI 指摘 = 「snapshot は domain 変更を伴う」)。

## モデル定義 (DDD: Cycle 集約内 Phase エンティティの拡張)

### 追加 VO: `StepDefSnapshot`(Phase が持つ不変の写し)
| フィールド | 型 | 制約 | 意味 |
|----------|----|----|------|
| `skillRef` | `SkillRef` | 必須 | 実行する実スキル dir 名(実 dir / [step-canonical-set](./step-canonical-set.md) 由来) |
| `label` | `Text` | 必須 | 表示名の写し(作成時点)。※ web の正本ラベルとは別に「その時の値」をピン留めする |
| `contracts` | `StepContracts?` | optional | 4 契約(output/verification/humanGate/escalation)の写し。欠落 = 既定(後方互換) |
| `order` | `number` | 必須 | 工程順の写し |

> `id`(= `Step`)は既存 `Phase.step` がすでに保持。snapshot は **id 以外の定義(意味/振る舞い)**をピン留めする。`Phase.step` と `stepDef.<id 相当>` の二重持ちを避けるため snapshot 側に id は置かない。

### `Phase` 拡張
```
Phase = {
  id, step, order, state, runs,   // 既存
  stepDef?: StepDefSnapshot       // 追加(optional = 既存サイクルの後方互換)
}
```
- **optional の理由**: 既存 DB に居る Phase(snapshot 前に作られた行)を読んでも壊れない。新規 `createCycle` は必ず埋める。

### `CreateCycleCmd.pipeline` 拡張
```
pipeline: { phaseId, step, stepDef }[]   // stepDef を追加
```
- 呼び出し側(app `cycle-service.createCycle`)が、正本セット + per-cycle 上書きを解決した `StepDefSnapshot` を各 entry に詰める。ドメインの `createCycle` は **受け取った snapshot を Phase へ写すだけ**(解決ロジックは app / 副作用なし)。

## 不変条件
- **INV-S1(実体化)**: `createCycle` 後、新規 Phase は必ず `stepDef` を持つ(その時点の default + per-cycle 上書きの解決結果)。
- **INV-S2(不変・非波及)**: `stepDef` は作成後変更されない。file default([step-canonical-set](./step-canonical-set.md))の後変更は既存サイクルの `stepDef` に波及しない(ピン留め)。
- **INV-S3(後方互換)**: `stepDef` 欠落の既存 Phase は従来動作(`Phase.step` のみで実行可能)。snapshot は加法的拡張。
- **境界整合**: snapshot は「分岐しうる state の実体化」であって不変 truth の複製ではない(scope.md 統一原則 / index D-03)。ドメインは DB を知らず、フィールドを持つだけ。

## 状態遷移
- なし(snapshot は作成時に確定する不変データ。Phase の `state`(pending→running→review→done)は既存のまま変えない)。

## この集約固有の 質疑応答ログ

### Q-01 — snapshot に `label` を含めるか(web に正本があるのに二重では)
- 文脈: ラベル**正本**は web(S5 Unit-02 D-01)。だが snapshot は「作成時点の値の写し」であり、正本が後で変わっても当時の表示を再現するために value を固定したい。
- 提案: snapshot に `label` の**写し**を持つ(正本 = web、写し = snapshot。役割が違うので二重ではない)。表示は「そのサイクルの当時の label」を出せる。
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定: snapshot は当時値の写しを持つ。正本/写しの役割差で二重定義ではない。)

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — snapshot は `Phase.stepDef`(各 Phase 個別)に置く(Cycle 集約レベルの pipeline 写しにしない)
- **理由**: Phase は step と 1:1。Phase が自定義を自己完結で持てば `startPhase`/prompt 合成が Phase だけ見れば済む。Cycle に別 pipeline 写しを置くと `Phase.step` と二重管理になり drift する(index Q-01)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — `Phase.stepDef` は optional(後方互換)。解決ロジックは app、ドメインは写すだけ
- **理由**: 既存 DB 行(snapshot 前)を読んで壊さないため optional。正本+上書きの解決は副作用(ファイル read 等)を伴うため app(`cycle-service`)が行い、ドメイン `createCycle` は受領 snapshot を Phase へ写す純粋操作に留める(hexagonal / 純粋性維持)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-03 — snapshot に step `id` は重複させない(`Phase.step` を正とする)
- **理由**: `Phase.step` が既に id を保持。snapshot 側にも id を置くと不整合源になる。snapshot は id 以外の定義(label/skillRef/contracts/order)をピン留めする。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## この集約固有の 棄却した案

### R-01 — snapshot を取らず、実行時に常に file default を読む(ピン留めしない)
- **棄却理由**: file default が変わると既存サイクルの実行・表示が後追いで変わり、再現性が壊れる(scope.md の per-cycle pin 要件・S10 mock 乖離と同種の drift)。snapshot が要件。

### R-02 — Cycle に `pipelineSnapshot: StepDefSnapshot[]` を 1 つ持たせる(Phase ではなく Cycle 直下)
- **棄却理由**: Phase との対応付けに index 照合が要り、`Phase.step` と二重境界。Phase 個別保持(D-01)の方が一貫(R-01/index R-01 と整合)。
</content>

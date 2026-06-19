# S7 — 純粋ドメインコード 進行ログ — v0.0.3

## メタ
- 工程: S7 (Domain Code)
- PhaseGroup: Build
- 役割: ドメインエンジニア
- バージョン: v0.0.3
- ステータス: 確定
- 入力参照: [s6/index.md](./s6/index.md) / [s6/phase-step-snapshot.md](./s6/phase-step-snapshot.md) / [s6/step-canonical-set.md](./s6/step-canonical-set.md) / [s6/external-memory-pruning.md](./s6/external-memory-pruning.md)
- コード出力先: `src/domain/`
- 言語/テストランナー: TypeScript / `bun test`(決定的スイート)
- 作成日: 2026-06-12
- 更新日: 2026-06-12

> **このS7の性質**: S6 のドメイン増分(snapshot 新設 / step 正本値変更 / 死蔵削除)のうち、**ピュアドメインで完結し非破壊な追加・値変更のみ**を実装。**死蔵削除(Ledger/Conversation)は S8 へ送る**(下記 D-01: domain+app+infra+tests を跨ぐ原子的削除で、S7「ピュアドメインのみ」原則と中間ビルド破壊回避のため)。

## 実装一覧

| # | 対象モデル | コードパス | テストパス | 対応 US | 状態 |
|---|----------|----------|----------|--------|------|
| 1 | step 正本セット([step-canonical-set](./s6/step-canonical-set.md)) | `src/domain/shared/vocab.ts`(`SkillRef`/`CanonicalStep`/`CANONICAL_STEPS`/`skillRefOf`/`DEFAULT_STEPS` 値変更) | `src/domain/shared/shared.test.ts`(+4 test) | US-02 | 確定 |
| 2 | `StepDefSnapshot` VO([phase-step-snapshot](./s6/phase-step-snapshot.md)) | `src/domain/project/project.ts`(`StepDefSnapshot` 新設 / `SkillRef` を vocab へ移設 re-export) | (型 / 利用は #3 で検証) | US-02 | 確定 |
| 3 | `Phase.stepDef?` + `createCycle` 写し通し | `src/domain/cycle/cycle.ts`(`Phase`/`CreateCycleCmd.pipeline`/`createCycle`) | `src/domain/cycle/cycle.test.ts`(+2 test) | US-02 | 確定 |
| — | Ledger/Conversation 削除 | (S8 へ / D-01) | — | US-01 | **S8 送り** |
| — | US-03/04/05(PromptComposer/Fs.read/completeness parse/screenshot) | (app/infra = S8) | — | US-03/04/05 | **S8(ドメイン増分なし / S6 D-02)** |

### 実装の要点(不変条件のコード化)
- **INV-C1(集合の単一正本)**: `DEFAULT_STEPS = CANONICAL_STEPS.map(c => c.id)`。独立配列を残さず正本セットの id 射影に。
- **INV-C2(skillRef 実在)**: `CANONICAL_STEPS` の 12 skillRef は `kit/skills/` 実在 dir(評価 AI 全件照合済 / S6)。`skillRefOf(step)` で純粋解決(未知 step → `undefined`)。
- **S2.5 退役**: `DEFAULT_STEPS` から S2.5 が消える(`not.toContain("S2.5")`)。`Step` は branded string のままなので S2.5 を含む既存サイクルは読める(型禁止しない / S6 R-02)。
- **INV-S1/S3(snapshot 写し・後方互換)**: `Phase.stepDef?` は optional。`createCycle` は受領 snapshot を**写すだけ**(`...(s.stepDef ? { stepDef: s.stepDef } : {})`)。省略時 `undefined`(従来動作)。解決ロジックはドメインに無い(app / S8)。

## 純粋性チェックログ
| 日付 | チェック対象 | 検出された違反 | 対応 |
|------|------------|--------------|------|
| 2026-06-12 | vocab.ts / project.ts / cycle.ts | なし(`bun:`/`hono`/`react`/`db`/`http`/`sqlite` import 0 / grep 確認) | — |
| 2026-06-12 | cycle.ts→project.ts の新規 import(`StepDefSnapshot`) | 循環依存の懸念 | project→cycle 参照 0 を確認(非循環)。typecheck/test green |
| 2026-06-12 | createCycle の snapshot 写し | ドメインで解決(副作用)していないか | 写すだけ。解決(正本+上書き)は app に残す(S6 D-02 遵守) |

## 回帰結果
- **ドメイン単体**: `bun test src/domain` → **127 pass / 0 fail**(snapshot 2 + canonical 4 の新規含む)。
- **全回帰**: `bun test src tests/integration` → **240 pass / 0 fail**(ベースライン 235 → 追従後 240)。
- **step 直接参照 test の追従**(S6 引き継ぎ「step を直接参照する test/fixture のみ追従」): `api.test.ts` の default step 数 8→12(2 箇所)+ S2.5 decode テストを「dotted セグメント decode → 退役で StepNotInPipeline(400)」へ再framing(decode coverage 不減)。
- **typecheck**: `src` にエラー 0(既存の `scripts/s3-v003-capture.ts` の DOM lib エラーは S7 と無関係 / S3 既存)。

## 質疑応答ログ

### Q-01 — (なし。S6 で内部判断は evaluator 裁定済。S7 は実装のみ)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > 

---

## AI が独自に決めたこと と 理由

### D-01 — 死蔵削除(Ledger/Conversation)は S7 では行わず S8 へ送る
- **理由**: 削除は `domain`(external-memory/ids)+`app/ports`(repos/composition/sys)+`infra`(db/sys)+`tests` を**跨ぐ原子的変更**。S7「ピュアドメインのみ・src/domain 限定」原則に反し、domain だけ消すと中間ビルドが壊れる。統合層を触る S8 で一括除去するのが筋(S6 [external-memory-pruning](./s6/external-memory-pruning.md) INV-P1 = S7/S8 完了条件)。**黙って送らず明示記録**(原則#6)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — `SkillRef` を `project.ts` から `shared/vocab.ts` へ移設(project は re-export)
- **理由**: 正本セット(`CANONICAL_STEPS`)が「id + skillRef」を 1 箇所に持つ(INV-C1)には、`Step`(vocab)と `SkillRef` が同じ低層に居る必要がある。`vocab`(最下層)は `project` を import できない(循環)ため `SkillRef` を vocab へ移す。既存 `import { SkillRef } from project` 互換のため project.ts で `export type { SkillRef } from vocab` re-export(非破壊 / app・tests の import 変更不要)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-03 — `StepDefSnapshot` は `project.ts`(StepDef 隣)に置き cycle.ts が import
- **理由**: snapshot は「StepDef の写し」で step 定義概念。StepDef と co-locate が自然。cycle.ts(Phase)が `type` import(cycle→project の非循環 edge)。SkillRef/StepContracts/Text を cycle.ts に個別 import するより凝集が高い。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-04 — `skillRefOf(step)` 純粋ヘルパーを vocab に追加(app の偽 skillRef 是正の土台)
- **理由**: app `defaultPipeline()` の偽 `aidlc-${step}` を正本由来へ差し替える(S8)際、ドメイン側に「step→実 skillRef」の純粋解決を 1 つ用意しておくと app は副作用なく引ける。未知 step は `undefined`(silent 失敗にしない / 呼び側が判断)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## 棄却した案

### R-01 — `SkillRef` を project.ts に残し `CANONICAL_STEPS` を project.ts に置く
- **棄却理由**: そうすると `DEFAULT_STEPS`(vocab)が project の正本セットを import できず(循環)、単一正本(INV-C1)が崩れる。SkillRef を最下層へ移すのが正しい依存方向。

### R-02 — S7 で死蔵削除まで一気にやる(app/infra も S7 で触る)
- **棄却理由**: S7 のピュアドメイン原則違反(`src/domain` 限定)。統合層の変更は S8 の責務。D-01 参照。

## 次工程 (S8) への引き継ぎ
- **S5 I/F と突き合わせる公開関数**: `skillRefOf` / `StepDefSnapshot` / `Phase.stepDef` / `CreateCycleCmd.pipeline[].stepDef`(Unit-02 の app 解決がここに写しを詰める)。
- **技術層が実装すべきポート/配線(S8)**:
  - **snapshot 解決**: `cycle-service.createCycle` が「正本セット + per-cycle 上書き」を解決し `pipeline[].stepDef` に `StepDefSnapshot` を詰める(現状 `{phaseId, step}` のみ渡している)。
  - **偽 skillRef 是正**: `project-service.defaultPipeline()` の `skillRef: aidlc-${step}` / `label: step` を `skillRefOf`/web ラベル由来へ(Unit-02)。
  - **死蔵削除(Unit-01 / D-01)**: [external-memory-pruning](./s6/external-memory-pruning.md) の削除対象表の全波及点(domain/app-ports/infra-db/infra-sys/tests/migrations)を一括除去。`Ledger*`/`Conversation*`/`LedgerEntryId` 参照 0 を達成。
  - **US-03/04/05**: PromptComposer 新設 + `Fs.read` 追加 / live completeness parse → 既存 `CompletenessBlock` / verify-ui screenshot(`Bun.spawn`)。
- **ドメインが前提とする不変条件(技術層で壊さないこと)**: INV-C1(DEFAULT_STEPS は正本射影)/ INV-S2(snapshot は作成後不変・file 後変更非波及)/ snapshot 解決は app、ドメインは写すだけ。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (なし。本サイクル内で S6 から順送り)

## 評価AIレビュー記録 (確定前 proactive / [[dogfood-harness-principles-on-this-repo]])
- **実施**: 2026-06-12、typescript-reviewer を敵対的レビュアーとして起動。未コミット差分を 10 項目×実コード(Read/grep/`ls kit/skills`/`bun test` 実走)で裏取り。
- **総合判定: SOUND(10/10 PASS / 修正必須なし)**。
  - 純粋性(DB/HTTP/UI import 0・createCycle 写しに副作用なし)/ 非循環(shared←project←cycle 一方向)/ SkillRef 移設の非破壊(全 import が type-only・`export type` re-export で解決)/ INV-C1(DEFAULT_STEPS = CANONICAL_STEPS 射影・二重定義なし)/ INV-C2(skillRef 12 件 `kit/skills/` 全件一致)/ skillRefOf 健全(未知→undefined・TDZ なし)/ 後方互換(stepDef optional・省略時 undefined・id 重複なし)/ テスト追従が緩めでなく再framing(decode coverage 不減)/ 死蔵削除が差分に無く D-01 で明示 S8 送り/ 回帰 240 pass・`toHaveLength(8)` 残存 0。
- **補足(修正不要 / S8 認識)**: `project-service.defaultPipeline()` の偽 skillRef ダブルキャストは**既存コード**で S7 が新規導入したものではない。S7 は是正の土台(`skillRefOf`)を置き、S8 引き継ぎに正規ルートを明記済。
- **前ステップとの差**: S4/S5/S6 は初版に虚偽/誤配置があり是正したが、S7 は**初版から SOUND**(S6 で配置・存在・波及を grep 裏取り済の設計に沿って実装したため)。確定前レビューが「緩めて通しただけ」でないことの担保にもなった。
</content>

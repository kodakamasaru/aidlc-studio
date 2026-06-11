# Unit-02: Prompt 2層 Composer

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-04](../s1/us-04-prompt-config.md)(Prompt 2層構成 / F)
- Phase: Phase 2
- レイヤ: `app/`(共有ポート/サービス新設)
- ステータス: 確定

## 責務 (1〜2 行)
gen/eval 両アダプタが共有する **app 層の `PromptComposer`**。Core(常時)+ Step Payload(遅延)の 2 層でプロンプトを組み立て、role(generator/evaluator)で payload を出し分ける。per-adapter の `buildPrompt` をここに集約する(S4 §5)。

## 外部依存
- **Unit-01**: `StepDef` / `SkillRef`(どの skill を遅延 Read するか)を読む。
- 既存: `kit/skills/aidlc-sN`(SKILL.md)を `sys` ポート経由で **遅延 Read**。brief / 直前 Step サマリ / ユビキタス言語を Core に集約。
- 利用される側: Unit-03(Engine)/ Unit-04(live resume)が Composer を通る。

## I/F 定義 (この Unit が公開する契約)

| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| `PromptComposer.compose(req)` | `{ step, role, briefRef, prevStepSummary?, vocab, inputArtifacts?, generatorOutputRef?, verification? }` | 組み立て済みプロンプト(Core + role 別 payload) | Step Payload(skill)欠落時は `Result` err(gate と整合) |

- **Core 層(常時)**: brief / 直前 Step の成果物サマリ / ユビキタス言語。
- **Step Payload 層(遅延)**: 当該 Step の SkillDef(`kit/skills/aidlc-sN` をその Run 起動時に初めて Read)+ 入力成果物。
- **role 出し分け**: `gen` = SkillDef + 入力成果物 / `eval` = generator の output + verification 契約。
- scripted は Payload を固定文に差し替え可(決定論)、live は実ファイル Read。**両者が同じ Composer を通る**。

## 主な AC(US 由来)
- Core(常時)/ Step Payload(遅延)の 2 層化。
- gen 用と eval 用で payload 内容が異なる。
- 遅延ロードが lazy に機能することをテストで確認。既存 155 tests 全 pass。

## この Unit 固有の 質疑応答ログ

### Q-01 — `compose` の戻りは「文字列1本」か「Core/Payload を分けた構造体」か(scripted 差し替え容易性に効く)
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  >

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — `PromptComposer` を `app/ports/` に新設し、Read は `sys` ポート経由で注入する
- **理由**: 遅延 Read(skills/成果物)は副作用なので app 層に置き、FS は `sys` ポートで注入する。これで純粋部(組み立てロジック)を fake `sys` で unit テストでき、scripted/live が同一実装を共有できる(S4 R-02 回避)。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — 各アダプタの `buildPrompt` 内に 2 層構成を閉じる
- **棄却理由**: S4 R-02。scripted/live で組み立てが二重化し整合維持コストが残る。共有 Composer に集約する。

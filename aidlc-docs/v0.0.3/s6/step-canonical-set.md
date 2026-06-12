# モデル: step 正本セットの単一正本化(値変更)

## メタ
- 親: [s6/index.md](./index.md)
- 対応 US: [US-02](../s1/us-02-step-definition-canonical.md)
- 所属 Unit: [Unit-02](../s5/unit-02-step-canonical-snapshot.md)
- ステータス: 確定
- 集約: 横断(`shared/vocab` の集合定数 + `Project.StepDef` の構築元)。**新集約は作らない**。

## なぜモデル化するか
「どの工程が在るか + 各工程が指す実スキル」の正本が **コード/web/DB で 5 箇所食い違い**(scope.md)、live prompt 合成で「読むソースと表示ソースのズレ」を生む。正本を **file 単一 constant** に一本化し、`DEFAULT_STEPS`・web step-label・偽 skillRef をそこへ従属化する。これは型の形状変更ではなく **正本セットの値と所有の是正**。

## 現状(差分の起点)
- `DEFAULT_STEPS`(`src/domain/shared/vocab.ts:45`)= `["S1","S2","S2.5","S3","S4","S5","S6","S7"]`(**8 工程・S2.5 含む**)。id だけで skillRef を持たない。
- `project-service.defaultPipeline()`(`src/app/services/project-service.ts:38-45`)が default StepDef を構築するが:
  - `label: step as string`(= "S1" 等。**表示名ではない死蔵**)
  - `skillRef: \`aidlc-${step}\``(= "aidlc-S1"。**実在 dir は `aidlc-s1-requirements`。偽リンク**)
- `shared.test.ts:65`(`DEFAULT_STEPS is the AI-DLC S1..S7 pipeline`)が現値を直接アサート。
- → 正本が一本化されておらず、skillRef が実在 dir と乖離。

## モデル定義 (DDD: 既存 VO の値/所有の是正)

### 正本セット(canonical step set)= file 単一 constant
**何が在るか + 各工程の実 skillRef** を 1 つの domain 定数で保持する。表示ラベルは含めない(web 所有 / S5 Unit-02 D-01)。

| 工程 | id | skillRef(実 dir) |
|---|---|---|
| 要件 | S1 | `aidlc-s1-requirements` |
| 画面要素 | S2 | `aidlc-s2-wireframe` |
| UI デザイン | S3 | `aidlc-s3-ui-design` |
| 技術仕様 | S4 | `aidlc-s4-tech-spec` |
| 作業単位 | S5 | `aidlc-s5-work-units` |
| ドメインモデル | S6 | `aidlc-s6-domain-model` |
| ドメインコード | S7 | `aidlc-s7-domain-code` |
| 実 PJ 統合 | S8 | `aidlc-s8-integration` |
| シナリオ検証 | S9 | `aidlc-s9-scenario-validation` |
| 人間受け入れ | S10 | `aidlc-s10-human-acceptance` |
| 振り返り | S11 | `aidlc-s11-retrospective` |
| プロセス改善 | S12 | `aidlc-s12-workflow-improvement` |

- **v2 12 工程**(`kit/skills/aidlc-sN` の実在 dir と 1:1)。**S2.5 退役**(旧 8 工程セットから除去)。skillRef は実在 dir 名に揃える(上表は `kit/skills/` の実在 dir と一致 / 確認済)。

### 従属化(正本から導出するもの)
| 従属先 | 現状 | 是正後 |
|---|---|---|
| `DEFAULT_STEPS`(vocab) | 8・S2.5 込・id のみ | 正本セットの id 射影(v2 12) |
| `project-service.defaultPipeline()` skillRef | `aidlc-${step}`(偽) | 正本セットの実 dir skillRef |
| web step-label | (web 側 label) | 正本セットの id に対応する表示名を web が保持(集合は正本、表示文字列は web) |

## 不変条件
- **INV-C1(集合の単一正本)**: 「在る工程の集合」と「各工程の skillRef」の正本は 1 箇所。`DEFAULT_STEPS`・defaultPipeline・web は導出物であり、独自に集合や skillRef を組まない。
- **INV-C2(skillRef 実在)**: 各 skillRef は `kit/skills/` の実在 dir 名(偽リンク禁止)。実在性の検証は起動時の app/infra(ファイル系)が担い、ドメインは「実 dir 名であるべき」という規約のみ持つ。
- **INV-C3(ラベルは web)**: 表示文字列は domain に入れない(domain は集合 + skillRef + branded id のみ / S5 Unit-02 D-01)。
- **INV-C4(step 可変)**: step 数は可変(ROADMAP / 2026-06-12 ユーザー確定「ステップは可変」)。本変更は **rigid な移行ではなく default テンプレート値の更新**。app は可変 step を generic に扱い、回帰面は step を直接参照する test/fixture に限定。

## この集約固有の 質疑応答ログ

### Q-01 — S2.5 退役で「旧 S2.5 で作られた既存サイクル」をどう扱うか
- 文脈: 正本セットから S2.5 を除いても、過去に S2.5 を含む pipeline で作られた Cycle は DB に居る可能性。`Step` は branded string なので未知 id でも型上は通る。
- 提案: **正本セットの変更は新規サイクルの default にのみ効く**([phase-step-snapshot](./phase-step-snapshot.md) の snapshot で既存サイクルは自分の写しを使う)。既存サイクルの S2.5 Phase は snapshot/`Phase.step` で従来どおり動き、正本セット変更に影響されない(INV-S2 と整合)。よって退役は破壊的でない。
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定: 退役は新規 default のみに作用。既存サイクルは snapshot で不感。破壊的でない。)

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — 正本セット(集合 + skillRef)は domain に置き、ラベルは web に置く
- **理由**: 集合と skillRef は domain identity(branded `Step`/`SkillRef`)で domain が自然。ラベルは UI 関心事で web。層を汚さず二重定義を消す(S5 Unit-02 D-01 / S4 評価 AI 指摘の踏襲)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — `DEFAULT_STEPS` は正本セットの id 射影に置換(別定義として残さない)
- **理由**: 「在る工程」の正本は 1 つ。`DEFAULT_STEPS` を独立配列のまま残すと再び 2 箇所定義になり drift する。正本セットから導出する形にして単一正本を担保(INV-C1)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-03 — skillRef 実在性は規約 + 起動時 app/infra 検証(domain は文字列規約のみ)
- **理由**: ファイル実在チェックは副作用で domain 外(hexagonal)。domain は「実 dir 名であるべき」という規約(branded `SkillRef`)を持ち、実在検証は起動時の app/infra が行う(`openProject` の RepoNotFound と同じ分担 / project.ts コメント)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## この集約固有の 棄却した案

### R-01 — 正本セットを web(または DB)に置く
- **棄却理由**: step は実行単位の identity で domain 概念。web/DB に置くと domain が自分の工程集合を外部に依存し、純粋性と branded type の意味が崩れる。

### R-02 — S2.5 を `Step` から物理削除して未知 id をエラーにする
- **棄却理由**: `Step` は per-PJ 可変の branded string(既存設計 / vocab.ts:37 コメント)。特定 id を型で禁止すると可変性(INV-C4)に反し、S2.5 を含む既存サイクルが読めなくなる。退役は「default から外す」に留める(Q-01)。
</content>

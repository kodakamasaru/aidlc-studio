# Unit-07: Project & Config

## メタ
- 親: [s3/index.md](./index.md)
- 所属 US: [US-22](../s1/us-22-env-config.md), [US-25](../s1/us-25-repo-switch.md), [US-26](../s1/us-26-vision-manage.md), [US-27](../s1/us-27-step-definition-custom.md)
- ステータス: 確定
- MVP: —(v0.0.x)

## 責務 (1〜2 行)
横断設定 Unit。対象リポ(PJ)切替(US-25)、ビジョン=brief 相当の作成・管理(US-26)、env 設定(US-22: 対象リポ path / モデル / セルフホスト・絶対パス埋め込み禁止)、ステップ定義カスタム(US-27: S1〜S7 を固定とせずパイプライン構成を変更)。全 Unit が read する設定の単一窓口。

## 外部依存
- **env / 設定ファイル**: ローカルセルフホスト設定を read/write。
- aidlc-docs の `brief.md`: ビジョンの真実 source(Unit-05 と共有、ここでは編集 I/F を提供)。
- 他 Unit から read される側(供給専用、内部 Unit を呼ばない)。

## I/F 定義 (この Unit が公開する契約)

### state / 型
```
ProjectConfig { id, name, repoPath, activeVersion?, modelId, createdAt }
EnvConfig     { repoPath, modelId, stallTimeoutMin, worktreeRoot, notifyChannel? }  // 絶対パス埋め込み禁止
Vision        { projectId, path(brief.md), updatedAt }
StepPipeline  { projectId, steps: Step[](既定 S1..S7), editable }
```
> repoPath 等は env/設定由来で、成果物・コードに literal 埋め込みしない(セルフホスト要件)。日付 ISO-8601。

### 操作
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| listProjects / switchProject | { projectId } | ProjectConfig(active) | ProjectNotFound |
| readEnv / updateEnv | { patch } | EnvConfig | MissingRequiredEnv / AbsolutePathLeak |
| readVision / editVision | { projectId, patch } | Vision | — |
| getStepPipeline / setStepPipeline | { projectId, steps } | StepPipeline | InvalidStepGraph |

### 状態スコープ / step カスタム(確定)
- studio store は **1 store を `projectId` でスコープ**(PJ ごとに Cycle/Run/HumanTask を projectId で分離フィルタ)。
- step 定義は **既定 S1〜S7 固定**、`StepPipeline.editable` を可変点として予約。UI 化(US-27)は優先度低で後回し。

## この Unit 固有の 質疑応答ログ

### Q-01 — リポ切替(US-25)時の状態スコープ
- PJ ごとに studio store(Cycle/Run/HumanTask)を分離するか、1 store に projectId で混在させるか。Backlog の PJ 切替のような体験を満たす最小構成は?
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > **1 store を projectId でスコープ**(混在保持 + フィルタ)で確定。PJ 物理分離はせず、切替は activeProject の変更で表現。

### Q-02 — ステップ定義カスタム(US-27, 優先度低)はどこまで I/F に残すか
- MVP〜当面は S1〜S7 固定。可変点(StepPipeline.editable)だけ I/F に予約し UI 化は後回し、で十分か。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > **可変点(`StepPipeline.editable`)だけ I/F に予約・UI 化は後回し**で確定。当面 S1〜S7 固定で運用。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — 設定を横断 Unit に集約し各 Unit は read only で参照
- **理由**: 絶対パス・モデル名・stall timeout 等が各 Unit に散ると セルフホスト要件(US-22)を破る。単一窓口にして env からのみ注入。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-02 — Vision(brief)は aidlc-docs を真実とし、ここは編集 I/F のみ
- **理由**: brief.md は全バージョン共通の 1 成果物。内容の真実は aidlc-docs(Unit-05 が read)、Unit-07 は projectId との紐付けと編集導線を提供。二重管理しない。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — 各 Unit が直接 env を読む
- **棄却理由**: 設定の検証(絶対パスリーク検出・必須欠落)が分散し、セルフホスト要件を機械担保できない。1 窓口に集約。

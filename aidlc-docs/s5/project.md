# 集約: Project(コンテキストルート)

## メタ
- 親: [s5/index.md](./index.md)
- 対応 US: [US-22](../s1/us-22-env-config.md), [US-25](../s1/us-25-repo-switch.md), [US-26](../s1/us-26-vision-manage.md), [US-27](../s1/us-27-step-definition-custom.md)
- 所属 Unit: [Unit-07](../s3/unit-07-project-config.md)
- ステータス: 確定
- MVP: △(MVP は単一 Project 固定でも回る。複数切替=US-25 は v0.0.x)

## モデル定義 (DDD 採用)

**集約ルート**: `Project`(全集約のコンテキストルート。Backlog と Cycle 群を束ねる境界)

```
Project (集約ルート)
 ├─ id: ProjectId
 ├─ repoPath: RepoPath        // VO: 対象リポの場所(env 由来、絶対パス埋め込み禁止)
 ├─ vision: VisionRef         // brief.md(完成ビジョン)への参照
 ├─ pipelineDef: StepDef[]    // ★PJ ごとの工程定義(意味/数/対応 skill)。既定 S1〜S7、US-27 でカスタム
 ├─ env: EnvConfig            // モデル名 / worktreeRoot / stall タイムアウト / 最大 attempt 等
 └─ createdAt: Instant
 // 配下: Task[](Backlog) と Cycle[] は ID 参照で属する(projectId)

StepDef (値オブジェクト / 1 工程の定義)
 ├─ id: StepId                // S1|S2|S2.5|… 既定セット、または PJ 独自 id
 ├─ label: Text               // 工程の意味(ドメインモデリング 等)
 ├─ order: int                // 並び
 └─ skillRef: SkillRef        // 対応する kit/skills(aidlc-sN)or PJ 独自スキル
```

### 値オブジェクト
- `RepoPath`: 対象リポの場所。**env から注入**(`絶対パス埋め込み禁止` = セルフホスト要件 S1/S3)。
- `VisionRef`: Vision(brief)の参照。内容は外部記憶(aidlc-docs)側に在る。
- `EnvConfig`: モデル名 / worktreeRoot / stall タイムアウト(分)/ 最大 attempt(既定 3)等の横断設定。全集約が read する。
- `StepDef`: 1 工程の定義(意味・並び・対応スキル)。**ステップの意味も数も PJ ごとに変わりうる**(ユーザー指摘)ため、ここに per-PJ で保持する。

### パイプライン:定義は Project / 実体は Cycle
- **定義(テンプレート)= Project の `pipelineDef`**。ステップの意味・数・対応スキルは PJ ごとに可変(US-27)。MVP は既定 `[S1,S2,S2.5,S3,S4,S5,S6,S7]`(kit/skills/aidlc-sN にマッピング)。
- **実体(instance)= Cycle の `phases[]`**。`createCycle` 時に **その Project の `pipelineDef` から phases を instantiate**([cycle.md](./cycle.md))。先の「pipeline は Cycle が持つ」は instance の話で、定義(Project)と両立する。

## 操作

| 操作 | 入力 | 出力 / 効果 | エラー |
|------|------|------|--------|
| openProject | { repoPath, env } | Project(env 検証込み) | RepoNotFound / MissingRequiredEnv |
| switchProject | { projectId } | アクティブ Project 切替(US-25) | ProjectNotFound |
| setVision | { visionRef } | Project(vision 更新) | — |
| readConfig | { } | EnvConfig(全集約が参照) | — |
| readPipeline | { } | StepDef[](createCycle が phases 生成に参照) | — |
| customizePipeline | { steps: StepDef[] } | Project(pipelineDef 更新)※US-27 / v0.0.x、MVP は既定 S1〜S7 固定 | EmptyPipeline / UnknownStep |

## 不変条件
- **INV-1**: `repoPath` / モデル名等は **env 由来**でコードに絶対パスを埋め込まない(セルフホスト要件。S3 アーキ前提)。起動時に必須 env の存在を検証(MissingRequiredEnv)。
- **INV-2(定義は Project / 実体は Cycle)**: パイプラインの**定義 `pipelineDef`(ステップの意味・数・対応スキル)は Project が per-PJ で保持**(D-03)。**実体 `phases[]` は Cycle が所有**し、createCycle が Project の `pipelineDef` から instantiate。`pipelineDef` は非空・各 StepDef は一意 id。MVP は既定 S1〜S7、カスタムは US-27(v0.0.x)。
- **INV-3**: Cycle / Task は**必ず 1 つの Project に属す**(projectId 必須)。Version の一意性は **Project 内**スコープ(別 Project では同 Version 可)。
- **INV-4**: Project は config の真実を持つが、成果物・Vision の**内容**は外部記憶(aidlc-docs)に在り複製しない(参照のみ)。

## この集約固有の 質疑応答ログ

### Q-01 — Project をコンテキストルート(集約)に昇格させる範囲でよいか?
- 観点: Q-02 のユーザー提案で Project を top-level に。横断設定(repo/vision/env)を保持し、Backlog・Cycle を束ねる境界とした。Version 一意性も Project スコープに格上げ(複数リポで版番号が衝突しない)。MVP は単一 Project 固定で回る想定。この範囲でよいか。
- **回答**(ユーザー記入):
  > pipeline は Cycle が持っているのでは?
- **確定**(AI 記入):
  > 指摘を反映(2 段階)。① **pipeline の実体(phases)は Cycle が所有**(最初の指摘)。② さらに「**ステップの意味・数も PJ ごとに変わりうる**」との認識を受け、**pipeline の定義 `pipelineDef`(StepDef[])を Project が per-PJ で保持**(D-03)。createCycle は Project の `pipelineDef` から phases を instantiate。MVP は既定 S1〜S7、カスタムは US-27(v0.0.x)。Project の保持は **repo / Vision / pipelineDef / env**。Version 一意は Project 内スコープ。MVP は単一 Project 固定で可。

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — Version の一意性スコープを「Project 内」にする
- **理由**: 複数リポ(Project)を切り替える(US-25)と、別リポで同じ `v0.0.1` を使うのは自然。グローバル一意にすると衝突する。Version 一意は Project 内に限定し、Cycle は projectId + version で識別する。
- **判断**(ユーザー記入): 承認(Q-01 確定に同梱)
- **上書き内容**(上書き時のみ):

### D-02 — env(設定値)を Project の VO として集約に内包(横断 read)
- **理由**: S3 D-05「Config を横断設定 Unit として独立」をクリーンアーキで再配置。設定はドメインの一部(上限 attempt / stall タイムアウトは Run の不変条件に影響)なので Project 集約が持ち、各 use-case が `readConfig` で参照。秘密値・パスの実体注入は adapter(S7)。※ pipeline は env に含めない(Cycle 所有、Q-01)。
- **判断**(ユーザー記入): 承認(Q-02 フォローで「Project 集約の値にする」を選択)
- **上書き内容**(上書き時のみ):

### D-03 — ステップ定義(意味・数・対応スキル)を Project の `pipelineDef` として per-PJ 保持
- **理由**: ユーザー指摘「ステップの意味とか数も PJ ごとに変える可能性ある」。AI-DLC の S1〜S7 を全 PJ 共通の固定列挙にすると、別方法論を採る PJ(工程数違い・独自工程)に対応できない。**工程の定義は Project が per-PJ で持ち**(StepDef[] = id/label/order/skillRef)、Cycle はそこから phases を instantiate する。MVP は既定 S1〜S7(kit/skills/aidlc-sN)で固定、カスタム化 UI は US-27(v0.0.x)。これで「成果物内容は取り込まず(参照主体)」かつ「方法論は per-PJ 可変」を両立。
- **判断**(ユーザー記入): 承認(「定義=Project / 実体=Cycle」を選択)
- **上書き内容**(上書き時のみ):

---

## この集約固有の 棄却した案

### R-01 — Config を集約にせず単なるグローバル定数にする
- **棄却理由**: stepPipeline / 最大 attempt / stall タイムアウトは Cycle/Run の不変条件に効くドメイン値。グローバル定数にすると複数 Project 切替(US-25)で破綻し、テストでも差し替えにくい。Project 集約の VO にして port 経由で注入する。

# S4 — 技術仕様(v0.0.2 差分の技術契約)

## メタ
- 工程: S4 (Tech Spec)
- PhaseGroup: Design
- 役割: ソフトウェアアーキテクト
- バージョン: v0.0.2
- ステータス: 確定
- 入力参照:
  - [brief.md](../brief.md)
  - [scope.md](./scope.md)
  - [s1/index.md](./s1/index.md)(US-01〜09)
  - [s2/index.md](./s2/index.md)
  - [s3/index.md](./s3/index.md)
- 作成日: 2026-06-11
- 更新日: 2026-06-11

> **このS4の方針(粒度)**: スタックは v0.0.1 で確定済み(再選定しない)。本書は **v0.0.2 ハーネス追加(scope A〜K / US-01〜09)を「どう作るか」の技術契約**に絞る。各追加分が既存 hexagonal 構造の **どのファイル・どのレイヤ**に乗るか、拡張点と不変条件を明文化し、S5(Work Units)が迷わず分割できる状態にする。
>
> **設計正本の所在**: scope.md が参照する `design/quality-harness.md` は現状リポに不在。設計詳細の正本は **US-01〜09 + scope.md** とし、本書はそれを技術面に翻訳したもの。

---

## 1. 既存スタック(確定済み・再選定しない)

| 層 | 採用 | 備考 |
|------|------|------|
| ランタイム / PM | Bun | `bun:sqlite` / `Bun.spawn` を利用。Node 互換 API は `node:fs` 等で使用 |
| HTTP | Hono | `src/infra/http/` |
| 永続化 | SQLite(`bun:sqlite`) | studio の run/HumanTask 状態 store。**真実の source は `aidlc-docs/`(各PJ側)** |
| フロント | React + Vite | `web/` |
| E2E / 視覚 | Playwright | `tests/e2e/` + verify-ui screenshot |
| 言語 | TypeScript | branded type + 自前 `Result<T,E>`(`src/domain/shared/result.ts`) |
| アーキ | Hexagonal(ports/adapters)+ event-sourced | domain 純粋 / app= port+service / infra=adapter |
| AI 実行 | OrchestratorPort の 2 アダプタ | `scripted`(決定論)+ `live`(local Claude CLI `claude -p`)。**API ではなくローカル CLI** |

**v0.0.2 で増える runtime 依存: なし**。検証は既存の branded type + `Result` パターンで行い、新規バリデーションライブラリ(Zod 等)は導入しない(既存 155 tests と整合)。

---

## 2. v0.0.2 が足す技術要素 と 置き場所(scope A〜K の拡張点)

| scope | US | 追加するもの | 主な置き場所(レイヤ) | 不変条件 |
|---|---|---|---|---|
| A | 01 | StepDef に 4 契約 + execMode | `domain/project/project.ts`(型)+ `app/services/project-service.ts`(既定) | 全 optional。既存 StepDef は無契約で従来動作 |
| G | 01 | 成果物 Profile レジストリ + `coerceBlocks` | `domain/review/`(純粋データ + 純粋関数) | 未知 block は無視・既知不足は warn(throw しない) |
| B | 02 | BriefIn / BriefOut / CompletenessBlock 型 | `domain/review/`(または新規 `domain/brief/`) | Run の型付き I/O。純粋 |
| C | 02 | Run.role + `launchEval` | `domain/cycle/`(role)+ `app/ports/orchestrator.ts`(port) | role は optional discriminator。既存 Run 動作維持 |
| D | 02 | Deterministic gate | **`app` 層の決定的ポート/サービス**(下記 §4) | AI 非依存・決定的・evaluator 起動前 |
| E | 03 | Completeness gate + descope policy | `app/services/`(ポリシー)+ `domain/task`(backlog 化) | gap=hard gate。理由なし gap は自動差し戻し |
| F | 04 | Prompt 2 層構成 | **`app` 層の共有 PromptComposer ポート**(下記 §5) | Core 常時 + Step Payload 遅延。gen/eval 別 payload |
| H | 05 | Bugfix dossier プロファイル | `domain/review/`(Profile の1エントリ) | cause(2層)/impact/fix/prevention/video |
| I | 06 | Step 定義カスタム UI | `web/`(React)+ `infra/http/routes`(PATCH) | `customizePipeline` 再利用。US-09 共通化を先行 |
| K | 07 | リッチ描画(review block) | `web/`(純表示コンポーネント) | BriefOut の block を API 経由で描画。HTML は読まない |

---

## 3. アーキテクチャ方針

### 3.1 全体構成
- 構成方式: **モノリス(ローカル常駐)+ SPA + API**。マイクロサービス化しない(シングルユーザー固定 / brief Q-01)。
- レイヤー分離(既存を踏襲・新要素も同じ規律):
  - `domain/` — 純粋。型・不変条件・純粋関数のみ。FS/DB/AI に触れない。
  - `app/ports/` — 境界インターフェース(orchestrator / repos / sys / notify / uow)。
  - `app/services/` — ユースケース。ポート経由でのみ副作用を起こす。
  - `infra/` — アダプタ(db / http / orchestrator / sys)。DB は adapter が書き、AI 実行 adapter は **DB を書かず** `DomainEventSink` に emit(S7 D-04 を継承)。
- **v0.0.2 の新要素もこの規律に従う**: Deterministic gate と PromptComposer は **app 層**に新設し、scripted/live 両アダプタから共有する(アダプタ内に閉じない)。

### 3.2 StepDef 契約の拡張(A)
`StepDef` に optional フィールドを 2 つ追加(後方互換):

```ts
// domain/project/project.ts(拡張イメージ)
export type StepContracts = {
  readonly output?: OutputContract;        // 何を出すか(成果物パス + 必須 block = Profile 参照)
  readonly verification?: VerificationContract; // 何で検証するか(evaluator が見る観点)
  readonly humanGate?: HumanGateContract;  // いつ人間に渡すか(視覚レビュー / 実機確認 等)
  readonly escalation?: EscalationContract; // 詰まったときの戻り先・retry 方針
};

export type StepDef = {
  readonly id: Step;
  readonly label: Text;
  readonly order: number;
  readonly skillRef: SkillRef;
  readonly contracts?: StepContracts;                 // ← 追加(optional)
  readonly execMode?: "sequential" | "parallel";      // ← 追加(optional)
};
```

- **契約の出どころと保存**:
  - **既定契約** = コードの既定レジストリ(`project-service.ts` の `defaultPipeline()` で各 Step に seed)。
  - **上書き** = 既存の `pipelineDef`(DB に JSON で永続化、`customizePipeline` で更新)に乗る。**新テーブルを足さない**。US-06(Step UI)はこの `pipelineDef` を編集する。
- `validatePipeline`(非空 / id 一意)は不変。契約フィールドは検証対象に追加しない(optional のため)。

### 3.3 成果物 Profile レジストリ(G)
- `taskKind → 必須 block id 集合` の純粋データ構造を `domain/review/` に置く。
- `coerceBlocks(profile, blocks)`: 未知 block を捨て、既知 block を保ち、不足を **warn(throw しない)**で返す純粋関数 → 前方互換。Profile に block を足しても古い成果物が壊れない。
- bugfix dossier(H / US-05)はこのレジストリの 1 エントリ(`cause`(直接/根本の2層)/ `impact` / `fix` / `prevention` / `video`)。

### 3.4 gen→eval 往復パイプライン(B+C+D)
状態遷移(1 Step 1 attempt の中):

```
generator Run(role:'generator')
  → 成果物を emit(BriefOut: 成果物 + 決定 + 申し送り + CompletenessBlock)
  → Deterministic gate(app層・AI非依存)        ── fail → evaluator を起動せず差し戻し
  → evaluator Run(role:'evaluator', launchEval) ── requirements↔addressed 照合(§3.5)
  → 視覚レビュー(HumanTask)で人間が承認/差し戻し → Step done
```

- `Run.role?: 'generator' | 'evaluator'`(optional discriminator)。gen と eval で持つ I/O 型が違う。既存 Run(role なし)は従来動作。
- `OrchestratorPort.launchEval(cmd)` を追加。`EvalLaunch` は generator の **成果物参照 + verification 契約**を運ぶ。scripted/live 両方が実装。
- emission→persist は既存 `DomainEventSink`(S7 D-04)をそのまま使う。adapter は DB を書かない。

### 3.5 Completeness gate + descope policy(E)
判定は **app 層の決定的ポリシー**(AI ではない)。requirement が addressed かの **判断自体**は evaluator(AI)が `CompletenessBlock.addressed` に書く。policy はその差分を機械的に処理する:

| 状況 | 挙動 | 人間に出るか |
|---|---|---|
| gap あり / AI が見送り申請なし | evaluator fail → generator を**自動差し戻し**(再実行) | **出ない** |
| AI が「見送りたい」と理由付きで申請 | descope 申請(HumanTask)を発火 | **出る**(理由必須) |
| gap ゼロ | Step done を許可 | — |

- descope HumanTask の人間の選択肢: **つくる(差し戻し)/ 見送る(backlog化)/ 後回し(backlog deferred)/ 前のステップからやり直す**。
- 「前のステップからやり直す」: AI が gap の原因をたどり **推奨ステップ + 理由**を提示(固定ではない / 人間は別 step も選べる)。
- 「見送る」承認 → 該当 requirement を `domain/task`(backlog Task)に自動化(不可逆 → 確認あり)。**人間判断なしに descope しない**(原則#6)を満たす。
- **全 gap 解消(または承認済み見送り)まで Step は done にしない**(hard gate / 原則#2)。

### 3.6 Prompt 2 層構成(F)
- **app 層に共有 `PromptComposer` ポート/サービスを新設**。scripted/live 両アダプタが同じ組み立てを使う(現状の per-adapter `buildPrompt` をこれに集約)。
- 2 層:
  - **Core(常時ロード)**: brief / 直前 Step の成果物サマリ / ユビキタス言語。
  - **Step Payload(遅延ロード)**: 当該 Step の SkillDef(`kit/skills/aidlc-sN` を**ディスクから遅延 Read**)+ 入力成果物。
- gen/eval で payload を出し分け: **gen** = SkillDef + 入力成果物 / **eval** = generator の output + verification 契約。
- 遅延 = その Run を起動するときに初めて payload を読む(全 Step を常時積まない)。

### 3.7 状態管理(web / K, I)
- サーバー状態(run / HumanTask / 成果物)= API + ポーリング(既存)。push(SSE/WS)は v0.0.3 defer(S1 D-04)。
- リッチ描画(K)は **純表示コンポーネント**。`BriefOut` の block を API 経由で受け、`*.html`/`styles.css` は**参照しない**(S3 契約)。
- Step UI(I)は US-09(PageGuard/Comparator 抽出)を**先行**させてから新規要素を足す。

### 3.8 エラーハンドリング / セキュリティ
- リトライ: 既存 `EnvConfig.maxAttempt`(既定 3)/ `stallTimeoutMin`。Deterministic gate fail は **AI を起動せず**差し戻し(無駄な AI 起動の抑制 = US-02 D-01)。
- フォールバック: gate fail → generator 再実行 / stall → サイトから retry(既存)。
- セキュリティ: **シングルユーザー固定・ローカル常駐**。認証/課金なし。Claude は subscription-authed のローカル CLI(API キー不要)。`repoPath`/モデル名/ポートは **env 由来**(絶対パス・秘匿値をコードに埋めない / brief Q-02)。新たな外部公開面なし。

---

## 4. Deterministic gate の技術契約(D / US-02)

- **実行方式: app 層の決定的ポート/サービス(in-process)**。AI を一切呼ばない。**確定(S4 Q-02)**。
- 検査項目:
  1. 成果物パスが存在する(FS 読みは `sys` ポート経由で注入。判断ロジックは純粋)。
  2. 必須 block が存在する(Profile レジストリと `CompletenessBlock` を突き合わせる純粋判定)。
- 出力: `GateResult`(pass / fail + 不足理由)。fail なら evaluator を起動しない。
- 「Node.js スクリプト」の意図(US-02 D-01)= **AI 非依存・決定的**であること。本リポの hexagonal 規律では **app 層の決定的サービス**がその意図を満たす最も自然な実装(独立サブプロセス spawn は採らない)。
- テスト: 純粋判定部は unit で網羅(FS は fake `sys` で差し替え)。CI で AI 不要に高速・決定論的に回る。

---

## 5. PromptComposer の技術契約(F / US-04)

- **置き場所: app 層に共有ポート新設**。**確定(S4 Q-03)**。
- 入力: Step / role / brief 参照 / 直前 Step サマリ / ユビキタス言語 / 入力成果物参照。
- 出力: role 別の組み立て済みプロンプト(Core + 当該 payload)。
- Step Payload は `kit/skills/aidlc-sN` を**遅延 Read**(SkillDef の source = kit/skills / brief 原則「Agent の中身 = kit/skills」)。
- scripted は決定論のため Payload を固定文に差し替え可能(テスト容易性)。live は実ファイルを読む。両者が**同じ Composer**を通る。

---

## 6. 外部 I/F 仕様

### 外部 API / プロセス
| 名称 | 用途 | 通信方式 | 認証 | 備考 |
|------|------|---------|------|------|
| local Claude Code CLI | live AI 実行 | `claude -p` を `Bun.spawn`、stream-json を stdout パース | subscription(ローカル) | **Anthropic API は使わない**。v0.0.2 で追加変更なし |

### データ永続化 / ファイル
| 名称 | 用途 | 形式 | 備考 |
|------|------|------|------|
| SQLite(`bun:sqlite`) | run / HumanTask / 会話 / レビュー 状態 | テーブル + JSON 列 | StepDef 契約は既存 `pipelineDef` JSON に同居(新テーブルなし) |
| `aidlc-docs/{version}/` | 成果物の真実の source | md / png 等 | gate のパス存在検査対象。adapter が read/write |
| `kit/skills/aidlc-sN` | Step Payload の source | md(SKILL.md) | PromptComposer が遅延 Read |

### メッセージング / イベント
- **外部メッセージングなし**。内部は event-sourced(`domain/events` → `DomainEventSink` → persist)。push 経路(SSE/WS)は v0.0.3 defer。

---

## 7. 非機能要件

### パフォーマンス
| 指標 | 目標値 | 測定方法 |
|------|--------|---------|
| Deterministic gate | AI 呼び出し 0 / ネットワーク 0 / 同期完了 | unit test(fake sys) |
| Prompt context | 2 層化で常時ロード量を Core に限定 | Composer の payload サイズ確認 |
| live run timeout | 既定 120s(`timeoutMs`)/ `stallTimeoutMin` で stall 検知 | 既存 live adapter |

### 後方互換(最優先)
- 追加フィールドは**すべて optional**(contracts / execMode / role)。Profile は前方互換(`coerceBlocks`)。
- **成功基準6: v0.0.1 の 155 tests が全 pass**。新規型は **95%+ coverage**(US-01 AC)、全体 **80%+**。

### スケーラビリティ / 可用性
- シングルユーザー・ローカル常駐前提。同時実行は v0.0.2 では single-only(fan-out / 並行サイクルは v0.0.3 defer / scope 除外)。
- 可用性目標は設けない(ローカルツール)。stall→retry が復旧経路。

### 監視・ログ
- 既存 `src/infra/log.ts` を踏襲。新規の外部監視は導入しない。

---

## 8. 質疑応答ログ

> 本サイクルは S4 開始時にユーザー指示「質問はプロンプト上で」に従い、md ではなくチャットで Q を出して即時確定した。

### Q-01 — S4 をどの粒度で書くか(スタックは確定済み)
- **回答**(ユーザー): 差分の技術契約だけ(推奨)。
- **確定**: スタック再選定はせず、v0.0.2 ハーネス追加(A〜K)の技術契約・拡張点・不変条件に絞る(本書 §2〜§7)。

### Q-02 — Deterministic gate の実行方式
- **回答**(ユーザー): アプリ層の決定的ポート(推奨)。
- **確定**: in-process の決定的サービス/ポートとして実装(§4)。独立 Node サブプロセスは採らない。「Node.js スクリプト」(US-02 D-01)の意図 = AI 非依存・決定的、を app 層サービスで満たす。

### Q-03 — Prompt 2 層組み立ての置き場所
- **回答**(ユーザー): アプリ層に共有 Composer 新設(推奨)。
- **確定**: `PromptComposer` を app 層に新設し scripted/live 両アダプタで共有(§5)。per-adapter `buildPrompt` はこれに集約。

---

## AI が独自に決めたこと と 理由

### D-01 — StepDef 契約は新テーブルを足さず既存 `pipelineDef` JSON に同居
- **理由**: 契約は Step 定義の一部であり、編集面(US-06)も既存 `customizePipeline` をそのまま使える。新テーブルは serde/migration コストと整合リスクを増やすだけ。既定はコードの既定レジストリ、上書きは DB の pipelineDef。
- **判断**(ユーザー記入): 承認 | 上書き | 保留

### D-02 — v0.0.2 で新規 runtime 依存を入れない(Zod 等を導入しない)
- **理由**: 既存は branded type + `Result` で検証しており、155 tests がこの規律で通っている。新ライブラリ導入は後方互換リスクと学習コストに見合わない(YAGNI)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留

### D-03 — BriefIn/Out・Profile・CompletenessBlock は `domain/review/` に集約
- **理由**: いずれも「成果物の検証(review)」の語彙。集約境界を 1 つにまとめると S5/S6 のモデリングが追従しやすい。Run.role は実行単位なので `domain/cycle/` 側。
- **判断**(ユーザー記入): 承認 | 上書き | 保留

### D-04 — completeness の「判断」は AI、「処理」は決定的 policy に分離
- **理由**: 「requirement が満たされたか」の判断は意味解釈なので AI(evaluator)が `addressed` に書く。差分→差し戻し/descope/backlog 化の**手続き**は決定的でなければ漏れる。責務を分ける(§3.5)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留

---

## 棄却した案

### R-01 — Deterministic gate を独立 Node サブプロセスとして spawn
- **棄却理由**: hexagonal 規律ではプロセス境界とパス受け渡しの複雑さが増すだけで、「AI 非依存・決定的」という本質は app 層サービスで満たせる(S4 Q-02)。

### R-02 — Prompt 2 層を各アダプタの `buildPrompt` 内に閉じる
- **棄却理由**: scripted/live で組み立てが二重化し整合維持コストが残る。共有 Composer に集約する(S4 Q-03)。

### R-03 — StepDef 契約を専用テーブルに分離
- **棄却理由**: 編集導線・serde・migration が増える。pipelineDef JSON 同居で足りる(D-01)。

---

## 次工程 (S5) への引き継ぎ
- **Work Units 分割で考慮すべき技術的制約**:
  - P1(US-01)は全 US の前提(型基盤)。最初に閉じる。
  - Deterministic gate / PromptComposer は **app 層の新ポート**として独立 Work Unit 化できる(scripted/live 双方から使われるので I/F を先に固定)。
  - `domain/review/` に型が集中するため、Profile / BriefOut / CompletenessBlock を 1 つの作業単位に束ねると衝突が減る。
- **優先して整える技術的基盤**: StepContracts 型 + Profile レジストリ(P1)→ launchEval + Run.role + gate(P2)。
- **技術的リスクと軽減策**:
  - 後方互換破壊 → 全追加を optional + 155 tests を回帰ゲートに。
  - evaluator の `addressed` 判断ブレ → CompletenessBlock を型で固定し、policy 側は決定的に。
  - Step Payload 遅延 Read のパス依存 → `kit/skills/aidlc-sN` 規約を Composer に固定、欠落は gate で検知。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (なし。本サイクル内で S1〜S3 から順送り)

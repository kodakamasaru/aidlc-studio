# BACKLOG — v0.0.1 で作らない項目の台帳

S1〜S7 で「v0.0.1 では作らない / v0.0.x で / v1.0.0 で」と判断した項目をここに台帳化する(出典必須 / 完了で `[ ]`→`☑`、削除しない)。

## A. 機能拡張軸(v0.0.x シリーズ)

### v0.0.2 で実施(出典: aidlc-docs/scope-v0.0.2.md)
- [ ] StepDef 拡張(4契約+execMode) — A. BACKLOG §A「Vision管理/Step定義カスタム」の基盤
- [ ] BriefIn/BriefOut 型 + engine 組立 — 品質ハーネス基盤
- [ ] Run.role + evaluator 起動(launchEval) — 品質ハーネス基盤
- [ ] Deterministic gate(eval前存在検査) — 品質ハーネス基盤
- [ ] Completeness gate + descope Question — 品質ハーネス基盤
- [ ] Prompt 構成(遅延ロード 2層) — 品質ハーネス基盤
- [ ] 成果物 Profile レジストリ — 品質ハーネス基盤
- [ ] Bugfix dossier プロファイル — 品質ハーネス基盤
- [ ] Step 定義カスタム UI — BACKLOG §A「Vision管理/Step定義カスタム」
- [ ] リッチ可視化(review block 描画) — BACKLOG §A「リッチ可視化」

### v0.0.x 以降(時期未定)
- [ ] 複数リポ / PJ 切替(repo-switch)。MVP は単一 PJ 固定。出典: US-25 / S2 SCR-01(作成フォームから対象リポ選択を削除)
- [ ] Backlog / Task 管理 UI(Task 追加・並べ替え・Cycle への割当)。MVP は Cycle 作成時に単一 Task 既定を背景生成のみ。出典: US-01/03/23/24 / S2 index / S2 SCR-01(作成フォームから初期 Task 入力を削除)
- [ ] Dashboard 4 象限。出典: US-10 / S1 Q-01 / S2 R-01
- [ ] 手戻り判断面 / within-step 部分差し戻し(AC・画面単位)。出典: S2 D-03
- [ ] Decision 履歴ビュー。出典: US-17
- [ ] Wiki(ユビキタス言語 / D 決定 / 引き継ぎ台帳)自動管理・閲覧。出典: US-20/32/33
- [ ] 会話履歴ビュー。出典: US-28
- [ ] Vision 管理 / Step 定義カスタム。出典: US-26/27 → **v0.0.2 で Step 定義カスタムのみ実施**
- [ ] 並行サイクル(worktree 複数)。出典: US-09 / CLAUDE.md v0 スコープ外
- [ ] リッチ可視化(レビュー重ブロック: 動画 dossier / screenshot / test-report リッチ描画)。出典: S2 SCR-04 / design/review-output.md → **v0.0.2 で実施**
- [ ] Light テーマ(tokens を light/dark 2 系統化)。出典: S2.5 Q-02
- [ ] Inbox 種別タブ分割。出典: S2.5 SCR-03 R-01
- [ ] 実 AI 対話型ループ(headless `claude` の Q→回答→resume / `--resume`・session 注入)。MVP は run→emit→done の実 AI 検証まで(`claude -p` は実行完遂型)。出典: S7 ledger S7-C1 / s7-integration.md
- [ ] 通知(push)= US-31。MVP は NotifyPort no-op のみ。出典: S7 ledger S7-D2 / US-31
- [ ] frontend 共通化(PageGuard 画面ガード抽出 / 一覧 createdAt comparator 共通化)。機能影響なし。出典: S7 ledger S7-C3 / refactor-cleaner
- [ ] 会話/スレッド型の質問種別(要件詰めの往復 UX)。Inbox の1問1答カードでは要件ヒアリングの往復に不向き。**新 S1(要件ヒアリング)の前提機能**(方法論 v2 と密結合)。出典: ユーザー実機 feedback 2026-06-06 #4

## B. 公開・共有(v1.0.0 公開時)
- [ ] API 認証 / マルチユーザ(UserId owner スコープ)/ 本番 CSP nonce 化。MVP はローカル単一ユーザ常駐(127.0.0.1 + secureHeaders 既定 + projectId スコープ)。multi-tenant by UserId は S5/S6 ドメインに不在。出典: S7 ledger S7-D1 / s7-integration.md D-07

## C. 公開切替トリガー(技術スタック / インフラ)
- [ ] LLM 本選定 / Agent SDK 実行基盤の本番化。出典: CLAUDE.md 実行基盤
- [ ] orchestration → web の push 経路(SSE/WebSocket)本実装。出典: S2.5 SCR-02/03 設計連携メモ / S7 ledger S7-C2

## D. 時期未定
- (未定)

## H. ChatGPT v0.4 由来の拡張(v0.0.x シリーズ)
出典: ユーザー要件定義「AI Development Runtime 要件定義 v0.4」(2026-06-09)とのギャップ分析。既存設計に含まれない新規概念を台帳化。

### Phase 構成拡張(→ §F に統合済)
- Validation / Improvement 独立 PhaseGroup は §F の5PhaseGroup 構成に含む

### オーケストレーション抽象度向上(v0.0.3-4 想定)
- [ ] Skill ↔ Step 動的化: Step は Skill を知らない、Skill も Step を知らない。Orchestrator が Step の要件に合う Skill を動的選択する(現行の skillRef 静的マッピングからの移行)
- [ ] Workflow 版管理: StepDef 配列の変更履歴を記録(いつ Step を足した/消した/編集したか)。JSON 永続化のみの現状から、版付き snapshot を保持

### 要求管理レイヤー(v0.0.x)
- [ ] Request/Epic 層: Task の上位概念。「通知機能改善」レベルの事業要求を建模。Backlog 画面で Epic → Task の階層表示。ChatGPT doc の「Request」に相当

### 横断ルール機構(v0.0.x)
- [ ] Policy 横断適用: Workflow 全体に横断適用されるルール機構。まず Security Policy から導入。将来的に DDD/Compliance/Performance 等。ChatGPT doc の「Policy」に相当
- [ ] Extension プラグイン: Workflow 変更なしで適用可能な追加ルール群(Security/Financial/SaaS/Healthcare)。Policy とセットで設計。ChatGPT doc の「Extension」に相当

### 履歴・分析(v0.0.x)
- [ ] Rollback 履歴 entity: 手戻りを first-class entity に(発生Step/戻り先/理由/判断者を保持)。現行 backtrack コマンドの記録強化
- [ ] AI 開発部レポート: AI が品質/リスク/手戻り分析/Workflow改善提案を自動生成。Dashboard 4象限(§A)の高度化

## F. 方法論 v2 — 4層化 + 5PhaseGroup × 12Step 再定義
ユーザー合意(2026-06-06, 2026-06-09 更新)。現行3層(Cycle > Phase > Run)を**4層(Cycle > PhaseGroup > Step > Run)**に再構成。現行 Phase を Step にリネームし、新たに PhaseGroup(大区分: Discovery/Design/Build/Validation/Improvement)を導入。S2.5 廃止。**v0.0.1 締め後に独立実施**(影響: kit/skills + operating-model + domain/cycle.ts + domain/project.ts + vocab.ts + studio pipeline/UI)。既存 v0.0.1 aidlc-docs は歴史として温存。出典: ユーザー提案 2026-06-06 #3 / ChatGPT v0.4 ギャップ分析 2026-06-09

### 階層構造変更(★中核)
- [ ] 4層化: Cycle > PhaseGroup > Step > Run。現行 Phase(実行単位=S1-S7)を Step にリネーム、PhaseGroup(大区分)を新設
- [ ] `PhaseGroup` 型定義: { id, label, order, steps: StepDef[] } を domain/project.ts に追加
- [ ] `pipelineDef` 構造変更: StepDef[] → PhaseGroupDef[] に変更(Project.ts)
- [ ] `Cycle` 集約再構成: phases: Phase[] → phaseGroups: PhaseGroup[] に変更(cycle.ts)
- [ ] `vocab.ts` 更新: PhaseGroup branded type 追加、DEFAULT_STEPS → DEFAULT_PIPELINE_GROUPS に変更
- [ ] UI ルーティング更新: /phase/:id → /step/:id に変更(group 単位でアコーディオン表示)

### Discovery
- [ ] S1 要件ヒアリング(brief + 現 S1 を統合・対話寄り)
- [ ] S2 画面要素(ワイヤーフレームレベル)= 現 S2 screen-mock

### Design
- [ ] S3 本格 UI デザイン = 現 S2.5 を正式ステップに昇格(**S2.5 廃止**)
- [ ] S4 技術仕様確定(必要なとき / 任意)= 新規

### Build
- [ ] S5 並行作業単位(UoW)と順序確定 = 現 S3 unit-of-work + 現 S4 context-map を統合
- [ ] S6 ドメインモデル視覚化で対応内容/方針を確認 = 現 S5 domain-model
- [ ] S7 ドメインコード実装 = 現 S6 pure-code
- [ ] S8 実 PJ コード組み込み = 現 S7 integration

### Validation (★新規独立 Phase)
- [ ] S9 Scenario Validation — 実DB利用/スクリーンショット/動画。モック禁止。出典: ChatGPT v0.4 §H
- [ ] S10 Human Acceptance Test — 人間による最終確認。出典: ChatGPT v0.4 §H

### Improvement (★新規独立 Phase)
- [ ] S11 Retrospective — 振り返りレポート生成。出典: ChatGPT v0.4 §H
- [ ] S12 Workflow Improvement — 開発プロセス改善提案。dogfooding §9 の Phase 昇格。出典: ChatGPT v0.4 §H

## G. git 運用 / サイクル識別(v0.0.x)
v0.0.1 はサイクルをバージョン文字列(vX.Y.Z)で識別している。本来サイクルの同一性は不変 ID が担い、バージョンはブランチがマージされて初めて確定する成果物である。git 運用そのものもプロジェクトごとに設定可能にする。出典: ユーザー feedback 2026-06-07
- [ ] サイクルに紐づける識別子をバージョンではなく不変 ID にする(version は表示/集計属性に降格、ID が source of identity)
- [ ] バージョンはブランチがマージされたときに付与する(マージ成果としての version 確定。作成時に固定しない)
- [ ] git 運用(ブランチ戦略 / マージ契機 / version 採番ルール)をプロジェクト単位で設定可能にする

## E. 棄却された案(思想として採用しない)
- Tailwind CDN を S2.5 で使う(オフライン決定的レンダリング不可)。出典: S2.5 D-01 / R-01
- Inbox 種別を色だけで区別。出典: S2.5 D-03 / R-02

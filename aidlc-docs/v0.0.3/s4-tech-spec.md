# S4 — 技術仕様(v0.0.3 差分の技術契約)

## メタ
- 工程: S4 (Tech Spec)
- PhaseGroup: Design
- 役割: ソフトウェアアーキテクト
- バージョン: v0.0.3
- ステータス: **確定**(評価 AI レビュー済 → §9 で指摘を反映 / 2026-06-12)
- 入力参照:
  - [brief.md](../brief.md) / [scope.md](./scope.md)
  - [s1/index.md](./s1/index.md)(US-01〜05)
  - [s2/index.md](./s2/index.md) / [s3/index.md](./s3/index.md)
- 作成日: 2026-06-12
- 更新日: 2026-06-12

> **このS4の方針(粒度)**: スタックは v0.0.1/v0.0.2 で確定済み(再選定しない)。本書は **v0.0.3 の ①正本一元化 + ②live化(US-01〜05)を「どう作るか」の技術契約**に絞る。各変更が既存 hexagonal 構造の **どのファイル・どのレイヤ**に乗る/から消えるかと、不変条件を明文化し、S5(Work Units)が迷わず分割できる状態にする。実装詳細(関数シグネチャ等)は S5 以降。
>
> **重要(評価 AI レビュー反映)**: 初版の配置誤り・スコープ過少を §9 のレビューで是正済。特に **PromptComposer は現状コードに不在(US-03 は新設)** / **snapshot は `cycle-service.ts`** / **死蔵削除は型・ポート・テストまで波及** の 3 点に注意。

---

## 1. 既存スタック(確定済み・再選定しない / v0.0.3 で runtime 依存の増減なし)

| 層 | 採用 | 備考 |
|------|------|------|
| ランタイム / PM | Bun | `bun:sqlite` / `Bun.spawn`。stream-json パースは標準 JSON で足り、新規依存なし |
| HTTP | Hono | `src/infra/http/` |
| 永続化 | SQLite(`bun:sqlite`) | studio の状態 store。**真実の source は `aidlc-docs/`** |
| フロント | React + Vite | `web/` |
| E2E / 視覚 | Playwright | `tests/e2e/` + verify-ui screenshot。**既存 devDependency**(US-05 の撮影は CLI subprocess で再利用) |
| アーキ | Hexagonal + event-sourced | domain 純粋 / app=port+service / infra=adapter。AI 実行 adapter は DB を書かず `DomainEventSink` に emit |
| AI 実行 | OrchestratorPort の 2 アダプタ | `scripted`(決定論)+ `live`(local Claude CLI `claude -p --output-format stream-json`) |

**v0.0.3 で増える runtime(本番)依存: なし**。新規バリデーションライブラリも入れない。Playwright は既存 devDependency を **CLI subprocess(`Bun.spawn`)で使い、新規 import 依存を増やさない**(§3.5)。

---

## 2. v0.0.3 が足す/消す技術要素 と 置き場所

| US | 変更 | 置き場所(レイヤ) | 種別 |
|---|---|---|---|
| 01 | 死蔵テーブル削除(波及含む) | §3.1 の一覧(repo/port/wiring/migration/store **+ 型・IdGen ポート・fakes・テスト**) | 削除 |
| 01 | 正本マップのルール化 | `kit/rules/aidlc-operating-model.md`(1 枚) | 追記 |
| 02 | step 単一正本(集合 + skillRef 実 dir) | `domain/shared/vocab.ts` | 改訂 |
| 02 | 平易ラベルの単一化 | `web/src/lib/step-label.ts`(vocab の集合から導出。ラベル文字列は web に保持) | 改訂 |
| 02 | skillRef 実 dir 解決 | `app/services/project-service.ts:44`(`aidlc-${step}` 偽リンク→実 dir) | 改訂 |
| 02 | per-cycle snapshot | **`app/services/cycle-service.ts`(`createCycle`)** で作成時に default を DB へコピー | 追加 |
| 03 | live prompt 合成契約 | `kit/rules/aidlc-operating-model.md`(合成順序・所有) | 追記 |
| 03 | **PromptComposer(現状不在)+ live 実合成** | **app 層に PromptComposer を新設** + `infra/orchestrator/live.ts:32`(`defaultBuildPrompt` スタブ→composer 呼び出し) | **新設** |
| 04 | live completeness emit | `infra/orchestrator/live.ts`(stream-json から `addressed` パース→`ResultEmitted.completeness`) | 追加 |
| 05 | verify-ui screenshot(**撮影機構 net-new**) | `infra/orchestrator/`(evaluator 経路で撮影→artifact path)+ `web` 既存 review block | **新設(撮影)** |

---

## 3. 主要技術契約

### 3.1 外部記憶境界(①-a / US-01)
- **正本マップ**: `truth=file` / `DB=index|state`、**DB は不変 truth を複製しない**(scope.md の 1 枚を operating-model にルール化)。
- **死蔵削除(波及一覧 = US-01 のスコープ)**: `ledger` / `conversation` は app **サービス**参照 0。ただし削除は型・ポート・テストまで波及するので **一式**で行う(これを欠くと `tsc` が落ちて回帰が割れる):
  1. `src/infra/db/{ledger-repo,conversation-repo}.ts`(repo impl)
  2. `src/infra/db/migrations.ts`(2 テーブル DDL)/ `store.ts`(repo 配線)
  3. `src/app/ports/repos.ts`(`LedgerRepo` / `ConversationRepo`)+ `src/app/ports/composition.ts`(wiring)
  4. `src/app/ports/sys.ts:40`(`IdGen.ledgerEntryId()`)+ `src/infra/sys/fakes.ts:117`(実装)
  5. `src/domain/shared/ids.ts:17,28`(`LedgerEntryId` branded 型)
  6. `src/domain/external-memory/external-memory.ts`(`LedgerEntry` / `Conversation` / `makeLedgerEntry` 等)+ 同 `*.test.ts`
  7. `tests/integration/store.test.ts`(ledger/conversation の round-trip テスト)/ `tests/integration/builders.ts`(`buildLedgerEntry`)
- **注意**: `WikiSection = "ubiquitous"|"facts"|"ledger"` の文字列 `"ledger"` は **Wiki セクション名**であって ledger repo とは無関係。**消さない**。
- 正本は `aidlc-docs/{v}/ledger.yml`(規約 path)。`wiki` は本サイクルでは触らない(方針のみマップに記載)。
- **不変条件**: 上記一式を削除後に `bun test` + 既存 E2E スイートが pass(波及を全部消すまで `tsc` が通らない点に留意)。

### 3.2 step 単一正本 + snapshot(①-b / US-02)
- **単一 constant の正本**: `vocab.ts`(domain)が `step 集合(v2 12・S2.5 退役)× skillRef(実 dir)` を持つ唯一の正本。skillRef は domain identity(branded string)なので domain 配置可。
- **ラベルは domain に入れない**: 平易ラベル(表示文字列)は UI 関心事。`web/src/lib/step-label.ts` に残し、**vocab の step 集合から「どの step が存在するか」を導出**してラベルを引く(集合の二重定義を消す / 表示文字列を domain に持ち込まない)。
- **skillRef 解決**: `project-service.ts:44` の `aidlc-${step}`(偽リンク)を実 dir(`aidlc-s1-requirements` 等)に解決。**②(US-03)の live prompt がスキル本文を引く前提**。
- **snapshot 規約**: file=default テンプレート(truth)/ DB=per-cycle。**`cycle-service.ts` の `createCycle` でサイクル作成時に file default を DB へ snapshot コピー**(カスタムしなくてもコピー)。以後そのサイクルは DB を正とし、file の後変更は波及しない。`StepDef.label` は snapshot に平易ラベルが入り死蔵解消。
- **不変条件**: 既存 Step UI / 構成ビュー / `GET /api/steps/:step/skill` が新正本で回帰割れなし。

### 3.3 live prompt 合成契約 + PromptComposer 新設(①-c + ②-d / US-03)
- **合成契約(operating-model に明文化)**: live prompt = `kit/skills/aidlc-sN`(手順本文)+ `StepDef.contracts`(DB snapshot)+ brief/前段成果物(`aidlc-docs`)。**所有と順序**を定義(v0.0.2 §11 の Core 常時 + Step Payload 遅延を実体化)。
- **★ PromptComposer は現状コードに不在(net-new)**: v0.0.2 で設計だけされ未実装(`grep PromptComposer` = 0 件。`live.ts` は 1 文 `defaultBuildPrompt` のみ)。**app 層に新設する 1 Unit 規模の作業**。S5 はこれを「改訂」でなく「新設」として分割すること。
  - スキル本文の読み出しは **`Fs` ポート経由**(infra 直読みしない / hexagonal 維持)。`StepDef.contracts` 組み立て + brief/artifact path 注入を行う。**注: 現 `Fs`(`sys.ts:27`)は `exists` のみ → `Fs.read` 追加(or 新規 reader ポート)が U03 スコープ(S5 評価 AI)**。
- **live 配線**: `live.ts` の `buildPrompt`(injectable / 現 `defaultBuildPrompt`)を PromptComposer 呼び出しへ差し替え。skillRef→実 dir 解決は §3.2 経由に限定。gen/eval で別 payload。
- **不変条件**: スキル dir 不在は明示エラー(silent fallback 禁止)。`bun test:live` の実 AI 経路は加算層([[real-ai-tests-additive]])、決定的スイートは fixture で常時検証。

### 3.4 live completeness emit(②-e / US-04・carry)
- **現状**: `live.ts:101-109` に「real-AI `addressed` パースは v0.0.x enhancement、未実装時は app が visual_review に fallback」と明記。これを実装する。
- **契約**: live の stream-json から `addressed` を抽出し、既存 `ResultEmitted.completeness?`(events.ts:49 / 加法型)に載せて app へ搬送。**scripted と同一 app 経路**(`engine-service.ts:153-174` の `onEvaluatorResult` → `evaluateCompleteness→decideDisposition` / v0.0.2 S8-D04)で gate を効かせる。新イベント・新 gate は作らない。infra は「stream-json→既存ドメイン型」変換に留める。
- **不変条件**: completeness 無/壊れは visual_review fallback(現行 `engine-service.ts` の `!event.completeness` 分岐)。ただし「emit 期待が外れた」事実は観測可能にする(silent failure 禁止 / 原則④)。

### 3.5 verify-ui screenshot(②-f / US-05)
- **★ 撮影機構は net-new**: 現状 orchestrator/infra に live run 撮影は無い(`scripted.ts` は固定パスの fake screenshot block を出すのみ。`scripts/s3-capture.ts` 等は design doc 用で app 経路外)。
- **撮影方式(依存を増やさない)**: Playwright を **`Bun.spawn` で CLI subprocess 起動**(programmatic `import { chromium }` は新規 import 依存になるため採らない)。撮影対象 URL(dev server)は **env 経由で evaluator に渡す**。
- **契約**: evaluator 経路で実 screenshot を生成 → **artifact(path 索引)** として搬送 → 既存 review block(`ReviewBlocks.tsx` の `ScreenshotFigure`)が path で描画。**画像バイナリは DB / イベントに載せない**(§3.1 境界ルール)。保存先 `aidlc-docs/{v}/…/screenshots/`(S9 命名規約踏襲)。
- **不変条件**: 取得失敗は placeholder + 理由(S3 視覚契約 `scr-01-review-evidence.failed.png`)。既存 screenshot/video 枠を流用(新描画コンポーネント不要)。

---

## 4. 非機能要件 / 不変条件

| 項目 | 基準 |
|------|------|
| 後方互換 | 既存の決定的回帰スイート + E2E スイートが pass(現行 `bun test` ≒ 235 / E2E 5 spec ファイル。**死蔵削除は波及を全消しするまで `tsc` が通らない**点に留意) |
| 本番依存 | 新規 runtime(本番)依存ゼロ。Playwright は既存 devDependency を CLI subprocess で再利用(新規 import なし) |
| live 実行 | local CLI(`claude -p`)。web の CWV に影響なし(バックグラウンド run) |
| 実 AI テスト | 加算層([[real-ai-tests-additive]])。決定的スイートを緩めない |
| 画像 | path 参照のみ(DB 複製しない)。サイズ上限・遅延読み込みは S5/実装で詰める |
| 観測性 | live の fallback / 失敗は理由がログ・UI で後から追える(原則④) |

---

## 5. 質疑応答ログ

### Q-01 — 死蔵テーブル削除のマイグレーション方針(drop 文を migrations に足す / dogfood の throwaway DB は作り直しで足りる)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定: migrations に drop を加えつつ、dogfood の `/tmp` DB は再作成で足りる。本番相当の永続 DB は無いため移行データなし。)

---

## 6. AI が独自に決めたこと と 理由

### D-01 — live completeness は既存 `ResultEmitted.completeness?` + 既存 app gate に載せ、新経路を作らない
- **理由**: scripted/live を 2 経路にすると片方だけ直す事故(v0.0.2 で経験)を招く。1 本化で drift を防ぐ。評価 AI も「architecturally sound」と確認(§9)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — live prompt 合成契約は operating-model に置く(恒久ルール)/ PromptComposer は app 層に新設・Fs ポート経由
- **理由**: 「source 合成の順序・所有」は方法論の恒久ルール。実体(composer)は不在なので app 層に新設し、スキル本文は Fs ポート経由で読む(infra 直読み禁止)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-03 — 死蔵削除は型・IdGen ポート・テストまで含めて一式除去(repo impl だけ残さない)
- **理由**: 中途半端に型/ポートを残すと「いつか使う」死蔵が再発し境界が曖昧になる + `tsc` が落ちる。境界を明快にするため一式削除。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-04 — ラベルは domain(vocab)でなく web(step-label)に残し、vocab の step 集合から導出
- **理由**: 表示文字列を domain に持ち込むと層が汚れる(評価 AI 指摘)。集合の正本は vocab、ラベル文字列は web、で「二重定義を消す」目的は達成しつつ層を守る。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## 7. 棄却した案

### R-01 — live 用の completeness パーサを infra に閉じた専用サービスとして新設
- **棄却理由**: app gate と二経路化する。infra は「stream-json→既存ドメイン型」への変換に留め、判定は app 既存経路へ。

### R-02 — verify-ui 撮影を Playwright の programmatic import で実装
- **棄却理由**: `import { chromium }` は新規 import 依存。`Bun.spawn` の CLI subprocess なら既存 devDependency を新規 import なしで使える(§3.5)。

## 8. 次工程 (S5) への引き継ぎ
- Work Units 分割で考慮すべき技術的制約:
  - 依存順 = US-01(境界/削除・独立)/ US-02(step 正本: skillRef 実 dir が US-03 の前提)→ US-03(**PromptComposer 新設** + live 実合成)→ US-04/05(並行可)。
  - **US-03 は「改訂」でなく「新設(PromptComposer)」として 1 Unit 確保**(評価 AI CRITICAL)。
  - US-01 の死蔵削除は **型・ポート・テストまで波及**するので 1 Unit にまとめ、`tsc` green を完了条件に。
  - US-05 の撮影機構は net-new(Bun.spawn + dev URL env)。
- 優先実装基盤: US-02 の単一 constant(skillRef 解決が US-03 の前提)。
- 技術的リスク: live の stream-json `addressed` フォーマットが実 AI 出力依存で不確実 → fixture 駆動でパース + fallback 観測でリスク軽減(US-04)。

## 9. 評価 AI レビュー記録(2026-06-12 / code-reviewer)

人間がソースを見ない内部技術契約のため、評価 AI を起動しコード実体に突合([[dogfood-harness-principles-on-this-repo]])。初版の verdict = **NOT SOUND**。指摘と是正:

| 重大度 | 指摘 | 是正 |
|---|---|---|
| CRITICAL | PromptComposer は不在なのに「改訂」と記載(US-03 スコープ過少) | §2/§3.3/§8 を **新設** に修正。Fs ポート経由を明記 |
| HIGH | 死蔵削除が型/IdGen ポート/テストに波及するのを欠落 | §3.1 に 7 波及点を列挙。`WikiSection "ledger"` は無関係と注記 |
| HIGH | snapshot を `project-service.ts` に誤配置(実体は `cycle-service.ts:89 createCycle`) | §2/§3.2 を `cycle-service.ts` に修正 |
| MEDIUM | 撮影機構 net-new + 「新規依存ゼロ」と矛盾 | §3.5 で `Bun.spawn` CLI subprocess(import 依存を増やさない)を明記 |
| MEDIUM | vocab(domain)にラベルを置くと層が汚れる | §3.2/D-04 でラベルは web 保持・vocab の集合から導出に修正 |
| LOW | 「E2E 6」は test-case 数。spec ファイルは 5 | §4 を「現行スイート pass」に緩和 |

是正後、配置・層整合・carry 回収は PASS。残るは実装時の discovery(stream-json フォーマット)のみ。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (なし)

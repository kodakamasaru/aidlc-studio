# S6 — ドメインモデル(全体) — v0.0.3

## メタ
- 工程: S6 (Domain Model)
- PhaseGroup: Build
- 役割: ドメインモデラー
- バージョン: v0.0.3
- ステータス: 確定
- 入力参照: [s1/index.md](../s1/index.md) / [s5/index.md](../s5/index.md) / [s4-tech-spec.md](../s4-tech-spec.md) / [scope.md](../scope.md) / [brief.md](../../brief.md)
- 作成日: 2026-06-12
- 更新日: 2026-06-12

> **このS6の方針(差分モデリング / v0.0.2 D-01 を踏襲)**: ドメイン(`domain/`)は v0.0.1〜0.0.2 で DDD で確立済み(集約 Project / Cycle(Run)/ Review / Task / Question / Facts / ExternalMemory、branded type + 自前 `Result`、event-sourced)。本書は **v0.0.3 が足す/変える/消すビジネスロジックだけ**を起こす。既存集約の再モデリングはしない(過剰設計回避 / 完了条件「US と紐づかないモデルを作らない」)。
>
> **v0.0.3 の性質 = 正本一元化(①)+ live 本物化(②)**。ドメイン増分は薄く、実体は **(A) Phase への StepDef スナップショット(新規) / (B) step 正本セットの値変更(S2.5 退役・実 dir skillRef) / (C) 外部記憶の死蔵モデル削除** の 3 点に集約される。② の live 化(US-03/04/05)は **app/infra/既存型**に乗り、ドメイン不変条件を増やさない。

## スタック確認 (実 PJ と乖離させない)
- 言語: TypeScript(branded type + 自前 `Result<T,E>` = `domain/shared/result.ts`)
- フレームワーク: ドメイン層はフレームワーク非依存(Hono/React/`claude` CLI は外側)
- 永続化: ドメインは永続化を知らない。SQLite は infra。**snapshot は「state の実体化」であり DB が担うが、ドメインは Phase に snapshot フィールドを持つだけで DB を知らない**
- 既存資産: `domain/{project,cycle,review,task,question,facts,events,external-memory,shared}`。**S5 index のアーキ前提・[scope.md](../scope.md) の境界ルールと齟齬なし**(確認済み)
- ※ ドメインは DB/ORM/HTTP/CLI の語彙を持たない(S8 の領域)

## DDD 採用判断
- 採用: **DDD 採用(既存を継続)**
- 理由: 既存ドメインが集約・VO・不変条件・event-sourced で構築済み。v0.0.3 もこの語彙で拡張(snapshot VO 追加)・削除(死蔵モデル除去)するのが一貫性・後方互換の両面で自然。形式を変える理由がない。

## ユビキタス言語 (v0.0.3 追加・変更分 / 既存語は踏襲)
| 用語 | 定義 | 別名NG |
|------|------|--------|
| step 正本セット (canonical step set) | どの工程が在るか + 各工程の `skillRef`(実 dir 名)を持つ **file 単一 constant**。v2 12 工程(S2.5 退役)。表示ラベルは含めない(web 所有) | "設定", "ステップ一覧"(web の表示と混同) |
| スナップショット (StepDef snapshot) | サイクル作成時に、その時点の default step 定義(label/skillRef/contracts)を Phase へ **ピン留めコピー**した不変の写し。以後 file default の後変更は波及しない | "コピー"(可変の含意), "キャッシュ"(無効化の含意) |
| state の実体化 (materialization) | 「分岐しうる状態」を作成時点で実体化すること。**不変 truth の複製とは別物**(原則違反でない) | "複製", "二重持ち"(死蔵複製と混同) |
| 死蔵モデル (dead model) | **業務フロー(services/orchestrator)参照 0**(配線・DB テーブルは在るが engine が呼ばない)のモデル(Ledger/Conversation)。境界ルール上 **削除**対象 | "未使用テーブル"(消極的), "予約"(温存の含意) |
| skillRef (実 dir) | StepDef が指す **実在するスキル dir 名**(例 `aidlc-s1-requirements`)。偽リンク `aidlc-S1` を是正 | "スキル名", "step id"(別概念) |

> **完全性(completeness / gap / addressed / descope)・契約(StepContracts)・役割(role)** 等は v0.0.2 で定義済(本サイクルで意味は変えない)。live はこれら既存語彙の **同じゲート**を実 AI で貫通させるのみ。

## 集約 / モデル一覧 (v0.0.3 差分)
- [phase-step-snapshot](./phase-step-snapshot.md) — **新規**: Cycle 集約 / Phase へ StepDef スナップショット追加(Unit-02 / US-02)
- [step-canonical-set](./step-canonical-set.md) — **値変更**: step 正本セットの単一正本化(v2 12・S2.5 退役・実 dir skillRef)(Unit-02 / US-02)
- [external-memory-pruning](./external-memory-pruning.md) — **削除**: ExternalMemory から Ledger/Conversation 死蔵モデルを除去 + 退役する不変条件(Unit-01 / US-01)

### 各 US のドメインロジック割当(完了条件①: 全 US が表現されているか)
| US | ドメインロジックの所在 | 備考 |
|----|----------------------|------|
| US-01 | external-memory-pruning | Ledger/Conversation 削除。退役する不変条件(INV-3/4)を明示記録 |
| US-02 | phase-step-snapshot + step-canonical-set | 正本セット値変更 + 作成時スナップショット(Phase 拡張)|
| US-03 | **新規ドメインなし** | PromptComposer は app 層(副作用=ファイル read)。`Fs.read` 追加も app ポート。ドメイン不変条件を増やさない |
| US-04 | **既存 `CompletenessBlock` に吸収** | live が stream-json から `addressed` をパースし既存 `ResultEmitted.completeness?`(events.ts:49)へ。**新ドメイン型・新ゲートなし**(v0.0.2 US-04 と同じ判断)|
| US-05 | **既存 `ArtifactRef`(kind `screenshot`)に吸収** | 撮影は infra(`Bun.spawn`)、搬送は path 索引のみ(external-memory.ts:43 に kind 既存)。画像は DB/event に載せない |

→ ドメインを**新規に増やす(または変える/消す)のは US-01/02 のみ**。US-03/04/05 は app/infra か既存型に乗る(黙った descope ではなく、明示的に「ドメイン増分なし」と記録 / 原則#2・#6)。

## 横断的な不変条件(本サイクルで足す/退役する)
**足す(snapshot)**:
- INV-S1: サイクル作成時、各 Phase は **その時点の default step 定義の写し**を持つ(`phase-step-snapshot` で定義)。
- INV-S2: snapshot は作成後不変。file default(`step-canonical-set`)の後変更は **既存サイクルに波及しない**。

**退役(deletion)**:
- 旧 INV-3(Ledger: carried⇒into / dropped⇒reason 必須)・旧 INV-4(次サイクル S1 着手 = 未 reconcile 0)は **Ledger モデルごと退役**。引き継ぎの正本は file(`aidlc-docs/{v}/ledger.yml`)へ移り、studio ドメインは台帳不変条件を持たない([external-memory-pruning](./external-memory-pruning.md) で詳細)。

## 全体 質疑応答ログ (スタック・DDD 判断・モデル横断)

書き方: AI が `### Q-NN` で問いを追記。**ユーザーは IDE でこの md を開き `回答` に直接書き込む**。AI は次のやり取りで `確定` を埋める。

### Q-01 — snapshot の置き場は Phase か Cycle か(各 Phase が個別に持つ / Cycle が pipeline 写しを 1 つ持つ)
- 文脈: 現状 `Phase = {id, step, order, state, runs}`、`Cycle = {…, phases}`。snapshot は「step ごとの定義(label/skillRef/contracts)」なので step 1:1。phase は step と 1:1(`createCycle` が pipeline 1 entry → 1 Phase)。
- 提案: **各 Phase に `stepDef` snapshot を持たせる**(Cycle に別途 pipeline 写しを置くと Phase.step と二重管理になり drift する)。Phase が「自分はどの定義で実行されるか」を自己完結で持つのが run 起動(`startPhase`)とも素直。
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定: 各 Phase に `stepDef` snapshot。詳細は [phase-step-snapshot](./phase-step-snapshot.md) D-01。)

### Q-02 — 差分モデリング方針(既存集約を再モデルせず増分/削除のみ)でよいか(v0.0.2 Q-02 の踏襲)
- 提案: 既存 Project/Cycle/Review/Task/Question/Facts は再掲しない。v0.0.3 が触る所(Phase 拡張・vocab 値・ExternalMemory 削除)だけを各ファイルに起こす。
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定: 差分モデリングで確定。既存集約は再掲せず、増分・削除・既存吸収を割当表で表す。)

---

## 全体 AI が独自に決めたこと と 理由

書き方: AI が `### D-NN` で決定と理由を追記。ユーザーは `判断` を `承認 / 上書き / 保留` から選び、上書きするなら `上書き内容` に直接書く。

> **dogfood 原則**: 以下はすべて **内部コード判断**(命名・層配置・型形状)。[[dogfood-harness-principles-on-this-repo]] に従い、人間に裁定を振らず **evaluator AI をコード実体に突合**させて裁定する(§評価AIレビュー記録)。人間に渡すのは「スコープ/プロダクト意味」の Q のみ。

### D-01 — DDD 継続 + 差分のみ(増分/削除/吸収)。既存集約を再掲しない
- **理由**: 既存ドメインが DDD で完成済み。v0.0.3 は薄い拡張+削除であり、全集約の再モデリングは過剰設計(完了条件「US と紐づかないモデルを作らない」)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — US-03/04/05 は「ドメイン増分なし」と明示記録する
- **理由**: PromptComposer/Fs.read は app(副作用)、completeness は既存 `CompletenessBlock`、screenshot は既存 `ArtifactRef`。無理にモデルを作ると US と紐づかない過剰設計になる。割当表で「どこに乗るか」を残し黙った descope を防ぐ(原則#2・#6)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-03 — snapshot は「state の実体化」でありドメインに `stepDef` フィールドとして持つ(DB は知らない)
- **理由**: scope.md 境界ルール「DB は不変 truth を複製しない / state は実体化してよい」。snapshot は分岐しうる state なのでドメインの正当な持ち物。Phase が自定義を自己完結で持つことで `startPhase`/prompt 合成が素直になる。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## 棄却した集約案

### R-01 — snapshot 専用の新集約 `CyclePipeline` を立てる
- **棄却理由**: snapshot は Phase の属性で表現でき、別集約化は Phase.step と二重境界を生む。既存 Cycle 集約の Phase 拡張で足りる(過剰設計)。

### R-02 — Ledger/Conversation を「索引化」して残す(削除しない)
- **棄却理由**: US-01 D-01 で確定済(app 参照 0 の死蔵 / listing 実需なし / 可逆なので将来 artifact 同型で再導入可)。残すと境界の判定を曖昧にする。

## 次工程 (S7) への引き継ぎ
- **フレームワーク非依存で実装すべきモデル**: `Phase.stepDef` snapshot 写し(`createCycle` で実体化) / step 正本セット constant(v2 12・実 dir skillRef) / ExternalMemory からの Ledger/Conversation 除去。
- **既存コードへの破壊的変更(回帰ゲート必須)**:
  - `Phase` 型に `stepDef` 追加 + `CreateCycleCmd.pipeline` entry が `{phaseId, step}` → snapshot 込みへ拡張(cycle.ts:132/145)。DB 列/シリアライズ追加は S8。
  - `DEFAULT_STEPS` 8(S2.5込)→ v2 12。**step を直接参照する test/fixture のみ追従**(`shared.test.ts:65` 等)。app は可変 step を generic に扱う(回帰面限定 / S5 Unit-02 注意書き)。
  - Ledger/Conversation 死蔵の**全波及点**除去(domain `external-memory.ts`/`ids.ts` + **app/ports `repos.ts`(LedgerRepo/ConversationRepo)・`composition.ts`(Repos.ledger/conversations)・`sys.ts`(IdGen.ledgerEntryId)** + **infra `ledger-repo.ts`/`conversation-repo.ts`/`store.ts` 配線/`migrations.ts` テーブル/`id-gen.ts`/`fakes.ts`** + tests `builders.ts`/`store.test.ts`)。**業務フロー参照は既に 0**、配線層の参照 0 達成は S7 完了条件(詳細 = [external-memory-pruning](./external-memory-pruning.md) 削除対象表)。**`WikiSection` の `"ledger"` メンバは残す**(wiki セクション分類であり台帳テーブルとは別物 / 本サイクル wiki は方針のみ)。
  - `project-service.defaultPipeline()` の偽 `skillRef: aidlc-${step}` / `label: step` を正本セット導出へ差し替え(app)。
- **テストで保証したいビジネスルール**: ① snapshot が作成時点で固定され file 後変更に不感(INV-S1/S2)② Ledger 削除で参照切れ 0・235 回帰 pass ③ 正本セット値変更で step を引く既存挙動が割れない ④ US-04/05 が既存 `CompletenessBlock`/`ArtifactRef` の加法のみ(新型ゼロ)。

## 評価AIレビュー記録 (確定前 proactive / [[dogfood-harness-principles-on-this-repo]])
- **実施**: 2026-06-12、code-reviewer を敵対的レビュアーとして起動。9 主張をすべて実コード(Read/grep/`ls kit/skills`)に突合。
- **裏取り PASS(修正不要)**: 主張1(Phase 型・createCycle 行番号 :54/:132/:145)/ 主張2(StepDefSnapshot 4 フィールドの型 SkillRef/Text/StepContracts/number が実在・import 可)/ 主張3(DEFAULT_STEPS 8・S2.5 込 / defaultPipeline の偽 label・偽 skillRef)/ 主張4(**skillRef 実 dir 表 12 件 `kit/skills/` と全件一致**)/ 主張5(削除対象 12 + ids 2 の行番号一致)/ 主張6(WikiSection/ArtifactKind)/ 主張7(CompletenessBlock/ResultEmitted.completeness? 実在・加法)/ 主張9(hexagonal 分担が既存先例と整合)。
- **検出した虚偽 → 是正済(主張8 FAIL)**: 「**app 参照 0 を確認済**」は誤り。実際は `app/ports`(LedgerRepo/ConversationRepo/IdGen.ledgerEntryId)・`infra/db`(ledger-repo/conversation-repo/store/migrations)・`infra/sys`(id-gen/fakes)・tests に**生きた配線参照**あり。**正しい事実 = 業務フロー(services/orchestrator)参照のみ 0**(grep 再確認済)。
  - 是正: [external-memory-pruning](./external-memory-pruning.md) の「死蔵」定義を「業務フロー参照 0」に訂正 + 削除対象を**全波及点表**へ拡張 + INV-P1 を「S7 完了条件(未来形)」に変更。index 用語「死蔵モデル」と S7 引き継ぎの波及点、および S1 [US-01](../s1/us-01-source-of-truth-boundary.md) AC も同事実へ訂正。
- **教訓([[completeness-checks-anchor-on-spec]] / [[dogfood-harness-principles-on-this-repo]])**: 「参照 0」系の主張は **grep の対象範囲(業務フロー vs 配線層)を明示**しないと過小評価になる。確定前 proactive レビューで commit 前に捕捉。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (なし。本サイクル内で S5 から順送り)
</content>

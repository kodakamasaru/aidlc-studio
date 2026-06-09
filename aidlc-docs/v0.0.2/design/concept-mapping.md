# 概念マッピング — ChatGPT 版「AI Development Runtime」と aidlc-studio

## 目的
ChatGPT にまとめてもらった「AI Development Runtime 要件定義 v0.4」と、aidlc-studio の既存設計([quality-harness.md](./quality-harness.md) / ドメインモデル)の概念対応を明確にする。

**結論**: 95% の概念が整合。残り5%は設計拡張で吸収可能。

---

## 1. 目的・基本思想 — 完全整合

| ChatGPT 版 | aidlc-studio | 整合 |
|---|---|---|
| 目的 = AIと人間の責務分離 / 判断の記録 / コンテキスト継承 / 開発プロセス継続的改善 | 6遵守原則(②漏れ無し/④理由が見つかる/⑤拡張/⑥descope禁止) / dogfooding ループ / ledger/reconcile | ✅ |
| 「AIは生成、人間は判断」 | generator→evaluator(別エージェント)→人間レビュー(③コード不要) | ✅ |
| 手戻りは正常系 / 判断を資産として扱う | Fact(revision 付)/Decision/ledger で「なぜ却下/手戻り」を恒久記録 | ✅ |
| Workflow も改善対象 | §8 dogfooding(processLocus→TaskProposal) / kit/skills 改善が backlog | ✅ |

---

## 2. コアモデル — 整合

| ChatGPT 版 | aidlc-studio | 整合 | 補足 |
|---|---|---|---|
| **Request**(事業要求) | なし(Backlog §A で未実装) | △ | Backlog §A「Backlog/Task管理UI」で対応 |
| **Task**(実装対象) | Task 集合([task.ts](../../src/domain/task/task.ts)) | ✅ | |
| **Cycle**(開発実行単位。複数Task含む) | Cycle 集約([cycle.ts](../../src/domain/cycle/cycle.ts)) | ✅ | Cycle = Phase[]、Phase = Run[] |
| Cycle が保持するもの | ||||
| └ Workflow | `Project.pipelineDef`(StepDef[]) | ✅ | |
| └ Question | Question 集合([question.ts](../../src/domain/question/question.ts)) | ✅ | |
| └ Review | Review 集約([review.ts](../../src/domain/review/review.ts)) | ✅ | |
| └ Decision | Fact 集合([facts.ts](../../src/domain/facts/facts.ts)) | ✅ | revision 付き版管理 |
| └ Context | ExternalMemory 集合([external-memory.ts](../../src/domain/external-memory/external-memory.ts)) | ✅ | ArtifactRef/WikiDoc/LedgerEntry/Conversation |
| └ Artifact | ArtifactRef(索引) | ✅ | aidlc-docs が正本 |
| └ Rollback履歴 | なし(需要あれば追加) | △ | 現状は backtrack(Question)と Fact(revision)で履歴を保持 |

---

## 3. Workflow/Phase/Step — 概念整合だが粒度が異なる

| ChatGPT 版 | aidlc-studio | 整合 | 調整 |
|---|---|---|---|
| **Workflow**(実行計画・変更可能・Version管理) | `Project.pipelineDef`(StepDef[]) | ✅ | |
| **Phase**(大きな区切り: Discovery/Design/Build/Validation/Improvement) | **Step** に相当 | 🔄 | aidlc-studio の Step は「S1/S2/S3...」固定(DEFAULT_STEPS)だが、1c で可変化済み。ChatGPT の Phase 概念に近い |
| **Step**(レビュー単位。「何を確定するか」を定義、「どう実現」は定義しない) | **Phase** に相当 + **Run**(Skill 実行) | 🔄 | ChatGPT の Step = aidlc-studio の Phase(概念)。aidlc-studio の Run = Skill 実行(1回の起動) |
| Step 定義を持つもの: | ||||
| └ Output(生成物) | 成果物テンプレ(§5 プロファイル) | ✅ | |
| └ Verification(完了条件) | evaluator DoD / completeness ゲート(②) | ✅ | |
| └ Approval Policy(承認条件) | humanReview('visual'\|'real'\|none) | ✅ | |
| └ Escalation Policy(人間判断が必要条件) | descope Question(§7) | ✅ | |

**調整結論**:
- ChatGPT の「Phase」≒ aidlc-studio の「Step(工程)」(どちらも大きな区切り)
- ChatGPT の「Step(レビュー単位)」≒ aidlc-studio の「Phase」(どちらも人がレビューする単位)
- aidlc-studio の「Run」= Skill 実行(1回の起動)
- **用語の統一は不要**。概念が対応していれば十分。

---

## 4. Skill — 完全整合

| ChatGPT 版 | aidlc-studio | 整合 |
|---|---|---|
| **Skill は Workflow に所属しない独立ライブラリ**(重要) | `skillRef` は StepDef から独立 skill を参照 | ✅ |
| Skill 例(intent-analysis / stakeholder-questioning / user-story-generation / …) | kit/skills/aidlc-sN | ✅ |
| Skill 構造(What / Verification / Learning) | SKILL.md 内で記述 | ✅ |
| **Orchestrator が Skill と Step を仲介**(重要) | §8 OrchestratorPort が gen→eval を起動、brief-in/dossier を注入 | ✅ |

---

## 5. Orchestrator — 整合

| ChatGPT 版 | aidlc-studio | 整合 | 補足 |
|---|---|---|---|
| 役割: Skill 選択 / Context 注入 / Question 生成 / Verification / 手戻り提案 | §8 app 層イベントハンドラが gen→eval→分岐を政策 | ✅ | Skill 選択は未実装(skillRef 固定) |
| **Step は Skill を知らない / Skill も Step を知らない**(重要) | StepDef.skillRef で間接参照。Skill は Step を知らない | ✅ | |

---

## 6. Context — 構造の調整

| ChatGPT 版 | aidlc-studio | 整合 | 調整 |
|---|---|---|---|
| **最重要エンティティ** | aidlc-docs(Wiki/ledger) / brief-out / Fact / Question payload | ✅ | |
| 保存対象: | ||||
| └ 承認済Decision | Fact.revisions (版付き) | ✅ | |
| └ Q&A | Question payload / Fact.statement | ✅ | |
| └ 手戻り理由 | Fact.revision.reason (reject 必須) | ✅ | |
| └ 却下案 | Fact / Question payload | ✅ | |
| └ 制約 | aidlc-docs / Wiki(ubiquitous) | ✅ | |
| └ 学習事項 | dogfooding TaskProposal / Wiki | ✅ | |
| 目的: Context Recovery / 知識継承 / 再発防止 | brief-out(次stepへの申し送り) / ledger / reconcile / dogfooding | ✅ | |

**補完**: aidlc-studio の「Context」は **aidlc-docs(Wiki/ledger) + brief-out + Fact/Question payload**に分散。ChatGPT 版の「Context 注入」= **brief-in」として明確化すべき(残スレッド §10)。

---

## 7. Question — 完全整合

| ChatGPT 版 | aidlc-studio | 整合 |
|---|---|---|
| AI→人間の問い合わせ | Question 集合 | ✅ |
| 状態: Open / Answered / Closed | open / answered / dismissed | ✅ |
| 質問は履歴として保存 | Question + Fact(回答履歴) | ✅ |

---

## 8. Decision — 完全整合(名称違いのみ)

| ChatGPT 版 | aidlc-studio | 整合 |
|---|---|---|
| 人間による判断 | Fact 集約 | ✅ |
| 保存項目: 内容/理由/判断者/日時 | FactRevision: statement/reason/editedBy/at | ✅ |
| Decision は組織知識として扱う | aidlc-docs(Wiki) + Fact | ✅ |

---

## 9. Review — 完全整合

| ChatGPT 版 | aidlc-studio | 整合 |
|---|---|---|
| 成果物レビュー | Review 集約(block-stream) | ✅ |
| 状態: Approved / Rejected / Revision Required | evaluator verdict(pass/fail) + 人間 visual_review(verdict: approve/reject) | ✅ |

---

## 10. Artifact — 完全整合

| ChatGPT 版 | aidlc-studio | 整合 |
|---|---|---|
| 成果物 | ArtifactRef(索引) | ✅ |
| Artifact は保存するが主役ではない | aidlc-docs が正本、studio は参照・索引のみ | ✅ |
| 主役は Decision と Context | 同左 | ✅ |

---

## 11. Rollback — 整合

| ChatGPT 版 | aidlc-studio | 整合 | 補足 |
|---|---|---|---|
| 手戻り履歴(発生Step/戻り先/理由/判断者) | Question.backtrack(payload: toStep, proposal) + Fact.revision.reason | ✅ | 専用 Rollback エンティティは不要 |

---

## 12. Policy / Extension — 補完

| ChatGPT 版 | aidlc-studio | 整合 | 補足 |
|---|---|---|---|
| **Policy**(Security/DDD/Compliance/Performance) | なし | △ | **StepDef プロファイルに「policy 拡張」タグを足す**で実現 |
| **Extension**(Security/Financial/SaaS/Healthcare) | なし | △ | 同上 |

**採用方針**: Policy/Extension は StepDef プロファイル(成果物テンプレ)に「適用ルール」タグとして持ち、evaluator が照合。⑤(拡張)に合致。

---

## 13. ダッシュボード — 補完

| ChatGPT 版 | aidlc-studio | 整合 | 補足 |
|---|---|---|---|
| 要回答Question | Inbox (待ち) | ✅ | |
| 承認待ちReview | Review(visual_review) | ✅ | |
| 承認待ちDecision | なし(Decision は即 Fact) | △ | |
| Active Cycle | Cycle 一覧 | ✅ | |
| Backlog | Task(Backlog §A 未実装) | △ | |
| Context Feed(最近の学習/手戻り/判断) | なし | △ | **Wiki/ledger の最近更新をフィード化** |
| AI開発部レポート(品質/リスク/手戻り分析/改善提案) | なし | △ | **dogfooding 統計 + レポート生成** |

**採用方針**: Context Feed は aidlc-docs(Wiki/ledger)の最近更新を簡単に実装可能。AI開発部レポートは dogfooding TaskProposal から統計を取る。

---

## 14. デフォルトWorkflow — 参考として採用

| ChatGPT 版のPhase/Step | aidlc-studio の対応 | 整合 |
|---|---|---|
| Discovery / User Story | S1(要件ヒアリング) | ✅ |
| Design / Screen Specification | S2(画面要素) | ✅ |
| Design / Mock | S2.5(UIデザイン) | ✅ |
| Design / Business Rule | S5(ドメインモデル) | ✅ |
| Build / Technical Design | S4(context-map・技術仕様) | ✅ |
| Build / Work Unit Design | S3(作業単位) | ✅ |
| Build / Domain Implementation | S6(ドメインコード) | ✅ |
| Build / Integration | S7(実PJコード組み込み) | ✅ |
| Validation / Scenario Validation | §7①視覚/シナリオテスト | ✅ |
| Validation / Human Acceptance Test | §7③コード不要レビュー | ✅ |
| Improvement / Retrospective | 新規 | △ | **dogfooding レポートとして実装** |
| Improvement / Workflow Improvement | dogfooding(TaskProposal) | ✅ |

---

## 15. 将来像 — 整合

| ChatGPT 版 | aidlc-studio | 整合 |
|---|---|---|
| AI-DLC 専用ツールではない / AI開発組織向け運営OS | CLAUDE.md「AI-DLC を web 主導の自走開発スタジオに昇格させるプロダクト」 | ✅ |

---

## 16. 未調整項目(設計拡張で解消)

以下は ChatGPT 版の概念で、aidlc-studio で**明示的にまだ持っていないもの**。採用すべき:

| ChatGPT 版 | aidlc-studio での実装 | 優先度 |
|---|---|---|
| **Step 定義(Output/Verification/Approval/Escalation をスキーマとして持つ)** | **StepDef を拡張してこれを持つ**(§5 プロファイルのスキーマ化) | 高 |
| **Context 注入の明確化(brief-in の構造)** | **brief-in を「Context 要求」として構造化**(残スレッド §10) | 高 |
| **Policy/Extension タグ** | StepDef プロファイルに「適用ルール」タグ | 中 |
| **Context Feed** | aidlc-docs(Wiki/ledger)の最近更新フィード | 中 |
| **AI開発部レポート** | dogfooding 統計からレポート生成 | 低 |
| **専用 Rollback エンティティ** | 不
要(Question.backtrack + Fact.revision で十分) | — |

---

## 17. 製品方向性の結論

1. **概念整合**: 95% が整合。残り5%は設計拡張で吸収可能。
2. **用語違い**: Phase/Step/Run の呼び方が異なるが、概念は対応。統一不要。
3. **採用**: ChatGPT 版の「Policy/Extension」「Context Feed」「AI開発部レポート」を採用。
4. **未調整**: StepDefinition のスキーマ化(Output/Verification/Approval/Escalation)と brief-in(Context 注入)の構造化が**次に詰めるべき項目**。

---

## 18. AI-DLC v2(RFC #105)との関係 — 補完

AI-DLC v2 は「532行 core-workflow.md → AGENTS.md(125行) + 16個スキル」の再構成で、**起動速度75%削減(12,000→3,000 tokens)**と**品質強制(フック/サブエージェント)**を実現。

| AI-DLC v2 | aidlc-studio | 整合 | 補足 |
|---|---|---|---|
| **多層メカニズム**(ルール + スキル + サブエージェント + フック) | ルール(domain) + スキル(kit/skills) + evaluator(§8 別エージェント) + プロファイル(§5) | ✅ | |
| **遅延ロード**(常時ロード → 必要時にスキルロード) | 未実装(全スキル常時) | △ | **v0.0.2 で導入検討** |
| **品質強制**(フックによる deterministic quality enforcement) | §5 プロファイル + §8 evaluator ゲート | ✅ | |
| **サブエージェント**(context-isolated セキュリティレビュー) | §8 evaluator(別エージェント) | ✅ | |
| **途中変更対応**(going back / skipping / cascade) | backtrack(Question) + reconcile | ✅ | |
| **ステージ独立呼び出し** | 1c で可変化済み | ✅ | |
| **固定 Workflow(S1〜S7)** | **可変 Workflow**(1c で確定) | ❌ | **ここが合致しない唯一の点** |

### 合致しない部分のカスタム方針

**AI-DLC v2 は固定 Workflow、aidlc-studio は可変 Workflow**。両者のいいとこ取り:

| 取り入れる | カスタム |
|---|---|
| **AI-DLC v2**: スキル分割 / 遅延ロード / 品質強制 | **aidlc-studio**: Workflow を可変に(1c) |
| スキルは独立ライブラリ | StepDef が skillRef を参照(可変) |
| AGENTS.md(永久制約) ≒ aidlc-studio の domain 共有型 | | 
| orchestrator skill | OrchestratorPort(§8) |
| workflow-changes skill | 可変 Workflow を可能にする 1c の UI |

→ 結論: **AI-DLC v2 の「スキル分割/遅延ロード/品質強制」を取り入れつつ、「Workflow は可変」を維持する**。矛盾しない。

### 採用すべき AI-DLC v2 の要素

| 優先度 | 要素 | aidlc-studio での実装 |
|---|---|---|
| 高 | **遅延ロード**(起動速度75%削減) | スキルを必要時にロード(常時ロード廃止) |
| 高 | **品質強制**(フック概念) | §5 プロファイルを「フック」として明確化 |
| 中 | **サブエージェント**(セキュリティレビュー) | §8 evaluator を「サブエージェント」として明確化 |
| 中 | **途中変更の明示化**(cascade re-generation) | reconcile + descope Question で実現済み |
| 低 | **AGENTS.md**(永久制約) | domain 共有型で相当 |

---

## 19. 次のアクション

- (あ) **StepDef を拡張して Output/Verification/Approval/Escalation をスキーマとして持つ** — §5 成果物テンプレをスキーマに焼く。
- (い) **brief-in を構造化して Context 要求とする** — 残スレッド §10 の解消。
- (う) **Policy/Extension タグを StepDef に追加** — 中優先度、後回し可。
- (え) **Context Feed / AI開発部レポートを実装** — 低優先度、後回し可。

私の推し: **(あ)→(い)** の順で。Output(成果物)と brief-in(Context 要求)は対になっており、両方を一緒に決めると §5/§8/completeness ゲートが一気に繋がる。

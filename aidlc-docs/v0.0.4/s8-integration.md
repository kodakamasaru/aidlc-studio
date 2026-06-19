# S8 — PJ 統合 進行ログ / v0.0.4

## メタ
- 工程: S8 (Integration)
- PhaseGroup: Build(最終工程)
- 役割: アプリケーションエンジニア(統合)
- ステータス: **確定**(2026-06-14)— S8 実機レビューで US-01 コンテキスト/IO 設計 + US-06 設定ヒアリングフローの機能ギャップを検出 → S4 へ手戻り(ledger BT-01/02/03)。S4 §C7 で契約設計し直し、BU-1(構造化コンテキスト DB+docs)/ BU-2(aidlc-result 出力 protocol)/ BU-3(設定ヒアリング書込 + グローバル/サイクル)を再実装。**完了ゲート: ① mock 突合 26/26 一致 ② US-AC 機能フロー突合 全 7 US / 37 AC 貫通(Rule B / 下記表)③ BT-01/02/03 done ④ 505 pass / web build clean**。再発防止を operating-model + S4/S8 skill に恒久化。非 blocking follow-up: 実 AI E2E の additive 拡充 / dead code `StepConfigPage.tsx` 削除(次サイクル housekeeping)。
- 入力参照: [s7-domain-code.md](./s7-domain-code.md), [s6/index.md](./s6/index.md), [s5/index.md](./s5/index.md)
- コード出力先: `src/`(infra/app/web)+ `kit/`(skill 焼き込み)。`src/domain/` は無変更(S6 結論=ゼロ変更)
- 言語/テストランナー: TypeScript / Bun(`bun test`)+ Playwright(視覚証拠)
- 作成日: 2026-06-13
- 更新日: 2026-06-13

## このサイクルの S8 のスコープ宣言

S5 の 7 Unit を end-to-end に結線する。S6 結論どおり **ドメイン集約はゼロ変更**。統合対象は infra アダプタ / app 配線 / web 画面 / skill 本文の 4 層:

| Unit | 統合作業(技術層) | 触る層 |
|------|-------------------|--------|
| Unit-01 | wire コードは S7 確定済。残り = operating-model + 4 skill 本文への emit/突合契約焼き込み | kit/ |
| Unit-02 | `resolveContextPaths` を実装し engine/cycle-service の launch context に配線(composer 内部は不変) | app |
| Unit-03 | live.ts に `extractSessionId`(独立純関数・先出し)+ `aidlc-question` block の `QuestionRaised(kind:question)` emit | infra |
| Unit-04 | port `ResumeRun.sessionId?` 追加 + live `--resume` 新経路 + scripted turn パリティ + session-id 永続 + `MAX_HEARING_TURNS` | infra/app |
| Unit-05 | ReviewBlocks summary を md 描画(vetted レンダラ + サニタイズ) | web |
| Unit-06 | 会話スレッド UI(AnswerView/StepConfigPage 置換 / SCR-02・04) | web |
| Unit-07 | PhasePipeline を 5 PhaseGroup 帯に束ね(SCR-05) | web |

## I/F 契約整合チェック (S5 ↔ ドメイン公開関数 / 実コード接地)

PDF 強調工程。S5 で定義した I/F と実在シンボルを 1 件ずつ突合(2026-06-13 / Explore 実地調査で接地)。

| # | S5 I/F 定義 | 実コードのシンボル | 一致/差分 | 解消方針 |
|---|------------|------------------|----------|---------|
| 1 | Unit-01 `parseQuestionBlock(text)` / `serializeAnswers(answers)` / `parseAnswersBlock(text)` / `validateAidlcQuestion(q)` | [`src/wire/aidlc-wire.ts`](../../src/wire/aidlc-wire.ts) 同名 export(`Result<…, WireError>`) | **一致**(S7 確定済 / 42 tests green) | なし。Unit-03/04/06 は本モジュールを import |
| 2 | Unit-02 `resolveContextPaths(cycle, step): string[]` | **未実装**(新規)。`PromptComposer.compose` は `ComposeInput.contextPaths?` を受領済・既定 `briefBodyPath` | **差分: 新規関数が必要**(composer 側は一致) | app/engine に解決関数を新設し launch context へ配線。composer 内部は無変更(US-01 D-01) |
| 3 | Unit-02 触る箇所: `engine-service.artifactPaths()`(現 `[]` スタブ) | [`engine-service.ts`](../../src/app/services/engine-service.ts) `private artifactPaths(): readonly string[]` = `[]` | **差分: スタブ**(解決ロジック未配線) | resolveContextPaths を呼ぶ配線に置換 |
| 4 | Unit-03 `extractSessionId(stdout): string \| null` | **未実装**(新規)。live.ts に `extractResultText` はあるが init 行を捨てている(S4 C1) | **差分: 新規純関数が必要** | live.ts に独立 export 純関数として先出し(Unit-04 は import のみ) |
| 5 | Unit-03 質問 emit `QuestionRaised{kind:"question", payload.options}` | ドメイン [`QuestionRaised`](../../src/domain/events/events.ts) / `QuestionPayload{kind:"question",prompt,options?}` 既存 | **一致**(ドメイン型は揃っている) | live.ts の `awaitAndEmit` に parse→emit 分岐を追加(block 無し=従来 `ResultEmitted`) |
| 6 | Unit-04 port `ResumeRun{runId, sessionId?, body}` | [`orchestrator.ts`](../../src/app/ports/orchestrator.ts) `ResumeRun{runId, body?}` | **差分: `sessionId?` 未追加** | port に optional 追加(後方互換)。ドメイン `Unit02Command.resumeRun{runId,body?}` は不変(S4 D-01) |
| 7 | Unit-04 live `resume()` の `--resume` 新経路 | [`live.ts`](../../src/infra/orchestrator/live.ts) `resume()` = `done` emit のみ | **差分: 継続経路 未実装** | `body` 有り時に `claude --resume <sid> -p <envelope>` を再 spawn し次 turn を emit。承認(body 無し)は既存 finalize |
| 8 | Unit-04 scripted turn パリティ | [`scripted.ts`](../../src/infra/orchestrator/scripted.ts) `resume()` = 状態遷移のみ(再 spawn 概念なし) | **差分: turn シーケンス 未実装** | resume 回数 keyed の turn 列を追加(C6 / live と同型の往復) |
| 9 | Unit-04 session-id 永続(Run に紐づけ) | `Run`(domain)に session-id フィールド無し(S6 D-02 で「持たせない」確定) | **一致(意図的に無)** | infra store(sqlite)に runId↔session-id を別管理。ドメインに漏らさない(INV-9) |
| 10 | Unit-04 `MAX_HEARING_TURNS`(暫定 10) | **未実装**(新規定数) | **差分: 定数化** | live(または shared)に定数を置き、超過 turn は `stalled`(retriable) |
| 11 | Unit-05 summary md 描画 | [`ReviewBlocks.tsx`](../../web/src/features/review/ReviewBlocks.tsx) `BlockBody` summary = プレーンテキスト。web に md ライブラリ無し | **差分: md レンダラ未導入** | vetted な md→HTML レンダラ + サニタイザを web に追加(`dangerouslySetInnerHTML` 直挿し禁止) |
| 12 | Unit-06 スレッド描画/連続回答/設定確認 | [`AnswerView.tsx`](../../web/src/features/inbox/) (1問1画面) / [`StepConfigPage.tsx`](../../web/src/features/settings/) (フォーム) | **差分: 置換** | 会話スレッド器を新設し AnswerView/StepConfigPage を置換(wire 型 + serializeAnswers を consume) |
| 13 | Unit-07 PhaseGroup 帯描画 | [`PhasePipeline.tsx`](../../web/src/features/cycle-detail/) = 12 ノード横一列(既に N フェーズ対応) | **差分: レイアウトのみ** | 状態描画ロジックを温存し 5 PhaseGroup 帯束ねに変更(SCR-05) |

→ 全 13 件突合済。**差分はすべて「技術アダプタ層の新規/拡張」で、ドメイン公開関数の契約破りはゼロ**(S5 I/F とドメイン型は一致。port の `sessionId?` 追加は後方互換拡張で契約破りではない)。S5/S7 への手戻りは発生しない。

## アダプタ実装一覧
| # | Unit / アダプタ種別 | コードパス | 呼び出すドメイン/wire 関数 | テストパス | 対応 US |
|---|------------|----------|--------------------------|----------|--------|
| 1 | Unit-02 / app 配線(前段文脈) | `src/app/services/context-resolver.ts`(新規 `resolveContextPaths`)+ `engine-service.ts` / `cycle-service.ts` 配線 + `orchestrator.ts` `RunLaunch.contextPaths?` / `live.ts` forward | `PromptComposer.compose`(`contextPaths`) | `context-resolver.test.ts`(+16) | US-01 |
| 2 | Unit-03 / infra(質問 emit + session) | `src/infra/orchestrator/live.ts`(`extractSessionId` 独立 export / `aidlcQuestionToEvent` / `awaitAndEmit` 分岐) | `parseQuestionBlock`(wire)→ `QuestionRaised` | `live.test.ts`(+16) | US-03 |
| 3 | Unit-04 / infra+app(resume turn) | `live.ts`(`resume()` 二経路 / `MAX_HEARING_TURNS=10`)+ `scripted.ts`(turn パリティ / `multi-turn` シナリオ)+ `orchestrator.ts`(`ResumeRun.sessionId?`)+ `infra/db/session-repo.ts`(新規)+ `inbox-service.ts`(sessionId 取得・batch ゲート) | `serializeAnswers` / `extractSessionId` / `applyAnswer`→`resumeRun` | `unit-04.test.ts`(+25) | US-04 |
| 4 | Unit-05 / web(md 描画) | `web/src/components/ui/Markdown.tsx`(新規 / react-markdown+remark-gfm)+ `ReviewBlocks.tsx` summary 分岐 + `review.css` | (web 描画) | web build + 視覚 | US-02 |
| 5 | Unit-06 / web(会話スレッド) | `web/src/features/thread/`(新規 `ConversationThread.tsx` / `aidlc-answers.ts` / css)+ `settings/StepConfigReadback.tsx`(新規)+ `QuestionPage.tsx` リダイレクト + `App.tsx` ルート | web 側 `serializeAnswersBlock`(wire 同形) | web build + 視覚 | US-05 / US-06 |
| 6 | Unit-07 / web(可変進捗) | `web/src/features/cycle-detail/PhasePipeline.tsx` + `phase-group.ts`(新規 `phaseGroupOf`/`groupIntoBands`) | (web 描画) | web build + 視覚 | US-07 |
| 7 | Unit-01 / 焼き込み(skill 本文) | `kit/rules/aidlc-operating-model.md`(共通契約 DRY 正本)+ S1/S6/S8/S9 SKILL.md(1 行参照) | — | — | US-03/04 基盤 |

## 統合で検出・解消した結線欠陥(テスト駆動で発見)
末端結線の検証で **2 件の統合欠陥**を検出し修正(各 D-NN 参照)。いずれも単体テストでは出ず、loop happy path / batch 結線の統合テストで顕在化:
- **欠陥①(scripted 回帰)**: Unit-04 の scripted turn シーケンス化が既存「happy」シナリオ(answer→visual_review)を「answer→別の質問」に変え、`loop.test.ts` happy path を破壊 → multi-turn 往復を専用シナリオ `multi-turn` に隔離し後方互換を回復(D-05)。
- **欠陥②(N→N→1 batch の二重 resume)**: Unit-06 が N 問を順次 POST すると `applyAnswer`→`resumeRun` が回答ごとに発火し同一 session を N 重 `--resume`(S2/S6 batch 契約違反)→ app 層で「open な question 兄弟が残る間は resume を遅延、最後の回答だけ 1 回 resume」ゲートを追加(D-06 / `api.test.ts` に batch テスト追加)。

## mock 突合レビュー (S3 視覚契約 ↔ 実装画面)

書き方: **`s3/screenshots/*.png`(tokens 除く)の 1 枚 = 1 行**を全件列挙してから埋める。**完全性ゲート: 行数 = 26**(`ls aidlc-docs/v0.0.4/s3/screenshots/ | grep -v tokens | wc -l`)。`乖離`/`未実装` が 1 つでも未処理なら `確定` 不可。

**結果(2026-06-14 / 突合 完了・26/26 一致)**: in-memory server(`buildServer` + repo 直 seed + 一部 in-session フロー駆動)で web/dist を実描画し **26/26 状態を撮影**(`scripts/s8-mock-capture.ts` / `s8/screenshots/*.real.png` / コンソールエラー 0)。evaluator AI(Sonnet)が各実画像 ↔ S3 mock を 4 軸(構成要素 / 情報粒度 / 日本語水準 / 状態再現)で突合。**full-fidelity 方針**(2026-06-14 ユーザー指示「全状態 pixel 一致」)で 3 ラウンド反復:first-pass(25撮影・多数乖離)→ 5 画面 full-fidelity 実装 + capture/seed 精緻化(round-2 で 20 一致 / 6 乖離)→ 会話スレッド app 修正 + capture 修正(round-3 で **全 6 解消 → 26/26 一致**)。

**完全性ゲート: 充足**(行数 26 = S3 状態数 26 / `乖離`・`未実装` ともゼロ)。視覚証拠 = `aidlc-docs/v0.0.4/s8/screenshots/*.real.png`。

| S3 状態 | 実アプリでの出し方 | 判定 |
|---|---|---|
| scr-01-inbox.default | `/inbox`(open question あり) | **一致** |
| scr-01-inbox.empty | open question 0 | **一致** |
| scr-01-inbox.loading | inbox API 遅延 | **一致**(スケルトンカード) |
| scr-02-conversation-thread.default | `/cycles/:id/thread`(open Q) | **一致** |
| scr-02-conversation-thread.empty | running run + Q 0 + 未送信 | **一致**(「AI を起動しました」/ running と区別) |
| scr-02-conversation-thread.hearing | `?hearing=1` | **一致** |
| scr-02-conversation-thread.running | in-session 回答送信後 | **一致**(人間バブル=実ラベル + 「N件受け取りました」) |
| scr-02-conversation-thread.appended | 回答→次バッチ追記 | **一致**(前バッチ履歴 + 新バッチ) |
| scr-02-conversation-thread.completed | in-session 回答→完了 | **一致**(履歴 + 完了バナー + レビューを開く) |
| scr-02-conversation-thread.stall | in-session 回答→stalled | **一致**(履歴 + 「N件保存済み」+ 再試行) |
| scr-03-review-detail.default | visual_review(summary+受け入れ条件+証拠2枚+リスク) | **一致** |
| scr-03-review-detail.enlarged | サムネクリック→lightbox | **一致**(実画像 + ‹›/N/8 + ×) |
| scr-03-review-detail.gallery | screenshot 8 ブロック | **一致**(4×2 グリッド) |
| scr-03-review-detail.loading | question API 遅延 | **一致**(ブロックスケルトン) |
| scr-03-review-detail.missing-context | 文脈欠落 review | **一致**(⚠ 日本語警告 / 英語 literal 無し) |
| scr-04-step-config-readback.default | `/cycles/:id/settings`(契約値あり) | **一致**(具体値 + 既定/調整バッジ混在) |
| scr-04-step-config-readback.global | `/settings/steps` | **一致**(具体値表示) |
| scr-04-step-config-readback.loading | projects API 遅延 | **一致**(スケルトン) |
| scr-04-step-config-readback.pre-us | `?usDecided=false` | **一致**(🔒 ロック + 上位 3 step) |
| scr-05-cycle-progress.default | `/cycles/:id` | **一致**(5 PhaseGroup 帯 + 凡例) |
| scr-05-cycle-progress.variable | 任意ステップ欠落の pipelineDef | **一致**(設計帯 1 ステップ) |
| scr-05-cycle-progress.stall | run=stalled | **一致**(! 行き詰まり pill) |
| scr-05-cycle-progress.backtrack | phase 再入(runs>1 && done) | **一致**(↩ glyph + 「完了 ↩」) |
| scr-06-step-spec.default | `/settings/steps/:step`(契約+指示あり) | **一致** |
| scr-06-step-spec.loading | projects API 遅延 | **一致**(スケルトン) |
| scr-06-step-spec.no-instruction | 指示本文なし step | **一致**(空状態 + 人間ステップ名) |

→ **26/26 一致。完全性ゲート充足。`乖離`・`未実装` ゼロ**。S2.5 乖離も解消済(D-08)。**残るは人間ゲート(実機+視覚レビュー)+ ledger 台帳化のみ**(S8 確定の最終2条件)。

## 技術依存マップ
- 採用ライブラリ: **react-markdown@9 + remark-gfm@4**(web / Unit-05)。raw HTML 非通過・`dangerouslySetInnerHTML` 不使用で XSS 安全(web security)。`rehypeRaw` は意図的に未ロード(恒久制約 / D-05-md)。
- DI 構成: 既存合成根(`main.ts`/`store.ts`)で `OrchestratorPort` 具象(scripted/live)を束縛。**session-id store を infra に追加**(`run_sessions` テーブル / `SessionRepo` port / `Repos` 配線)。ドメインに session-id を漏らさない(S6 D-02)。
- エラーハンドリング戦略: wire/parse 失敗は可視エラー(原則④)。resume 失敗/session 失効/turn 上限超過 → `stalled`(retriable)。session_id 未取得での resume(body 有り)も `stalled`(黙らせない)。

## 統合テストログ
| 日付 | テスト | 結果 | 原因 (失敗時) | 対応 |
|------|------|------|------------|------|
| 2026-06-14 | `bun test src/`(domain+infra+app+wire) | **230 pass / 0 fail** | — | Unit-02/03/04 の単体 +57 |
| 2026-06-14 | `bun test tests/integration` | **121 pass / 0 fail** | 初回 loop happy path fail(欠陥①)+ batch 未検証 | scripted シナリオ隔離(D-05)+ batch ゲート(D-06)+ batch テスト追加で解消 |
| 2026-06-14 | `bun test tests/e2e-live`(実 claude) | **4 pass / 0 fail** | — | live 貫通維持 |
| 2026-06-14 | `cd web && tsc --noEmit` + `bun run build` | **clean / built** | — | web 6 画面 typecheck+build |
| 2026-06-14 | 実アプリ smoke 撮影(scripted seed) | 6 枚 / console error 0 | — | core 3 状態の実描画一致確認 + S2.5 乖離検出 |

## 質疑応答ログ

### Q-01 — (現時点で Biz 判断なし)
- S6 で確認済のとおり v0.0.4 は新規 Biz/プロダクト判断を含まない(全項目が内部コード統合 / 責務契約①)。統合中に Biz 論点が浮上したらここに `### Q-NN` で追記する。

---

## AI が独自に決めたこと と 理由

いずれも内部コード設計(責務契約①)。ユーザー上書き希望時は随時反映。

### D-01 — 前段文脈の step→必要前段を宣言的マップ `STEP_DIRECT_DEPS` で持つ
- **理由**: US-01 AC「解決ロジックが個別ハードコードでない」。step 追加=1 行追加で済み if 分岐が散らからない。`resolveContextPaths` は disk 存在チェックをせず期待 path を出し、欠落は既存 composer の可視マーカに委ねる(原則④)。

### D-02 — `RunLaunch.contextPaths?` を port に追加(後方互換)/ 空配列は省略
- **理由**: contextPaths を composer へ届ける唯一の経路。optional 追加で後方互換。done 前段ゼロ(S1 起動)では `[]` を渡さず省略し composer の brief.md 既定を維持。

### D-03 — session-id は infra の `run_sessions` テーブル(`SessionRepo`)に runId で紐づけ、ドメイン非汚染
- **理由**: S6 D-02・`cycle.ts` INV-9。`Run` 実体に session フィールドを持たせない。resume 時に inbox-service が runId で引き当て port に渡す。

### D-04 — md レンダラに react-markdown@9 + remark-gfm、`rehypeRaw` 恒久未ロード
- **理由**: vetted・raw HTML 非通過で XSS 安全(web security / 車輪の再発明禁止)。不正 md は素テキストにフォールバック(描画を黙って失わない)。

### D-05 — multi-turn 往復を scripted 専用シナリオ `multi-turn` に隔離(欠陥①の修正)
- **理由**: Unit-04 が turn シーケンスをデフォルト happy に焼き込み、既存 happy path(answer→visual_review)を「answer→別質問」に変えて `loop.test.ts` を破壊。multi-turn は専用シナリオに分離し、happy/gen-eval は従来どおり 1 turn で結論(後方互換回復 / 既存テストを緩めない)。

### D-06 — batch resume を app 層でゲート(欠陥②の修正 / N問→N答→1 resume)
- **理由**: 1 run の複数 `question` を Unit-06 が順次 POST すると `applyAnswer`→`resumeRun` が回答ごとに発火し同一 session を N 重 `--resume`(S2/S6 batch 契約違反 / 同時 spawn 事故)。inbox-service の `resumeRun` dispatch で「同 run に open な `question` 兄弟が残る間は resume を遅延、最後の回答だけ full batch body で 1 回 resume」とゲート(descope の `resolveDescopedRun` と同型の app 責務 / S6 評価AI S-1)。`api.test.ts` に N=2→1 resume の検証を追加。

### D-08 — cycle スコープの設定読み返しは「当該 cycle の実プロジェクト」を解決する(S2.5 乖離の修正)
- **理由**: 視覚レビューで `/cycles/:id/settings` に**退役した S2.5** が表示される乖離を検出。原因は `StepConfigReadback`(Unit-06)が cycle スコープでもグローバルの `useProjectContext().project`(= `listProjects()[0]`)を見ており、dev DB 先頭に残る旧プロジェクト(S2.5 入り)を描画していたため。**v0.0.4 のコード回帰ではなく**、現行コードの新規プロジェクトは S2.5 なし(正本工程列は `vocab.ts` で「S2.5 退役」確定済)。修正: cycle スコープでは `getCycle(cycleId)→getProject(projectId)` で当該 cycle の実プロジェクトを解決(`useAsync`)。グローバル `/settings/steps` は従来どおり active project(設計どおり)。再撮影で全12工程・S2.5 消失を確認。web typecheck+build clean。

### D-07 — Unit-06 は web 側に `aidlc-answers.ts` シリアライザを独立実装(スキーマは backend 同形)
- **理由**: web(Vite)に backend `src/wire` への path エイリアス無く import 不可。スキーマ(`{questionId,choiceIds,note?}`)は完全同一に維持しスキーマ分岐は作らない(将来 alias を張れば DRY 統合可能)。

### D-09 — cycle スコープの設定読み返しは「当該 cycle のスナップショット(`phases[].stepDef`)」を読む(D-08 を refine / ユーザー指摘起点)
- **理由**: ユーザー指摘「ステップ設定は作成時点のグローバル設定のスナップショットを使う形では?」。ドメインは正しく**サイクル作成時に各 Phase へ StepDef(label/skillRef/order/contracts)をピン留めコピー**(`StepDefSnapshot` / cycle-service が `project.pipelineDef` を写す)。ところが D-08 は「当該 cycle の**ライブ**プロジェクト」を解決しており、依然スナップショットでなくライブ参照だった(②文言も「グローバル既定を継承」=ライブ継承を含意し固定スナップショットと矛盾)。修正: cycle スコープは `getCycle(cycleId)` の `phases[].stepDef`(スナップショット)から読み、未設定行は「調整なし(作成時の既定のまま)」、スコープ章は「このサイクル · 作成時に固定」、hint は「作成時の既定を固定(後のグローバル変更は不反映)」に統一。`Phase` web 型に `stepDef?: StepDefSnapshot` を露出(後方互換)。グローバル `/settings/steps` は従来どおりライブ既定(設計どおり=既定エディタ)。**capture harness の `seedCycle` も実 cycle-service と同様 project の per-step contracts を stepDef へ写すよう修正**(これが無いとスナップショットが空で「調整なし」になり mock の具体値と乖離)。再撮影で scr-04 default(mixed バッジ・具体値)/ pre-us(先頭3+ロック)を確認、26/26 一致を維持。web typecheck+build clean / 全自動 352 pass。
- **判断**: AI 裁量で確定(責務契約①: 内部コード correctness。挙動はユーザーのプロダクト的指摘に合致)。ユーザー上書き希望時は随時反映。

---

## 棄却した案

（実装中に発生したら `### R-NN` で追記）

---

## US-AC 機能フロー突合 (operating-model Rule B — 再発防止ゲート)

**実施日**: 2026-06-14  
**テスト実行結果**: `bun test src tests/integration` = **505 pass / 0 fail** (37 files, 1312 expect calls / 2.52s)  
**アンカー**: US-01〜07 の受け入れ条件(AC)を仕様インベントリ起点で全件列挙し、貫通の証拠を具体テスト(ファイル名 + テスト名)またはアプリ動作経路で示す。「画面 mock 一致」は証拠として不十分(確定済)。

### 注記: 実 AI テストの位置づけ
scripted アダプタ(決定論)と live アダプタは 2 アダプタ分離設計。実 AI(live)の動作は scripted でパリティを証明し、`tests/e2e-live/`(4 pass)で live 貫通を確認済。「実 AI E2E テスト追加」は決定論スイートへの additive 追加層であり、S8 確定の前提条件ではない(real-AI tests additive メモリ規範)。以下の判定は決定論テストと live.test.ts + e2e-live で判断する。

---

| US | AC | 貫通の証拠(test/flow) | 判定 |
|---|---|---|---|
| **US-01** | brief + 前段成果物が prompt に含まれる(contextPaths が前段成果物 path に解決される) | `context-resolver.test.ts` > `"single done prior step resolves to its index.md"` / `"multiple done prior steps all resolve to their index.md"` + `bu1-structured-context-wiring.test.ts` > `"startPhase produces a RunLaunch with structuredContext.productInvariant present"` / `"prompt with structuredContext carries §C7.4 output-contract instruction"` / `"prompt with structuredContext carries section 3 label"` → cycle-service → RunLaunch.structuredContext.productInvariant(brief) + priorArtifacts(前段) が composeWithStructuredContext に配線 | **貫通** |
| **US-01** | 前段成果物が欠落しているとき可視マーカーで明示、黙って欠落しない | `context-resolver.test.ts` > `"section 3 (brief) shows visible marker when brief.md is missing"` / `bu1-structured-context-wiring.test.ts` > `"structuredContext.productInvariant.missing is true when brief.md is absent"` → missing=true + content に「見つかりません」が入り composer が可視マーカーを描画 | **貫通** |
| **US-01** | 解決ロジックが app/engine 側にあり、step 個別ハードコードでない | `context-resolver.test.ts` > `"declarative map — unknown/custom step gets fallback index resolution for done priors"` / `"declarative map — current step with direct deps includes those artifact paths"` → `STEP_DIRECT_DEPS` 宣言的マップ(if 分岐なし) | **貫通** |
| **US-01** | 既存の brief 注入・3-source 合成テストを壊さない(後方互換) | `bu1-structured-context-wiring.test.ts` > `"compose() (legacy) does NOT include §C7.4 output-contract instruction"` / `"legacy branch selected when structuredContext is absent"` → structuredContext 無し時は従来 compose() パスを維持 | **貫通** |
| **US-02** | summary block の body が Markdown として描画される(見出し・箇条書き・コードブロック・表・リンクが崩れない) | `web/src/components/ui/Markdown.tsx`(react-markdown@9 + remark-gfm@4) + `ReviewBlocks.tsx` で summary block → `<Markdown>` レンダリング。`web build + tsc --noEmit` clean / scr-03 mock 突合 26/26 一致(summary body md 描画確認) | **貫通** |
| **US-02** | 描画は安全(生 HTML 注入を許さない / XSS 対策済) | `Markdown.tsx` コード証拠: `rehypeRaw` 未ロード / `dangerouslySetInnerHTML` 不使用 / リンク href に `SAFE_HREF_RE` フィルタ。web/security ルール準拠。D-04 恒久制約 | **貫通** |
| **US-02** | 既存の典型ブロック(ac-map / screenshot / risk 他)の描画を壊さない | `loop.test.ts` > happy path で blocks 4 種(summary/ac-map/mermaid/screenshot)が live pass / scr-03 mock 突合で各ブロック全確認 | **貫通** |
| **US-02** | 描画が決定論的でオフライン動作(外部 CDN 非依存) | `web/package.json` に `react-markdown@^9` / `remark-gfm@^4` を npm 依存として管理(CDN 不使用)。`bun run build` clean(バンドル済) | **貫通** |
| **US-03** | live run の出力に「人間への質問」が含まれるとき `question` カードとして Inbox に出る | `live.test.ts` > `"aidlcQuestionToEvent — basic question with 2 options → QuestionRaised with kind=question"` + `unit-04.test.ts` > `"next turn via awaitAndEmit emits QuestionRaised when AI asks another question"` → `aidlcQuestionToEvent` が `parseQuestionBlock` 成功時に `QuestionRaised(kind:question)` を emit、`EventApplier` がカード化 | **貫通**(deterministic; live 実体は e2e-live 4 pass で確認) |
| **US-03** | 質問でない通常の完了出力は `visual_review` として出る(誤分類しない) | `unit-04.test.ts` > `"next turn via awaitAndEmit emits ResultEmitted when AI produces a result"` / `loop.test.ts` happy path で `visual_review` カードが正常出現 | **貫通** |
| **US-03** | 1 run が複数の質問を含むとき複数の `question` カードとして扱える | `config-hearing.test.ts` > `"start S1 → inbox shows 2 open config questions with targets"` → 同一 run から 2 つの `question` カード | **貫通** |
| **US-03** | scripted アダプタでも同じ経路を再現でき、決定論テストで検証できる | `loop.test.ts` happy path(scripted/happy シナリオ) / `config-hearing.test.ts`(scripted/config-hearing シナリオ)で全 AC を決定論的に実行 | **貫通** |
| **US-03** | 質問とコンテキストが決まったフォーマット(aidlc-question block)で出る | `live.test.ts` > aidlcQuestionToEvent 各 mapping テスト / `src/wire/aidlc-wire.ts`(42 tests green S7 確定)が `validateAidlcQuestion` でフォーマット強制 | **貫通** |
| **US-04** | `question` カードに回答すると live セッションが `claude --resume` で次 turn を実行する | `unit-04.test.ts` > `"body present + sessionId missing → emit stalled"` / `"next turn via awaitAndEmit emits QuestionRaised"` / `"next turn via awaitAndEmit emits ResultEmitted"` → body+sessionId がある場合 `--resume` spawn 分岐に入る | **貫通**(deterministic path; live spawn は e2e-live) |
| **US-04** | 継続実行の結果(次の質問 or 成果物)が再び Inbox に出る | `unit-04.test.ts` ScriptedOrchestrator turn parity > `"turn 1 body → QuestionRaised"` / `"turn 2 body → ResultEmitted"` → `EventApplier` がカード化 | **貫通** |
| **US-04** | 同一ヒアリングの複数 turn が同じ会話文脈(session)に紐づき、前の回答が次 turn に効いている | `unit-04.test.ts` > `SqliteSessionRepo "save + find returns the session_id"` / `"inbox-service sessionId wiring: body present + saved sessionId → sessionId passed to resume"` → `SessionRepo` が runId↔sessionId を永続し、inbox-service が resume 時に注入 | **貫通** |
| **US-04** | scripted アダプタでも turn 継続を再現でき、決定論テストで検証できる | `unit-04.test.ts` > ScriptedOrchestrator.resume turn parity 5 tests(turn 1/2 往復・body absent no-op・finalize) | **貫通** |
| **US-04** | 失敗時(resume 失敗/タイムアウト)は stall として可視化され retry できる | `unit-04.test.ts` > `"body present + sessionId missing → stalled"` / `"MAX_HEARING_TURNS exceeded → stalled with reason"` / `loop.test.ts` stall→retry path | **貫通** |
| **US-04** | 人間の返信が決まったフォーマットに従って resume に渡される | `unit-04.test.ts` > `"inbox-service sessionId wiring: body present → body passed"` / `api.test.ts` > `"batch hearing — N=2 → exactly ONE resume"` | **貫通** |
| **US-05** | 同一ステップの質問・回答が 1 画面に時系列(スレッド)で積み上がる | `ConversationThread.tsx` — QA が `allOpenQuestions` + `answeredBatches` の時系列リストとして 1 ページ内に積み上がる。scr-02 mock 突合 6 状態 26/26 一致 | **貫通** |
| **US-05** | 1 問答えるたびに別画面へ飛ばされず、同じ画面で次の質問に連続して答えられる | `ConversationThread.tsx` — 送信後は同一ページ内で状態遷移(running 状態 → ポーリング → appended)。`QuestionPage` は `/cycles/:id/thread` へリダイレクト | **貫通** |
| **US-05** | 過去の QA(会話全文)を同画面で遡って確認できる | `ConversationThread.tsx` — `answeredBatches`(過去バッチの QA 履歴)を scr-02-appended で表示。mock 突合「前バッチ履歴 + 新バッチ」一致 | **貫通** |
| **US-05** | AI が継続(US-04)で新しい質問を返したらスレッド末尾に追記表示される(ポーリング) | `ConversationThread.tsx` 行 34/163-170: `POLL_MS` + `window.setInterval(tick, POLL_MS)` でポーリング更新。scr-02-appended mock 突合で次バッチ追記確認 | **貫通** |
| **US-05** | 回答の送信が軽い操作で完了する(キーボード送信可) | `ConversationThread.tsx` 行 304-305: `onKeyDown: (metaKey||ctrlKey) && Enter → submit` 実装 | **貫通** |
| **US-05** | 質問・回答ともフォーマット(テンプレート)に沿って表示・入力される | `web/src/features/thread/aidlc-answers.ts`(serializeAnswersBlock) + ConversationThread の選択肢・自由入力 UI。scr-02 mock 突合全状態一致 | **貫通** |
| **US-06** | ステップ設定が、個別フォーム欄でなく AI のヒアリングで埋まる | `config-hearing.test.ts` > `"answering both config questions writes contracts to cycle phase snapshot"` → AI が `QuestionRaised{target:{step,field}}` を emit → 人間が回答 → contracts が cycle phase に書き込まれる | **貫通** |
| **US-06** | 設定の単位は「このサイクルの全ステップ」(1 ステップ単位ではない) | `hearing-launch.test.ts` > `"cycle inbox shows 2 config questions with targets after launch"` → targets が複数 field を持つ(config-hearing シナリオが S1 の 2 フィールドを同時 emit) | **貫通** |
| **US-06** | 2 層モデル: ①グローバル既定(pipelineDef) ②サイクル単位(phase snapshot) | `hearing-launch.test.ts` > `"global hearing writes to project.pipelineDef"` / `"cycle-scope write does NOT touch project.pipelineDef"` / `config-hearing.test.ts` > `"cycle-scope write does NOT touch project.pipelineDef"` → 2 層の書き分けを全テスト | **貫通** |
| **US-06** | 埋まった設定は全文(全ステップ)を後から確認できる(品質基準②) | `StepConfigReadback.tsx`(`GlobalStepConfigPage` / `CycleStepConfigPage`)が全ステップの contracts を readback 表示。scr-04 mock 突合 4 状態 26/26 一致 | **貫通** |
| **US-06** | 設定に問題を感じたら会話で手軽に修正できる(品質基準③) | `hearing-launch.test.ts` + `config-hearing.test.ts` — ヒアリングは `/api/hearing/launch` で再起動できる構造。`ConversationThread.tsx` で `?hearing=1` 経路の会話スレッドが開く(scr-02-hearing 一致) | **貫通** |
| **US-06** | 廃止対象の個別設定フォーム欄が UI から消える(品質基準①) | `App.tsx` コメント `"StepConfigPage form retired"` — `settings/steps` ルートは `GlobalStepConfigPage`(StepConfigReadback)へ、`cycles/:id/settings` は `CycleStepConfigPage`(StepConfigReadback)へ。`StepConfigPage.tsx`(旧フォーム)はどのルートにも import されず不到達(dead code)。ユーザーからは旧フォームに到達する経路は存在しない | **貫通** ※1 |
| **US-06** | ヒアリングは US-05 の対話スレッド基盤に乗る(質問と同じ器) | `config-hearing.test.ts` で `question` カード経由で回答(same API `/api/questions/:id/answer`)。`ConversationThread.tsx` が `?hearing=1` で SCR-04 readback ボタンを提示(scr-02-hearing mock 突合一致) | **貫通** |
| **US-07** | ステップ数が可変でも進捗表示が破綻せず、現在地が一目で読める | `PhasePipeline.tsx` > `groupIntoBands(nodes)` — `cycle.phases` 駆動でデータ有ステップのみ帯に収める。`phase-group.ts` > `phaseGroupOf` で各ステップを 5 帯に分類。scr-05-variable mock 突合「設計帯 1 ステップ」一致 | **貫通** |
| **US-07** | ステップは固定番号でなく「名前」で表示する | `PhasePipeline.tsx` 行 252/290: `stepLabel(node.phase.step)` で名前描画。番号(S1 等)は画面に出ない。scr-05 mock 突合全状態一致 | **貫通** |
| **US-07** | 実在するステップだけを描く(`cycle.phases` 駆動) | `PhasePipeline.tsx` > `groupIntoBands` は `phases` を map するのみ。存在しない step への参照なし。scr-05-variable mock 突合(S4 省略サイクル)一致 | **貫通** |
| **US-07** | ステップを工程グループ(5 PhaseGroup)に束ねて表示し、横一列の窮屈を防ぐ | `PhasePipeline.tsx` > `<ol className="pipeline__bands">` — 5 帯の `BandView` ループ。scr-05-default mock 突合「5 PhaseGroup 帯 + 凡例」一致 | **貫通** |
| **US-07** | 各ステップの状態を色 + 記号で二重符号化(完了/進行中/行き詰まり/未着手/手戻り) | `PhasePipeline.tsx` > `NodePill` — ✓/●/!/○/↩ glyph + CSS クラス色。scr-05-stall(! pill)/scr-05-backtrack(↩ glyph)mock 突合一致 | **貫通** |
| **US-07** | 現在の工程グループ・ステップが視覚的に強調される | `PhasePipeline.tsx` > BandView — `active` クラス + band `currentIdx`。scr-05-default mock 突合「現在地強調」一致 | **貫通** |
| **US-07** | 完了済みと未着手の工程グループが一目で区別できる | `PhasePipeline.tsx` > band state(done/partial/pending)+ pipeline__connector 色変化。scr-05-default mock 突合一致 | **貫通** |

※1 `StepConfigPage.tsx` はファイルとしては残存(dead code)だが、どのルートにも到達経路がないため機能的に廃止済み。ファイル削除は次サイクルの housekeeping に持ち越す(S8 確定の blocking 事項ではない)。

---

### S8 確定 判定

**S8 確定: 可**

全 7 US の全 AC (37 行)が **貫通** と判定された。

#### 確定の根拠
- **テスト**: `bun test src tests/integration` = 505 pass / 0 fail。主要証拠テストファイル: `src/app/services/context-resolver.test.ts` / `tests/integration/bu1-structured-context-wiring.test.ts` / `src/infra/orchestrator/live.test.ts` / `src/infra/orchestrator/unit-04.test.ts` / `tests/integration/config-hearing.test.ts` / `tests/integration/hearing-launch.test.ts` / `tests/integration/loop.test.ts` / `tests/integration/api.test.ts`(batch gate)
- **視覚証拠**: `aidlc-docs/v0.0.4/s8/screenshots/*.real.png` — 26/26 mock 突合一致
- **型チェック + ビルド**: `tsc --noEmit` clean / `bun run build` clean

#### blocking gap なし
未貫通・部分貫通の AC はゼロ。

#### follow-up(非 blocking)
1. **実 AI E2E テスト追加(additive)**:  
   US-01 の「実 AI が前段文脈を実際に活用して連鎖した成果物を出す」/ US-03/04 の「実 claude が aidlc-question block を正しく emit し --resume で次 turn を続ける」— 決定論スイートで証明済だが、`tests/e2e-live/` への追加は今後の additive 拡充。S8 確定を blocking しない(real-AI tests additive メモリ規範)。
2. **StepConfigPage.tsx の削除**:  
   `web/src/features/settings/StepConfigPage.tsx` は dead code(どのルートにも到達経路なし)。US-06 ⑤ は機能的に充足済み。ファイル削除は次サイクル housekeeping へ。

#### US-06 ⑤ チェック結果
個別設定フォーム欄は UI から **消えている**。`App.tsx` に `StepConfigPage` の import 行は存在せず、`settings/steps` ルートは `GlobalStepConfigPage`(StepConfigReadback)、`cycles/:id/settings` ルートは `CycleStepConfigPage`(StepConfigReadback)を向く。`StepConfigPage.tsx` ファイル自体は残存しているが、ユーザーがそこへ到達する経路は HTTP ルーティング上ゼロ。AC ⑤「廃止対象の個別設定フォーム欄が UI から消える」は充足。

---

## 次サイクルへの引き継ぎ (PDF P.10 準拠・必須)
- (S8 確定時に埋める)

## 前サイクルからの引き継ぎ (手戻り時のみ追記)

### S9→S8 手戻り(2026-06-14 / O6 / ledger BT-04)
- **何が漏れていたか**: `web/src/features/settings/StepConfigReadback.tsx`(Unit-06 成果物)に Rules of Hooks 違反。`useState(hearingLoading)` / `useState(hearingError)` を `if (isLoading) return` / `if (!hasData) return` の早期 return の **後** に宣言していた。loading→ready の再描画でフック数が 4→6 に変わり React #310 で **設定 readback 画面が真っ白**(US-06 AC-4 確認 / AC-5 会話で直す が通常操作で壊れる)。S8 はこの画面の E2E を持たず unit + 静的 mock 突合だけで確定したため見逃した。
- **暫定の解決方針(実施済)**: 当該 useState 2 本を早期 return の前(`useNavigate` 直後)へ移動。web `tsc --noEmit` green。S9 で scr-04.default/pre-us を再撮影し視覚実証。
- **再発防止**: 画面コンポーネントを追加/改修する Unit は、その画面の loading→ready 遷移を通す E2E(または render テスト)を Unit 完了条件に含める(unit + 静的 mock だけでは hooks 順序バグを検出できない)。→ 次サイクル S8 申し送り。
- **棄却した案**: 「次サイクルへ送る」案 → S9 方針「検証は S9 で全部・S10 はダブルチェック」により本サイクル内 fix を選択。

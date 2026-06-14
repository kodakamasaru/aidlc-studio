# S8 — PJ 統合 進行ログ / v0.0.4

## メタ
- 工程: S8 (Integration)
- PhaseGroup: Build(最終工程)
- 役割: アプリケーションエンジニア(統合)
- ステータス: **手戻りで再オープン(確定でない)** — 2026-06-14 実機レビューで US-01 コンテキスト/IO 設計 + US-06 設定ヒアリングフローの機能ギャップを検出。画面 mock 突合は 26/26 一致だが、US 機能フローが未配線。発生源 = S4 → **S4 へ backtrack**(ledger BT-01/02/03)。S4 をやり直し S5→S8 をカスケード再実装してから S8 を `確定` にする。
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

## 次サイクルへの引き継ぎ (PDF P.10 準拠・必須)
- (S8 確定時に埋める)

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか:
- 暫定の解決方針:
- 棄却した案とその理由:

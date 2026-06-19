# S10 — ヒューマンアクセプタンス 進行ログ / v0.0.4

## メタ
- 工程: S10 (Human Acceptance)
- 役割: プロダクトマネージャー(人間が主役)/ AI = 提示・記録担当
- ステータス: **承認済**(US-01〜08 全件 承認 + AI 判断 D-01/D-02 承認 / 2026-06-20)→ S11 へ
- 入力参照: [s9-validation.md](./s9-validation.md), [s1/](./s1/), [s3/](./s3/), [s9/screenshots/](./s9/screenshots/)
- 作成日: 2026-06-14
- 更新日: 2026-06-20

## サイクル全体の品質サマリ
- 総 US 数: **8**(US-01〜08。US-08 は本サイクル S9→S1 手戻りで追加)
- S9 テスト通過率: 決定論 **580/580** + 実ブラウザ E2E **35/35** + 実 AI live **8/8**(全 green)
- S9 **未解決 CRITICAL バグ: 0** / **未解決 HIGH バグ: 0**(S9 が捕捉した HIGH 2 件 O6・O8 は本サイクル内で修正済)
- 視覚証拠カバー率: **28 状態すべてに実機証拠**。うち実 backend = 24 + scr-05.variable + 再構成2状態。**gallery / enlarged は実 backend 到達・目視確認済(F-23 でも実画像描画を確認)。残るモック注入は `scr-02 completed`(完了バナー)1 状態のみ**(実 cycle done 到達はユーザー判断で次サイクルへ carried = [TEST-ENV-seeded-cycle-states]、今サイクルはモック描画確認で承認 — 正直開示)

## どう判定するか
各 US に「👀 確認の観点」(コードを見ずに、画面のどこを見れば承認していいか)を平易語で書きました。`判定` 行に **承認 / 却下 / 一部承認** を記入してください(会話で言ってもらえれば私が記入します)。却下なら `却下理由` + `ロールバック先 Step`、一部承認なら `承認部分`/`未承認部分` をください。**コードのレビューは求めません**。視覚証拠と動作結果だけで判断できるようにしています。

---

## US 判定シート

### US-01: 前段成果物を live prompt に注入する
- **証拠**: 実 AI(live)テストで、前段 brief の合言葉 `PROJ-XRAY-ZETA-9901` が実 AI の出力に反映 / 前段が無いとき `※ 前段文脈が見つかりません` マーカーがプロンプトに出ることを実機確認。決定論テストも green。
- **👀 確認の観点**: この US は画面を持たない裏側の処理。「AI が前の工程の成果を踏まえて出力する/無い時は黙って落とさず印を付ける」が live で実証されているか(s9 のテスト実行ログ)。
- **未解決バグ**: なし。
- **判定**: **承認**(人間が live 実機で確認 / 2026-06-20)
  - 却下理由 / ロールバック先: —

### US-02: 成果物本文を Markdown 描画する
- **証拠**: レビュー詳細(scr-03.default)で、まとめ本文が見出し・箇条書き等に整形描画。生 HTML 注入は不発火(サニタイズ)。
- **👀 確認の観点**: できあがり確認画面の「まとめ」が、生の記号でなく**読みやすく整形**されているか。S3 mock(`s3/screenshots/scr-03-review-detail.default.png`)と実機(`s9/screenshots/scr-03-review-detail.default.png`)を見比べ。
- **未解決バグ**: なし。
- **判定**: **承認**(人間が live 実機で確認 / 2026-06-20)

### US-03: AI の質問を question カードとして受け取る
- **証拠**: 受信箱(scr-01.default)に AI の質問が「質問」カードで出る。完了出力は「できあがりの確認」カード(誤分類しない)。複数質問も扱える。
- **👀 確認の観点**: AI が人間に聞きたいことが、受信箱に**質問カードとして**現れるか(レビューと混ざらないか)。
- **未解決バグ**: なし。
- **判定**: **承認**(人間が live 実機で確認 / 2026-06-20)

### US-04: 回答で live セッションを継続(resume)する
- **証拠**: 回答送信→次の質問/完了が**スレッド末尾に追記**(scr-02.appended)。失敗時は stall 表示+再試行(scr-02.stall)で**黙って失わない**。決定論で turn 継続を実証。
- **👀 確認の観点**: 回答した後、別画面に飛ばず**その場に続きが出る**か / 失敗時に「回答は保存・再試行」が見えるか。
- **正直開示(更新 2026-06-20)**: 当初は「resume が次 turn を継続」を live 未実証と開示していたが、**本サイクルの S10 実機(S3 ヒアリング)で実証された** — 人間が質問に回答 → 同一セッションが `--resume` で継続し AI が次 turn を実行(F-22 自己修復もこの resume 経路上で動作)。長 session の網羅的 resume 実証は引き続き [O3-live-resume-continuation-unproven] として次サイクルの自走基盤で内包(ledger)。
- **判定**: **承認**(人間が live 実機で確認・resume 実証済 / 2026-06-20)

### US-05: 同一画面の QA スレッドで連続回答する
- **証拠**: 会話スレッド(scr-02.default/running/appended/completed)で、同一画面・時系列・連続回答・全文遡り・Cmd+Enter 送信。
- **👀 確認の観点**: 質問→回答→次の質問が**1 画面に積み上がり**、過去のやり取りを遡れるか。S3 mock と実機(scr-02.*)を見比べ。
- **正直開示**: scr-02.completed(完了バナー)は cycle done 到達が高コストのため API モック注入でフロント描画実証(実 done 到達は未)。**ユーザー判断(2026-06-20)**: 今サイクルは完了バナーをモック描画確認で**承認**し、実 backend 完了到達の検証は次サイクルへ carried。低コスト検証のため「任意のステップ状態に予め置いたサイクルから開始できるテスト環境」を次サイクルで作る([TEST-ENV-seeded-cycle-states] / ledger)。
- **判定**: **承認**(連続回答スレッドの動作を live 実機で確認 / 完了バナーのみモック描画で承認・実 backend 到達は carried / 2026-06-20)

### US-06: ステップ設定を AI 一括ヒアリングで埋める
- **証拠**: 設定が個別フォームでなく会話ヒアリング(scr-02.hearing)で埋まる。設定の全文を後から確認(scr-04.default/global/pre-us)。「会話で直す」導線。2 層(グローバル既定 / サイクル単位)。
- **👀 確認の観点**: 設定が**会話で埋まり**、後から**全ステップの設定を一覧確認**でき、要件前は「会話で直す」がロック(scr-04.pre-us の 🔒)か。S3 mock と実機を見比べ。**O6 で一度この画面が真っ白になるバグを S9 が捕捉・修正済**。
- **未解決バグ**: なし(O6 修正済)。
- **判定**: **承認**(人間が live 実機で確認 / 2026-06-20)

### US-07: 可変ステップ数でもサイクルの進捗が一目で読める
- **証拠**: 進捗(scr-05.default/backtrack/stall)が 5 工程グループ帯で、可変本数を破綻なく吸収・名前表示・色+記号。**scr-05.variable は実 backend で可変サイクル(S4省略+独自工程)を作り実機描画**。
- **👀 確認の観点**: 工程の数が変わっても進捗が**崩れず現在地が一目**で読めるか / 番号でなく**名前**で出るか(scr-05.variable で技術仕様が無く独自QA工程がある可変構成)。
- **未解決バグ**: なし(O5 を US-08 で消し込み・実 backend 実証)。
- **判定**: **承認**(人間が live 実機で確認 / 2026-06-20)

### US-08: 要件確定後にこのサイクルの工程を再構成する
- **証拠**: 要件確定直後に AI が**再構成案を差分提示**(scr-02.reconstruction: ✕技術仕様【削除】+理由 / ＋独自QA工程【新設】/ 他は既定のまま)→会話で修正→まとめて承認→可変サイクルに。グローバル既定は人間起点(scr-02.reconstruction-global: AI が現既定提示→人間が指示)。
- **👀 確認の観点**: 要件を踏まえて AI が「この案件に要る工程」へ**組み直す案を出し**、あなたが会話で承認/修正できるか(scr-02.reconstruction / reconstruction-global の 2 画面)。**承認が効かない O8 バグを S9 が捕捉・修正済**。
- **未解決バグ**: なし(O8 修正済)。
- **判定**: **承認**(人間が live 実機で確認 / 2026-06-20)

---

## AI が独自に決めたこと と 理由

### D-01 — 証拠は US 単位で「👀 確認の観点」+ S3 mock/実機の対で提示し、コードレビューは一切求めない
- **理由**: 品質ハーネス原則 #3(内部コード非前提で承認できる成果物)+ 責務契約①(ソース未読の IT 人材が画面と説明で判断できるか)。テストファイル名の羅列でなく、平易語の確認観点を US ごとに付けた。
- **判断**: **承認**(人間が本サイクル全 US をこの提示方式・画面と説明のみで判定でき、異議なく受領 / 2026-06-20)

### D-02 — モック注入の 3 状態(enlarged/gallery/completed)は「承認可否の判断材料」として正直開示し、隠さない
- **理由**: 責務契約③(mock で実シナリオ代替して通ったとしない)。フロント描画は実証済だが実 backend 到達が未済の 3 状態を honest に開示し、あなたの判断に委ねる(次サイクル carried)。
- **更新(2026-06-17)**: **gallery / enlarged は実 backend で到達・目視確認済み**。live で S1→S2→S3 を回し、S3 が実 AI でデザイン html 3枚(scr-01/scr-02/tokens)を生成 → ハーネスの新規 `captureDesignBlocks` が各 html を Playwright でレンダリング → レビューに **screenshot ブロック3枚(ギャラリー)** として描画されることを実機確認(`verify:shot` + 配信 png 目視)。残るモック注入は `completed`(cycle done バナー)のみ。この配線は本サイクルのコミット de6da30 に含む。
- **更新(2026-06-20)**: 残る `completed`(完了バナー)もユーザー判断でモック描画確認のまま**承認**、実 backend 到達は [TEST-ENV-seeded-cycle-states] として次サイクルへ carried(ledger)。
- **判断**: **承認**(正直開示の方針を是とし、残る完了バナーの扱いも合意 / 2026-06-20)

---

## S10 実機レビューで人間が発見した問題(2026-06-14 / v0.1.11 実機 / 主役=人間)

人間がビルド済み実機を操作して 2 件の実問題を発見。S9 の scripted/E2E が見逃したもの(E2E が受信箱を経ず /reconstruction へ直行・既定空のまま検証)を S10 の実機レビューが捕捉(S10 が機能した)。

### F-1 (HIGH): 要件が終わっても受信箱が空 — Human Inbox 原則違反
- **現象**: 「要件」完了後、受信箱に何も無く人間が次にやることに気づけない(stranded)。
- **根本原因**: `event-applier.ts` は `ReconstructionProposalEmitted` を `reconstruction_proposals` テーブルに保存するだけで**受信箱カード(question/HumanTask)を立てていない**。受信箱は open question しか集めず、再構成提案は `/cycles/:id/reconstruction` に置かれるだけ。CLAUDE.md 核「AI→人間の依頼は全部カード化」に違反。
- **判定**: **却下** / ロールバック先: U08(event-applier + domain question kind + web 受信箱描画)。
- **修正方針**: 再構成提案の生成時に受信箱カードを立て、開くと再構成画面へ遷移。AI→人間の依頼=カード化に戻す。

### F-2 (事業判断→確定): 既定のステップ設定が全部「未設定」
- **現象**: グローバル既定(scr-04 global)が全工程「未設定」。S9 で「O2=設計どおり」とした AI 結論は事業目線で誤り。
- **根本原因**: `DEFAULT_STEP_CONTRACTS = {}`(空)。
- **事業判断(2026-06-14)**: 「**このリポジトリの設定をデフォルトにしたい**」=空でなく、この repo が実際に各工程で使う設定(成果物パス・人の確認・行き詰まり)を出荷既定にする。
- **判定**: **却下** / ロールバック先: S6/S7(`DEFAULT_STEP_CONTRACTS` をこの repo の per-step 設定で投入)+ scr-04/scr-06 再撮影。

### F-1/F-2 修正・検証結果(2026-06-14)
- **F-1 解消**: `ReconstructionProposalEmitted` 適用時に **`kind:"reconstruction"` の受信箱カード**(「工程の再構成提案が届きました — 確認して承認してください」)を立てるよう修正(domain question kind 追加 + applier + 重複ガード)。web `InboxCard` がこのカードを `/cycles/:id/reconstruction` へ遷移。承認/却下でカードを閉じる。integration テスト「ReconstructionProposalEmitted → reconstruction card appears in inbox」で実証。**要件完了後に受信箱で気づける**。
- **F-2 解消**: `DEFAULT_STEP_CONTRACTS` をこの repo の 12 工程設定で投入(成果物パス + 確認[S7=確認なし/S8=実機/S10=実機+すぐ人間へ 等] + 再試行→3回)。`defaultPipeline()` が seed し scr-04 readback が**実値表示**(「未設定」解消)。profileKind は registry 実在キーが "bugfix" のみのため付けず artifactGlob 表示。scr-04(default/global/pre-us)・scr-06 を再撮影。
- **F-2 追補(実機再テストで判明)**: 初版 F-2 は createProject 時 seed のみで、**修正前に作られた既存の永続 project/cycle は空 contracts のまま「未設定」**だった(ユーザー再テスト指摘)。→ `migrations.ts` に PRAGMA user_version=1 の backfill migration を追加し、既存 projects.pipelineDef + cycles の phase スナップショットの空 contracts を既定で埋める(明示 override 不変・冪等)。**app 再起動で既存プロジェクトにも既定が適用**。独立実機検証(空contracts→再起動→既定注入)+ migration テスト 9 件で実証。決定論 593 green。
- **検証**: 決定論 **584** + E2E **35** + web build + tsc clean。scr-04 global の実機 screenshot を AI 再Read 検証(全工程に実値・「未設定」なし)。
- → US 判定を再開可能。

### F-3 (実機 / v0.0.4 US 範囲外 → v0.0.5): legacy プロジェクトデータ + プロジェクト管理 UI 欠如
- **現象**: 実機の既存プロジェクトが「12 工程になっていない」(退役 S2.5 入りの 8 工程)+ 先頭工程が未設定。ローカル dev DB に 2 プロジェクト = legacy(S1,S2,S2.5,S3-S7)と canonical(S1-S12)。web は `projects[0]` 固定で legacy を表示。
- **根本原因**: ① step-model-v2 移行(S2.5 退役)前に作られた legacy プロジェクトデータ(コード・新規プロジェクトは正しく 12)。② web に**プロジェクト作成/リセット/切替 UI が無い**(projects[0] 固定)ため画面から作り直せない。
- **scope 判定**: ②(プロジェクト管理 UI)は **v0.0.4 の US-01〜08 範囲外**(baseline 機能)。ここで新規実装するのは scope creep のため**作らない** → v0.0.5 候補(ledger carried)。① legacy データの自動正規化は非 canonical legacy ID で脆く非推奨。
- **対応(本サイクルの unblock)**: ユーザー承認のもと、ローカル dev DB の legacy プロジェクト(+19 サイクル)を削除(backup 取得済)。canonical 12 工程プロジェクトのみ残し、全工程に既定 contracts 投入済を確認。app 再起動で「12 工程・既定値あり」表示。

### F-4 (実機 / 修正済): 差し戻しをしても始まらない
- **現象**: 視覚レビューを差し戻し(reject + 巻き戻し先)しても AI が再実行を始めない。
- **根本原因**: backtrack は「純ロールバック(orchestrator 副作用なし)」設計で、対象工程を `running`(rewound)にするのみ。実際に動かすには人間が手動「再実行」(relaunch)を押す必要があり、差し戻し直後は AI が起動しない。バックエンドの backtrack→relaunch 機構自体は正常(curl 再現で確認)。
- **事業判断(2026-06-14)**: 「差し戻したら AI が自動で再実行(推奨)」。責務契約②(人間が判断したら以降は AI 自走・無駄に止めない)に整合。
- **修正**: `inbox-service.answerQuestion` の backtrack 経路で、ロールバック commit 後に対象工程を `CycleService.relaunchPhase` で**自動 relaunch**(新 run append + orchestrator.launch / 失敗時は run を failed に補償しループ継続)。手動 relaunch エンドポイントは別経路(stalled 等)用に残す。
- **検証**: integration 4 件(自動 run 付与 / launch 引数 / 失敗補償 / approve は余分起動なし)+ **独立 curl 再現(差し戻し単独→ /relaunch 不要で新 run #2 running + 新 question)**。決定論 597 green。
- **判定**: 修正済。

### F-5 (実機 / 修正済): 差し戻し理由・要件が再実行のコンテキストに届かない
- **現象**: 差し戻し後の自動再実行(F-4)で、AI に**差し戻し理由が渡らず**「なぜ却下されたか」を知らずに作り直す疑い。
- **根本原因**: 再実行 run の構造化コンテキスト(§C7.1)に **差し戻し理由のセクションが無かった**。section 7(対話Q&A)は新 runId 基準で起動時は空。理由は却下 review の Fact(verdict=reject + reason)に保存されるが、コンテキスト合成が参照していなかった。
- **修正**: `context-resolver.composeStructuredContext` に **section 9「【重要】差し戻し理由(前回却下の理由を必ず反映せよ)」を追加**。cycle 単位で最新の「answered + verdict=reject + reason」の Fact を引き、要件(section 4)の直後・前段成果物の前に配置(AI が成果物を見る前に修正方針を立てられる順序)。approve のみで終わったサイクルでは出さない。reason 欠落時は可視マーカー(原則④)。**要件(section 4)は S1 done のため再実行でも present** を確認。
- **検証**: unit 8 件(reject+reason→section present / normal→absent / approve→absent / 最新採用 / 描画順 sec4<sec9<sec5 / 再実行で要件 present 等)。決定論 **605** green。
- **F-4 由来の回帰修正**: 差し戻しが自動再実行になったため、scr-05.backtrack の E2E が「手動 再実行 ボタン」を待って失敗していた → auto-relaunch フローに修正(手動クリック除去)。↩ BacktrackIcon の実機撮影が再び green(35 e2e)。
- **判定**: 修正済。

### F-6 (実機 live / 修正済): AI が英語で答えてくる
- **現象**: live 実行で AI の出力(成果物・質問・説明)が英語。プロダクト・対象ユーザーは日本語。
- **根本原因**: `OUTPUT_CONTRACT_INSTRUCTION`(全 live プロンプト末尾に付与)に**言語指定が無く**、live AI が英語に流れていた。
- **修正**: 出力契約の冒頭に「── 言語(必須) ──」を追加 — 人間が読む文章(成果物・質問・decisions・説明)は**すべて日本語**、コード/識別子/パスは原文可、英語で回答しない。
- **判定**: 修正済(プロンプト指示。live で実機確認要)。

### F-7 (実機 live / 修正済): AI の質問が「回答(question)」でなく「レビュー」になる
- **現象**: AI が人間に質問したいのに、回答カード(question)でなくレビューカード(visual_review)として届く → 人間が回答できない。
- **根本原因**: live は `aidlc-result` の `questions[]` が非空なら質問カード、空+status=needs_human なら visual_review。AI が質問を `questions[]` に入れず本文/status で済ませると review に落ちる。指示が弱かった。
- **修正**: `OUTPUT_CONTRACT_INSTRUCTION` の questions[] 定義を強化 — 「人間に確認・質問・選択・不足情報を求めたいことが少しでもあれば必ず questions[] に入れよ。本文や status で代用するな。空にしてよいのは成果物完成でレビュー/承認だけを求めるときのみ。聞きたいことがあるのにレビューにするな」。
- **判定**: 修正済(プロンプト指示。live で実機確認要)。決定論 605 + tsc clean(プロンプト文変更でロジック不変)。

### F-8 (実機 live / 修正済): live タイムアウト 120s が短すぎて stall しやすい
- **現象**: 実 AI の工程実行(S1 が brief + US 群を生成等)が 2 分を超え、`DEFAULT_TIMEOUT_MS=120_000` の壁時計 backstop に当たって stall に落ちやすい。
- **修正**: `live.ts` の `DEFAULT_TIMEOUT_MS` を **120s → 600s(10分)** に引き上げ(実 AI 工程に headroom)。env `AIDLC_STALL_TIMEOUT_MS` で deploy 毎に上書き可は維持。技術チューニング(責務契約② / D 記録相当)。
- **判定**: 修正済。決定論 605 / tsc clean。

### F-9 (実機 live / 調査中 — 計測投入): live 実行が長時間かかって結局失敗する
- **現象**: live で「めちゃくちゃ時間かかって結局失敗」。ユーザー仮説 = claude が終了/起動失敗を検知できていない or プロンプト未達(まだ英語)。
- **コード確認**: 完了検知は `child.exited` で即解決(タイムアウト待ちではない)。claude 不在は spawn 同期 throw。structuredContext は launch に渡っており構造化経路(F-6/F-7 の日本語・契約込み)を使う。→ **コード上は検知できるはずで、原因は実行時要因**(claude がハング/即死/プロンプト過大 等)。推測の連鎖を断つため**計測を投入**。
- **対応①(計測)**: `live.ts` に診断ログ追加 — launch 時(prompt 文字数 / model / timeoutMs / pid)+ 終了時(exitCode / timedOut / durationMs / stdout・stderr 文字数)。`stdoutChars=0 && timedOut` ⇒ claude がハングして無出力、`exitCode≠0` ⇒ 即エラー、を切り分け可能に。
- **対応②(最有力の即効策)**: **F-6/F-8/本計測はバックエンド(src/)の変更 → `serve` の再起動が必須**。web のみ再ビルドでバックエンド未再起動だと、旧プロンプト(英語/2分タイムアウト)のまま走る。「まだ英語」はこれで説明がつく可能性大。
- **判定**: **解消(2026-06-17 / 再現せず)**。使い捨て sandbox(/tmp/aidlc-sandbox)で最新コードの backend に対し実 S1 live を起動し、診断ログを採取:`exitCode=0 / timedOut=false / durationMs=93,203(~93秒で正常完了)/ stdoutChars=66,080(実出力)/ stderrChars=0`。ハング・timeout・即死いずれも無し。→ 真因は **対応②の仮説どおり旧 backend の 120s timeout**(F-8 緩和前 + 未再起動)。最新コード(timeout 60分 + 再起動)では S1 はクリーン完了。**同時に F-6(出力は全文日本語)/ F-7(質問は question カード化 — 再検証 run で実機確認)も live 実証**。

### F-10 (実機 live / 修正済 + 検証済): レビューカードの見出しが生のファイルパス
- **現象**: F-9 検証 live の visual_review カードで、block の見出しが `aidlc-docs/brief.md`・`aidlc-docs/v0.0.1/s1/us-01-browse-menu.md` … と**ファイルパスそのまま**。人間は web カードしか見ずファイルを開けないのに、サーバ内部のディレクトリ構造を露出 → **責務契約①違反**(人間向け出力にパス/ディレクトリ構造を出すの禁止・事業語で指す)。
- **根本原因**: live ハーネスが成果物 `.md` を review block 化する際、block の `title` に成果物の相対パスをそのまま入れていた(`readArtifactBlocks`)。
- **修正**: パス由来 title を廃止し、**成果物本文の先頭見出し(H1 / 既に日本語の事業語)を title に採用**する純関数 `artifactBlockTitle(body, rel)` を新設(見出しが無ければ脱パス化したファイル名へフォールバック)。唯一の生成サイトに適用。同種サイトを全数棚卸し済(他に該当なし — scripted は固定の事業語 fixture / live の step 表記はパスでない)。
- **検証**: 実入力(`# US-01 メニュー閲覧` / `# Brief — …`)のユニットテスト4件 green(パス・`.md`・`/` を露出しないことを assert)。決定論 634 / src tsc clean。
- **判定**: 修正済(ユニット + 横展開棚卸しで確証。live visual_review での最終目視は次の承認 run で兼ねる)。

### F-11 (実機 live / 修正済 + live 実証済): サイクルの version が live プロンプトに注入されない
- **現象**: cycle=**v0.0.2** なのに AI が全成果物を `aidlc-docs/**v0.0.1**/s1/…` として書く(ディスク着地も v0.0.1)。契約の artifactGlob は `aidlc-docs/{version}/s1/**`(=v0.0.2)を期待 → **着地先がサイクル版数と食い違い、このサイクルの成果物解決が空になる配線欠陥**。前段文脈注入(US-01)も同じ版数前提なので波及しうる。
- **根本原因**: プロンプトのどこにも実版数が解決注入されていなかった。出力契約の例は `aidlc-docs/{version}/sN/…` という**未解決プレースホルダのまま**で、Section 8(StepContracts)の artifactGlob も `{version}` リテラルのまま。AI は実版数を知るすべが無く、自分で v0.0.1 を選んでいた。
- **修正**: structured context に**常時 present の「成果物の書き込み先」節**を追加 — このサイクルの解決済み版数 + この工程の正準ディレクトリ(例 `aidlc-docs/v0.0.3/s1/`)を明示し「別の版数・別ディレクトリに書くな / {version} のまま書くな」と binding 指示。Section 8 の `{version}` も実版数へ解決。出力契約文も補強。
- **検証(live 実証)**: 修正後の backend(`--watch` 自動リロード)で新 cycle(version=**v0.0.3**)の S1 を live 起動 → ① launch プロンプトに「成果物の書き込み先」+ `aidlc-docs/v0.0.3/s1` が含まれることを確認、② 成果物が **`aidlc-docs/v0.0.3/s1/index.md` に正しく着地**(v0.0.1 誤着地は消滅)、③ AI 自身の質問文も「v0.0.3 で…」と正しい版数を参照。決定論 634 + 新規回帰テスト3件(targetArtifact が解決版数を載せる / render に出る / stepArtifactDirRel)green。
- **判定**: 修正済(live 実証済)。

### F-12 (実機 / S10 device_check / 修正済): 回答後 AI がレビューを出しても QA 画面が「考え中」で固まる
- **現象**: 質問に回答 → AI が resume → レビュー依頼(できあがりの確認)を出した後も、質問(会話)画面がずっと「AI が続きを考えています…」のまま固まり、人間がレビューに進めない。人間が S10 で実機操作して発見(自動テストが見逃した live ループの UX 欠陥)。
- **根本原因**: 会話スレッド(`ConversationThread`)が **`kind === "question"` のカードしか見ておらず、emit された `visual_review` を完全に無視**。live は review-gate で run を review 後も `running` のまま保つため、「実行中=考え中」の表示が永久に解けなかった(spinner の停止条件 = 質問が来る or 完了、だけで「レビューが出た」を含んでいなかった)。
- **修正**: スレッドが open な `visual_review` を検知し、出たら **polling を停止 + spinner を消し**、「AI が『できあがりの確認』を出しました → **できあがりを確認する**(レビューへのリンク)」CTA を表示。横展開で `ReconstructionThread` も点検(提案到着で `waitingForReproposal` が解除され固着しない=健全)。
- **検証**: 実機(v0.0.6 thread)で「できあがりを確認する」CTA 表示 / 「考えています」消滅を DOM + screenshot で確認。web tsc clean。
- **判定**: 修正済。**US-05(同一画面 QA スレッド)/ US-04(resume 継続の可視化)に直結する欠陥**だったため、両 US の判定はこの修正を前提に行う。
- **軽微な残り**: ヘッダのステップ状態バッジは run=running のため「起動中/実行中」のまま(レビュー準備完了と不一致)。本文の固着は解消済み。バッジ整合は軽微 follow-up。

### F-13 (実機 live / 修正済): aidlc-result が壊れた JSON のとき生の内部 JSON カードが出る
- **現象**: S10 中にテストで S1 を起動 → できあがり確認カードの末尾に `{"artifacts":["aidlc-docs/brief.md", … ]}` という**生の JSON が code ブロックで露出**。さらに本来 4 件あるはずの質問(Q-01〜04)が**質問カードにならず消えた**。人間が S10 で実機操作して発見。
- **根本原因(再現・確定)**: sandbox DB の当該レビュー本文を実データで解析。AI が出力した ```aidlc-result``` エンベロープが **構造的に不正な JSON**(`status` を `completeness` オブジェクトの中に入れ、ルートオブジェクトの閉じ `}` を欠落)→ `JSON.parse` が `Expected '}'` で失敗。`parseAidlcResultBlock` は fence を見つけたが err を返した。
- **真の欠陥(studio 側)**: live adapter は「fence あり・JSON 不正(err)」を「エンベロープ無し(ok null)」と同列に扱い **legacy フォールバックへ落ちて生テキスト全文を summary に dump** していた。結果① 人間に内部 JSON/パス露出(契約①違反)② エンベロープ内の質問を黙って消失 ③ リトライされず壊れた run がレビューとして提示。ユーザー方針「ちゃんとできてなければ仕組みの中でリトライすべき」に反する。
- **修正**: `awaitAndEmit` で「fence あり・parse err」を **retriable な `stalled`** に変換(`malformedResultEvent` / 人間向け理由は内部 JSON を一切含まない)。生テキスト dump を廃止。fence 無し(ok null)の正当な legacy 経路は不変。
- **検証**: 実 S10 不正ペイロードを fixture 化した回帰テスト(parser が err を返すこと / stall イベント生成 / 理由に `aidlc-docs`・`{`・`"`・`.md` を含まないこと)を追加。`bun test live.test.ts` 25 pass。tsc clean。
- **F-13 再発(S2 = 工程組み直し / 2026-06-19)**: 同じ「生 JSON 露出」が **reconstruction 経路**で再発(`{"scope":"cycle","steps":[…]}` がカードに露出)。実データ解析の結果、今回は JSON 自体は妥当で **schema 違反**(削除工程 S4 に `order:-1` を付与 → validator が「order は非負整数」で全 proposal を reject)。削除工程は apply 前に web が除外し ✕ 表示で order を使わないのに、過度に厳格な schema が壊れていないものを壊れ扱いにしていた。**2層で根治**: ① validator を緩和 — `diff:"delete"` の order は非負を要求しない(残す工程の sort 用 order は ≥0 維持)。② live adapter の reconstruction parse-err も raw dump をやめ retriable `stalled` に(aidlc-result と同じ扱いに一般化)。③ composer の reconstruction プロンプトに「order は残す工程だけ連番・delete は -1 可」を明記。実 S2 ペイロードが parse 成功することを確認 + 回帰テスト追加(削除工程の負 order=ok / 非削除の負 order=err)。決定論 641 pass / e2e-live 8 pass。
- **v0.0.5 連携**: ここでの `stalled→retry` は手動だが、[autonomous-self-healing-orchestration](../v0.0.5/autonomous-self-healing-orchestration.md) でこの retry を自走化する対象(壊れたエンベロープ = 人間介在なしで作り直すべき典型ケース)。

### F-14 (実機 / 修正済): 「ステップ構成」画面の案内が設計と真逆 — 調整時点の矛盾
- **現象**: S1 開始前後に「ステップ構成」画面へ行くと、(1) ヒアリングへの導線が無い、(2) サイクルが始まると *「構成の変更はできません(**始める前のサイクルでのみ調整できます**)」* と出る。だが今サイクルの要望は **要件(S1)→ステップ構成→後続** で、工程調整は **S1 の後**のはず。「S1開始したら構成をいじれない」のは設計と矛盾。人間が S10 実機操作で発見。
- **根本原因(コード確認)**: per-cycle の工程調整は本来 **S1確定直後の「組み直し提案」(US-08)** で行う設計。なのに ① [CycleStepsPage](../../web/src/features/cycle-detail/CycleStepsPage.tsx) の注意文が *「始める前にだけ調整できる」* と**実態と真逆**で、組み直し提案への導線も無し(閲覧専用の行き止まり)。② pre-US ロック(`usDecided`)が**デモ用クエリパラメータで既定 true**([StepConfigReadback](../../web/src/features/settings/StepConfigReadback.tsx))= 実サイクル状態に未配線(「本番で配線」TODO が残存)。
- **修正(今サイクルで根治 / descope せず)**: 純関数 `stepsGuidance(cycle, hasProposal)` を新設し 3 分岐(`pre-requirements`=既定で動く・確定後に提案 / `reconstruction-available`=提案画面へ導線 / `locked-running`=進行中は変更不可・組み直しは確定直後のみ)に整理。CycleStepsPage の矛盾文言を廃し状態別の正しい案内+組み直し提案への導線に。`usDecided` を実状態(S1 が done か)へ配線、クエリパラメータはデモ用オーバーライドに降格。決定論ユニットテスト6件追加・web tsc clean。
- **テスト手法の是正(ユーザー指摘)**: この矛盾を S9 が見逃した真因は **シナリオ/E2E が `page.goto` で画面へ直接遷移し、見出しの存在だけ assert** していたから(loop.spec の旧 /steps 検証がまさにこれ)。→ ① 当該 E2E を**実入口フロー(サイクル詳細の「ステップ構成を見る →」を実クリック)+ 文言の正否・矛盾文言の不在(negative assert)** に強化。② **S9 スキル本文**に「実入口フローで歩く(直接遷移禁止)/ 見出し存在で終わらせない・画面間の文言突合」を焼き込み(全工程 binding)。
- **既知の別件(本件と別 / 要対応)**: `tests/e2e/loop.spec.ts` は **HEAD 時点で既に line 156 で失敗**(`次に「画面」を始められます` 不検出 + backend `advanceRun failed: RunNotFound`)。F-14 変更とは無関係(stash して baseline で再現確認済)。この pre-existing な red のため、強化した E2E assert を green まで実行できていない(回帰担保は決定論ユニットテストで実施)。loop.spec 自体の修復は別件として要追跡。

### F-15 (実機 live / 修正済): AI の status:"done" が人間レビューゲートをスキップしてしまう
- **現象**: S1 を live 実行したら「完了した」と言われたが、**できあがり確認(レビュー)カードが受信箱に来ない**。代わりに「工程の再構成」カードだけが来た。人間が S1 を承認できない。人間が S10 実機で発見。
- **根本原因(コード確認)**: live S1 の AI が `status:"done"` を出力 → `aidlcResultToEvents` が `RunStateChanged{done}` に変換 → applier の RunStateChanged 経路は `advanceRun` で**phase を review に gate するがレビューカードは作らない**(カード生成は ResultEmitted 経路のみ)。さらに engine が RunStateChanged done で reconstruction を前倒し起動。→ phase=review・レビューカード無し・reconstruction 先行、で人間が詰む。**AI が status で自分の人間ゲートをスキップできてしまっていた**。
- **設計判断(ユーザー)**: 「人間がレビューするかは**ステップ設定(humanGate)が決める**ことで、ステップ内 AI が status で決めることではない」。責務契約②(human-gate のみ停止)に合致。
- **修正(今サイクルで根治)**: `aidlcResultToEvents` で **`done` を `needs_human` と同じ扱い**にし、成果(本文/視覚証拠/completeness/artifacts/decisions)を**レビュー可能な ResultEmitted** として出す。ゲートの可否は下流(ステップ設定)に委ねる。`done` への確定・reconstruction は**人間が承認して初めて**起きる(finalizeApprovedReview → RunStateChanged done)→ reconstruction 前倒しも解消。プロンプト契約も「status は自己評価で、人間レビューの要否はステップ設定が決める/done でゲートはスキップできない」と明記。決定論テスト更新(done→ResultEmitted / done と needs_human が同形)。422 pass・tsc clean。
- **要再起動**: バックエンド(src/)修正のため、実機確認には `verify:test` の再起動が必要。

### F-16 (実機 / 修正済): 再構成の「会話で修正(送信して再提案)」が 400 InvalidVerdict
- **現象**: 工程の再構成で「直したい所を会話で」→ フィードバック入力 →「送信して再提案」で **`API 400: InvalidVerdict`**。再提案できない。人間が S10 実機で発見。
- **根本原因(コード確認)**: 再構成カード(kind=reconstruction)の許可 verdict は `approve`/`reject` のみ([question.ts](../../src/domain/question/question.ts) ALLOWED_VERDICTS)。なのに modify 経路は `answerQuestion(verdict:"answer")` を投げていた([ReconstructionThread](../../web/src/features/thread/ReconstructionThread.tsx))→ InvalidVerdict。さらに**「会話で修正→再提案」のバックエンド経路が未実装**(`waitingForReproposal` polling だけ配線され、再提案を起こす API が存在しない)。UI だけ先行して機能が未完だった。US-08 AC「会話で修正」を満たしていなかった。
- **修正(今サイクルで実装)**: 再提案を本実装。① `RunLaunch.reconstructionFeedback` を追加 ② 専用エンドポイント `POST /cycles/:id/reconstruct/repropose {feedback}` + `cycleService.reproposeReconstruction`(idempotency guard を意図的にバイパスして再構成 run を再起動)③ `composeReconstruction(repoPath, feedback)` がフィードバックを最優先セクションで prompt 注入 ④ scripted は feedback ありで REVISED 提案を emit(polling 差分検知 + e2e 検証用)⑤ UI は `answerQuestion` をやめ `reproposeReconstruction` を呼ぶ。決定論 649 pass / e2e 35 pass(modify ブランチ込み)/ tsc clean。
- **要再起動**: バックエンド(src/)+ web 両方の変更。実機確認には `verify:test` 再起動 + ブラウザリロード。

### F-17 (実機 / 修正済): 要件確定後、再構成を挟まず画面へ進む(再構成が gate でなく silent skip しうる)
- **現象**: 新規サイクルで要件(S1)を承認したら「ステップ構成(再構成)」を挟まず、いきなり画面(S2)が起動可能に。実データ確認では再構成 proposal=404・受信箱空で、再構成が現れないまま S2 が次工程になっていた。人間が S10 実機で発見。
- **根本原因(コード確認)**: ① **再構成 run が非追跡の side-run**(`launchReconstructionForS1` が `orchestrator.launch` 直叩き=domain Run を作らない)。なので run が失敗/無提案で終わると `RunStateChanged failed`→`advanceRun`→`RunNotFound` で消え、**カードも proposal もエラーも残らず silent skip**。② **S2 が再構成に gate されていない**(S1 done で即 S2 起動可能)。要件→ステップ構成→後続(US-08)になっていなかった。
- **修正(今サイクルで根治 / gate + 失敗surface 両方)**:
  - ① **再構成カードを launch 時に raise**([reconstruction-launch.ts](../../src/app/services/reconstruction-launch.ts)): 失敗/無提案でも *pending* カードが残る(silent 廃止・原則④)+ gate が即発火。proposal は run が emit した時に埋まる(applier は重複カードを抑止)。
  - ② **startPhase gate**([cycle-service.ts](../../src/app/services/cycle-service.ts)): open な reconstruction カードがある間は次工程開始を 409 `ReconstructionPending` で拒否。
  - ③ **UI gate**([CycleDetailPage.tsx](../../web/src/features/cycle-detail/CycleDetailPage.tsx)): 再構成 pending 時はサイクル詳細・topbar が開始ボタンでなく「工程の再構成を確認 →」を出す。
  - ④ **提案未到達のページ救済**([ReconstructionThread.tsx](../../web/src/features/thread/ReconstructionThread.tsx)): 404 は auto-poll(live で proposal が後から届く)+「もう一度組み直す」(再提案/F-16)escape で詰まない。
- **検証**: integration loop を gate フローに更新(S2 開始が 409 → reject → S2 開始 200)。決定論 649 pass / e2e 35 pass / backend・web tsc clean。
- **要再起動**: backend + web 変更。`bun run clear:test` で壊れた旧サイクルを消し、`verify:test` 再起動 + リロード。

### F-18 (実機 / 修正済): 再構成の先出しゲートカードが「組み直し中」なのに「確認してください」と矛盾表示
- **現象**: 新規 S1 を承認した直後、受信箱の「工程の再構成」カードが**まだ提案が組み上がっていない**のに「— AI が組み直し中です。**確認してください**。」と確認を促す。人間が S10 実機で発見。
- **根本原因**: F-17 でゲートカードを launch 時に先出しするようにしたが、その固定タイトルが完了前提(「確認してください」)だった。かつ `event-applier` が「open な再構成カードが既にあれば早期 return」で、**提案到着時のタイトル更新を握り潰していた**(ずっと矛盾文言のまま)。
- **修正**: タイトルを進捗で2段階に。`RECONSTRUCTION_PENDING_SUMMARY`(「AI が工程を組み直しています…」/ 確認を促さない)で先出し → 提案到着時に applier が**同一カードを `RECONSTRUCTION_READY_SUMMARY`(「提案が届きました — 確認して承認してください」)へ反転**(repo upsert / 重複は増えない)。回帰テスト追加。決定論 650 green。詳細は s11 P30/T30。
- **判定**: 修正済。

### F-19 (実機 live / 修正済 — live 確認要): S3 で「提示中の見た目」と画像前提で質問されるが画像が出ない
- **現象**: S3(UIデザイン)のヒアリングで、AI が「アプリ全体の見た目の方向性を『暖色ミニマル』で確定してよいですか? … 提示中の見た目のまま進めます」と**画像を見せた前提**で確認してくるが、質問カードには**画像が一切表示されない**。人間は見えない見た目を承認できない。人間が S10 実機で発見。
- **根本原因**: ① **質問カードは文字(prompt/options)だけを描画する器**で、画像チャネルが無い(視覚承認は別途 step 6 のレビュー画面ギャラリーで取る設計)。② S3 のヒアリング段階ではまだデザイン html が描画されていないのに、AI が「提示中の見た目」「提示中のまま進める」と**見えない視覚物を前提に質問**していた。対人契約①は「ファイル/パス参照禁止・全文インライン」までは言うが、「**描画されていない画像/見た目を前提に質問するな**」が明文化されていなかった(契約の穴)。
- **修正(道具では直らない層 — 契約/スキル本文に焼き込み)**: ① 正本 `responsibility-contract.md` ①に「**質問カードに描画されていない視覚物(画像/モック/画面)を前提に確認を求めるの禁止**。方向性は各選択肢を言葉で自己完結に説明せよ。視覚承認はテキスト質問でなくプラットフォーム描画のレビュー(ギャラリー)で取る」を追記(全 live プロンプト先頭に注入)。② S3 スキル step1 に同趣旨を補強(ヒアリングは画像なしで自己完結 / 「提示中の見た目」を使うな / 実際の承認は html→step6 ギャラリー)。
- **判定**: 修正済(プロンプト/契約指示。F-6/F-7 同様 **live で実機確認要** — restart 後に S3 を live 実行し、ヒアリング質問が画像前提でなく言葉で自己完結しているか / 視覚承認がレビューのギャラリーで取られるかを確認)。詳細は s11 P31/T31。

### F-20 (実機 live / 修正済 + 実データ実証): S3 で「回答が壊れている」が 3 回リトライしても直らない
- **現象**: S3 の視覚方向ヒアリングに回答後、再開で **3 回リトライしても全て「回答が壊れている(malformed→stall)」**になり進めない。人間が S10 実機で発見。
- **根本原因(実データ確定)**: sandbox の実セッション transcript を解析。AI は ```aidlc-question``` フェンスに **裸の単一質問オブジェクト** `{"id":"Q-01","prompt":…,"options":[…],"answerKind":"single"}` を出していた(契約 §C7.4 の「questions[](aidlc-question schema: id/prompt/…)」記述を、そのまま 1 オブジェクトとして書いた自然な形)。だが `parseQuestionBlock` は **`{questions:[…]}` ラッパー必須**で、それ以外は schema エラー → `malformedResultEvent` → stall。リトライしても AI は同じ自然な形を出すため **3 回とも同じ所で stall**(F-13/T20 と同クラス: over-strict parse が valid-intent を壊す)。実 2 セッションの最終出力を旧パーサに通し schema エラー、修正後パーサで正しく 1 問にパースされることを実証。
- **修正(パーサを robust 化)**: `parseQuestionBlock` が live モデルが自然に出す **3 形すべて**を受理: ① `{questions:[…]}`(従来)② 裸配列 `[{…},{…}]` ③ **裸の単一質問オブジェクト** `{id,prompt,…}`。後方互換(従来形は不変)。決定論 652 pass(回帰テスト2件追加)+ 実データで再パース確認。
- **判定**: 修正済(実データ実証。restart 後の live 再開で stall せず質問カード化されることの最終目視は次の S3 run で兼ねる)。詳細は s11 P32/T33。
- **F-19 との関係**: この stall した質問自体は「提示中の画面ギャラリーを確認?」= F-19 の画像前提質問。F-20(パーサ)で stall は消えるが、その質問が**画像前提**である点は F-19(契約/スキル)で是正済 → restart 後は本来 aidlc-result(needs_human)+ デザインギャラリーで視覚承認を取る挙動に寄る。2 つは独立に両方必要。

### F-21 (実機 / 修正済): 人間が押す「再試行」が試行上限で打ち止めになる
- **現象**: 壊れた出力で stall した run を**人間が「再試行」しても 3 回で打ち止め**(以降できない)。ユーザー指摘:「リトライ**自動**なら上限いるのわかるが、**私からも**リトライできないのは変」。
- **根本原因**: `domainRetryRun` が `nextAttempt > maxAttempt(既定3)` で `MaxAttemptExceeded`。INV-6「自動 retry なし(手動)」のもと **全リトライが手動なのに cap が手動を縛っていた**。本来 cap は AUTO retry の暴走止めであるべきで、人間の明示操作を dead-end させるのは誤り。
- **修正**: `RetryRunCmd` に `manual?: boolean` を追加し、`manual:true` は cap 免除。人間の再試行入口(`POST /runs/:id/retry` → `CycleService.retryRun`)を manual 化。自動の自己修復(F-22)は別の専用上限で縛るので、人間 retry は常に効く(人間が最終 governor)。回帰テスト更新(従来の「上限→409」を「人間 retry は上限を超えても 200」に)。
- **判定**: 修正済。詳細は s11 P33/T35。

### F-22 (実機 / 修正済): 壊れた出力で即 stall + retry が同じ誤りを再生産(自己修復の不在)
- **現象**: F-20 の直接原因でもある「malformed → stall → retry しても同じ malformed」。retry が**同じ prompt をゼロから再実行**するため出力が変わらず、何度やっても同じ所で stall(F-20 の 3 連 stall の構造)。ユーザー方針「ちゃんとできてなければ**仕組みの中でリトライ**すべき」。
- **設計(producer 側検証)**: パーサ(consumer)を robust 化(F-20)するだけでなく、**出す側に検証を効かせる**。studio のスキーマ検証器が正本。malformed を検出したら即 stall せず、**同一セッションへ検証エラーを差し戻して AI に直させる**(in-context 自己修復)。`resume`(`claude --resume <session> <body>`)経路が既存なので最小増分。
- **修正**: live adapter の 3 つの malformed 分岐(aidlc-result / aidlc-question / aidlc-reconstruction)を「即 `malformedResultEvent`」から `repairOrStall(...)` に。① session があり修復予算内 → `buildRepairInstruction`(不正フェンス名 + 検証 detail + 期待スキーマ例)を resume body として同一セッションに注入(AI 向け・人間非表示)② 予算(`MAX_REPAIR_ATTEMPTS=2`)超過 or session 無し → 従来の retriable `stalled`。自己修復は専用カウンタ(`repairCounts`)で hearing turn とは別予算。**自動の打ち切り後も人間 retry は F-21 で常に可能**。
- **検証**: 純関数テスト(`buildRepairInstruction` がフェンス名/detail/期待形/「1つだけ」を含む)+ awaitAndEmit 統合 3 分岐(session無→stall / 予算有→修復試行・stallしない / 予算尽き→stall)。決定論 **658 pass**。**live で実機確認要**(restart 後、壊れた出力が自動修復で質問/レビューに化けるか)。
- **判定**: 修正済(実機 live で最終確認)。詳細は s11 P34/T36。
- **3層の関係**: `robust 受理(F-20) → 自己修復(F-22) → 人間 retry(F-21, 無制限)`。受理寛容化で正規変種を 0 往復処理し、本当に壊れたものだけ自己修復に回し、それでも直らなければ人間が最終 governor。

### F-23 (実機 live / 修正済 + 実データ実証): S3 の画面モック画像がギャラリーに出ず生パスだけ表示
- **現象**: 「相変わらず質問に画像が載っていない / 画面モックの画像がちゃんと表示されない」。S3 レビューに画面ギャラリーが出ず、画像が壊れている。人間が S10 実機で発見。
- **根本原因(実データ確定)**: sandbox DB の実レビュー(S3)を解析。**画像/screenshot ブロックが 0**、ブロックは summary テキスト 1 枚のみ = **legacy fallback 経路**。実本文を見ると、AI は F-19 を受けて「文字質問で視覚承認は誤り」と正しく認識し**画面を見せようとした**が、その方法が**散文に `![説明](/private/tmp/…/scr-01.png)` の Markdown 画像リンク(ファイルパス)を直書き**で、しかも `aidlc-result` エンベロープを出さなかった。→ ① エンベロープ無し→ legacy summary 経路 → `captureDesignBlocks` が走らずギャラリー不在 ② 画像リンクは**ローカルファイルパス**でブラウザが読めない=画像表示されない ③ パス露出は契約①違反。html(8)/png(19) は実在=成果物は正しく作れていた。**提示方法だけが間違い**で、契約が「ギャラリーで承認」と言いつつ**その手段(artifacts[] に画面ファイルを載せる / Markdown 画像リンク禁止)を AI に伝えていなかった**。
- **修正(2段 / durable + robust)**:
  - ① **契約/スキルに手段を明示**(道具では直らない層): `responsibility-contract.md` ①に「人間に画像を見せる唯一の方法は `aidlc-result` の `artifacts[]` に画面ファイルを載せること。**散文に `![](パス)` の Markdown 画像リンク/画像パスを書くな**(読めない・パス露出)。散文だけ・エンベロープ無しで終わらせない」を追記。S3 スキル step6 にも同趣旨を補強(失敗例つき)。
  - ② **studio 側の安全網**(robust 受理 / [[retry-validation-architecture]]): live legacy 経路で、本文中の Markdown 画像リンクのうち**run の repo 配下に実在する画像**を、配信される `screenshot` ブロックに変換(shotsDir へ copy → 配信 URL)+ 本文からパスを除去(契約①)。realpath で `/tmp`→`/private/tmp` symlink も吸収。repo 外の絶対パスは変換しない(security)。
- **検証**: 純関数テスト(`parseMarkdownImageRefs`/`stripImageRefs`: 画像のみ抽出 / 非画像リンク無視 / cleaned にパス・`.png`・`![` を残さない)+ **実 sandbox の壊れたレビュー本文で実証**(7/7 の画像リンクが repo 配下に解決し変換可・cleaned にパス残らず)。決定論 **661 pass**。**live で実機確認要**(restart 後、S3 レビューに画面ギャラリーが描画されるか)。
- **判定**: 修正済(実データ実証。restart 後の live で最終目視)。詳細は s11 P35/T37。

> F-1/F-2/F-4/F-5/F-6/F-7/F-8 修正済 + F-3 unblock(v0.0.5 carried)+ **F-9〜F-16 修正済** + **F-17 修正済(要件→ステップ構成→画面 を必須 gate 化 + 再構成 run の silent 失敗を surface)** + **F-18 修正済(先出しカードの矛盾文言)** + **F-19 修正済/live確認要(描画されていない視覚物を前提に質問するの禁止を契約に明文化)** + **F-20 修正済(aidlc-question パーサを robust 化: 裸オブジェクト/配列も受理し S3 の 3連 stall を解消)** + **F-21 修正済(人間 retry を試行上限から免除)** + **F-22 修正済/live確認要(malformed を即 stall せず同一セッションで自己修復 → 尽きたら人間 retry)** + **F-23 修正済/live確認要(視覚は artifacts[]→ギャラリーで出すと契約明示 + 散文の画像リンクを実ブロックに変換する安全網)**。
> **F-18〜F-23 は restart 後の live 実機で全件 OK をユーザー確認(2026-06-20)**。US-01〜08 全件 承認・D-01/D-02 承認 → S10 受け入れ完了。決定論 661 / e2e 35 green。

## サイクル全体の成果物サマリー (2026-06-20 確定)
- **US-01〜08 全件 承認**(人間が restart 後の live 実機で確認)。AI 判断 **D-01 / D-02 承認**。
- **S10 実機で発見・修正したバグ F-1〜F-23**(F-3 は v0.0.5 carried = baseline 機能)。F-18〜F-23 は本受け入れセッション(2026-06-19〜20)で発見し当サイクル内で修正・live 確認済。
- **未解決 CRITICAL / HIGH バグ: 0**。決定論 **661** + E2E **35** green。
- **残るモック依存は `completed`(完了バナー)1 状態のみ** → ユーザー判断でモック描画確認のまま承認、実 backend 到達は次サイクルへ carried([TEST-ENV-seeded-cycle-states])。
- gallery / enlarged は実 backend 到達・目視確認済。US-04 の resume 継続は本サイクル live で実証済(網羅実証は次サイクル自走基盤に内包)。

## 次工程への引き継ぎ
- **S10 受け入れ完了 → S11(レトロスペクティブ)へ進める**。S11 入力の process-problem メモ(F-18〜F-23 由来の P30〜P35 / T30〜T38 含む)は [s11-retrospective.md](./s11-retrospective.md) に記録済。
- 次サイクル(v0.0.5)へ carried(ledger 正本):
  - [TEST-ENV-seeded-cycle-states] 任意ステップ状態に seed したサイクルから開始するテスト環境 → US-05 完了バナーの実 backend 検証を内包。
  - [O3-live-resume-continuation-unproven] 長 session の網羅的 resume 実証(自走基盤に内包)。
  - [F3-project-management-ui] / [AUTO-ORCH-durable-self-healing] / [F12-thread-badge-consistency] ほか既存 carried。
- 次サイクル S1 は ledger の未 reconcile(into: v0.0.5)をゼロにするまで進めない規約。

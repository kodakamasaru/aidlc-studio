# ROADMAP — プラットフォーム自走(self-host)までのサイクル列

BACKLOG.md が「何を作るか(項目台帳)」なら、本書は「**どの順でどの版に載せるか**(サイクル順序)」。
終点 = **このリポ自身の開発を、実 AI でプラットフォーム上から回せる(人間は IDE を触らず Inbox を捌くだけ)**。

- 出典: 2026-06-11 のロードマップ議論(self-host バー = 「1 マイルストーン実 AI 自走」)。**2026-06-13 更新**: v0.0.3 CLOSED + 実機 dogfood feedback(BACKLOG §I)+ git 自動化の位置づけを反映し、v0.0.4 以降を cut=A で再確定(ユーザー承認 2026-06-13)。
- 関連: [BACKLOG.md](./BACKLOG.md)(項目台帳・§A/§F/§G/§I)/ 各版 `aidlc-docs/{version}/ledger.yml`。
- 注: **v0.0.3 は CLOSED**(S1〜S12 確定 / commit 14ecde9)。carried 4 件(`S10-live-question-as-review` / `S10-review-md-plaintext` / `S10-full-prior-artifact-context` / `S11-P04-evaluator-mechanical-gate`)が v0.0.4 以降の入力。

---

## 終点の定義(self-host バー)

1 マイルストーンの **S1→S12** を、**実 AI**(ローカル `claude` headless)で**プラットフォーム上から end-to-end** に回せる。
- 人間は IDE 不要、**Inbox(Q 回答 / 視覚レビュー / 見送り判断 / retry)を捌くだけ**。
- gen→gate→eval / completeness gate / Q→回答→resume が**実 AI で**動く。
- **含まない**(クリティカルパス外、後述): fan-out 並列 / 並行サイクル(worktree 複数) / Wiki 自動管理 / Dashboard / §F 4層化。

---

## v0.0.3 — ① 正本一元化(前提)+ ② live を“本物”にする 【CLOSED 2026-06-13】

> ✅ 完了(commit 14ecde9)。正本マップ確定 / step 定義一元化 / live evaluator completeness + screenshot を実 AI で実証。S10 受入・S11 振り返り・S12 改善まで確定。**未消化の carried 4 件**は v0.0.4 以降へ(冒頭の注を参照)。以下は記録として温存。

> **① が本サイクルの硬い前提**。設計の正本思想([external-memory.ts](src/domain/external-memory/external-memory.ts):「aidlc-docs を唯一の真実 source / studio は索引・状態のみ・内容を複製しない」)に対し、実装が複数箇所で揺れている。ここを締めないと ② の live prompt 合成が「読むソースと表示ソースのズレ」を生み、**mock 乖離と同種の drift** を再生産する。

### ① 正本一元化(Source-of-Truth 境界の確定)

**①-a 外部記憶の境界是正**(出典: external-memory 設計核 / 本調査 2026-06-11)
- データ種別ごとに `truth = file|DB` と `DB の役割 = index|state|none` を 1 枚に固定(operating-model のルール化)。
- 現状の揺れ:
  - `artifact` = path 索引のみ(**模範。これに揃える**)。
  - `ledger` = `ledger-repo`(DB)が全文 JSON を持つが **app 層参照 0 =死蔵**。真実は `aidlc-docs/{v}/ledger.yml`(ファイル)。→ **索引化 or 削除**。
  - `conversation` = テーブルあり・**参照 0 =死蔵**。→ 索引化 or 削除。
  - `wiki` = `JSON.stringify(doc)` で**内容複製**(原則違反)、file 側未構築。→ Wiki サイクル着手時に index-only へ是正(本サイクルでは方針確定まで)。

**①-b step 定義の一元化**(出典: 本調査 2026-06-11 / BACKLOG §F)
現状、step 定義が **5 箇所で食い違う**:
| 場所 | 中身 | 問題 |
|------|------|------|
| `vocab.ts` DEFAULT_STEPS(コード) | `S1,S2,S2.5,S3..S7`(旧8) | 実行既定が旧メソッド |
| `kit/skills/`(ファイル) | `s1..s12`(v2 12・S2.5 なし) | ①と別集合 |
| `web/src/lib/step-label.ts`(web) | 旧+新 混成 13 | S2.5 と S3 で UI デザイン概念が二重割当 |
| `StepDef.label`(DB) | `= step as string`("S1") | 人間名なし・step-label と二重 |
| `skillRef = aidlc-${step}`(コード) | `aidlc-S1` | 実 dir `aidlc-s1-requirements` に**解決しない=偽リンク** |

是正:
- **step の集合 + 平易ラベル + skillRef の単一正本**を決める(`kit/skills` を正に、コード/web/DB はそこから導出 or 索引)。
- `DEFAULT_STEPS` → v2 12 ステップ、**S2.5 退役**、`S3` の意味を v2(UI デザイン)に統一。
- `skillRef` を実 dir に解決(`aidlc-s1-requirements`)— **②の live prompt 合成の前提**。
- `StepDef.label` の死蔵を解消(step-label 一本化 or DB に正規ラベル)。

**①-c live prompt の source 契約を明文化**
- live 実行プロンプトを **`kit/skills/aidlc-sN`(手順本文)+ `StepDef.contracts`(DB)+ brief/前段成果物(`aidlc-docs`)** から合成する順序・所有を定義(US-04 の2層 prompt を実体化)。

### ② live を“本物”にする(実 AI が本物の成果物を出す)
- **live prompt ← 実スキル接続**(現状 `defaultBuildPrompt` は 1 文スタブ / [live.ts](src/infra/orchestrator/live.ts))。①-c の契約に従い実装。
- **live evaluator completeness emit**(ledger carried `S8-live-completeness`)→ 実 AI で completeness gate が効く。
- **live verify-ui screenshot を review block へ**(S9 観察 O-01 解消 / 実画像の動作証拠)。

### 成功基準(v0.0.3)
- 正本マップが 1 枚で確定し、死蔵テーブルが索引化/削除され、step 定義の食い違いが解消。
- **S1 を実 AI でプラットフォームから1本通し**、completeness gate + リッチ描画 + screenshot 証拠が実 AI で揃う。

---

## v0.0.4 — live 会話ループ(S1 要件ヒアリングが web で成立する)【進行中】

> ゴール = **「S1 を web で」が一サイクルで揃う**。live の成果物が本物(前段文脈つき)で・読めて(md)・会話できる(質問が質問として出て、答えると再開する)。carried #1/#2/#3 を floor に、§I #1/#2 を上載せ。

- **carried #3 / 前段成果物の prompt 注入**: live step の prompt に brief だけでなく前段成果物(S1→S2→…連鎖)を解決して渡す(`PromptComposer.contextPaths` を engine/app 側から配線)。
- **carried #2 / md 描画**: レビューの summary block が実 AI の Markdown 本文を見出し/箇条書き/コードで描画([web/src/features/review/ReviewBlocks.tsx](web/src/features/review/ReviewBlocks.tsx))。
- **carried #1 / 出力質問の経路**: live run の出力に含まれる「人間への質問」を `visual_review` でなく `question` カードとして Inbox に出す。
- **§I #1 / 対話型 resume + QA スレッド**: 質問への回答で live セッションを `claude --resume` で継続(turn ベースの往復)。同一画面に QA が時系列で積み上がり、画面遷移なしで連続回答できる(出典: BACKLOG「実 AI 対話型ループ」§A / §I #1)。
- **§I #2 / AI 一括ヒアリング**: ステップ設定を個別フォームでなく AI のヒアリングでまとめて埋める(個別設定欄は廃止)。重視: 見やすさ / 全文確認可 / 手軽な根治。
- 成功基準: **要件ヒアリング(S1)が web 上の会話で回り**、live が前段文脈を踏まえた md 成果物を出し、それをサイトで読めて承認できる。

> 注: mid-run の中断(`--resume` で実行途中を割って入る本格対話 = 既存 S8-Q02)は別レイヤで後続。v0.0.4 は turn ベース(出力 → 質問カード → 回答 → resume)まで。

---

## v0.0.5 — 受入 + 自走 + 最小 git 自動化

- **§I #5 / S10 受入ガイド**: 「どう起動し / どう操作し / どの動作がこうだから完成」を、実際に動くスクショ等の視覚証拠つきで AI が提示。
- **carried #4 / evaluator 機械ゲート**: 内部ステップの確定前 evaluator 実行を hook/CI で機械強制(doc でなくインフラ)。
- **自動ステップ連結**(human gate 無し step は前 step 承認で自動起動)。**ledger 照合ゲート実運用**(carried 未 reconcile で次 S1 停止 — v0.0.4 で手運用、ここで機械化)。
- **最小 git 自動化**(自走と不可分): サイクル開始=ブランチ / ステップ承認=コミット / クローズ=マージ。人間は git を触らない。
- 成功基準 = **self-host バー達成**: 1 マイルストーンの S1→S12 を実 AI でプラットフォーム上から end-to-end、人間は Inbox と実機確認のみ。

---

## v0.0.6 — US 駆動エントリ(玄関 / = IDE 不要 達成)

- **§I #3 / Task→スコープ**: Task backlog を積み、サイクル開始時に AI がヒアリングして「このサイクルで何をやるか」を選定。
- **§I #4 + §F / Task→US 動的構成**: サイクル基準を US に統一(スプリント=サイクル / タスク=US)。Task を US に分解 → US 構成に応じてステップ構成が決まる → レビュー・受入も US 単位。
- 成功基準: 積む→スコープ→S1→…→受入 の**玄関から出口まで web ネイティブ**。

---

## クリティカルパス外(IDE 不要 達成後 / 並行可能な磨き込み)

- **Dashboard 4 象限 / Wiki 自動管理 / Decision 履歴 / repo-switch**(BACKLOG §A)。
- **§G 本格 git**(version→不変 ID、マージで version 確定、git 運用のプロジェクト別設定)— v0.0.5 の最小 git 自動化の高度化。
- **fan-out 並列 UoW / 並行サイクル(worktree 複数 多重化)**(v1 級)。

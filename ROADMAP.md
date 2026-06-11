# ROADMAP — プラットフォーム自走(self-host)までのサイクル列

BACKLOG.md が「何を作るか(項目台帳)」なら、本書は「**どの順でどの版に載せるか**(サイクル順序)」。
終点 = **このリポ自身の開発を、実 AI でプラットフォーム上から回せる(人間は IDE を触らず Inbox を捌くだけ)**。

- 出典: 2026-06-11 のロードマップ議論(self-host バー = 「1 マイルストーン実 AI 自走」)。
- 関連: [BACKLOG.md](./BACKLOG.md)(項目台帳・§A/§F/§G)/ 各版 `aidlc-docs/{version}/ledger.yml`。
- 注: 現在 **v0.0.2 は S10 却下で `v0.0.2-rework` 進行中**(UI を S3 視覚契約へ是正)。本ロードマップの v0.0.3 以降はその後続。

---

## 終点の定義(self-host バー)

1 マイルストーンの **S1→S12** を、**実 AI**(ローカル `claude` headless)で**プラットフォーム上から end-to-end** に回せる。
- 人間は IDE 不要、**Inbox(Q 回答 / 視覚レビュー / 見送り判断 / retry)を捌くだけ**。
- gen→gate→eval / completeness gate / Q→回答→resume が**実 AI で**動く。
- **含まない**(クリティカルパス外、後述): fan-out 並列 / 並行サイクル(worktree 複数) / Wiki 自動管理 / Dashboard / §F 4層化。

---

## v0.0.3 — ① 正本一元化(前提)+ ② live を“本物”にする

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

## v0.0.4 — Human Inbox の魂を実 AI で(Q→回答→resume の実モデル化)

- **live mid-run Q→answer→resume**(`--resume` / session 注入。出典: BACKLOG「実 AI 対話型ループ」)。
- 1 ステップ複数 Q の逐次処理 / descope 4 択を実 AI 経路で(evaluator が実理由付き descope emit)。
- **stall→retry / maxAttempt escalation を実 AI で実動**。
- 成功基準: 1 フェーズで「実 AI が止まって聞く→Inbox で答える→再開」が回る。

---

## v0.0.5 — S1-S12 通し自走(半自動接続)

- **既定パイプラインを v2 12 ステップで起動**(①-b 済を前提に、各 step へ output/verification/humanGate/escalation 契約を seed)。
- **フェーズ間 半自動接続**(human gate 無し step は前 step 承認で自動起動)。
- **ledger 照合ゲート実運用**(次サイクル S1 が carried 未 reconcile で停止)。
- 成功基準 = **self-host バー達成**: 1 マイルストーンの S1→S12 を実 AI でプラットフォーム上から end-to-end。

---

## クリティカルパス外(self-host 後 / 並行可能な磨き込み)

- **§F 4層化**(PhaseGroup 階層 + Phase→Step rename)— UX/組織化。step 数可変は実装済なので self-host には不要。v0.0.6+。
- **git-id**(BACKLOG §G: version→不変 ID、マージで version 確定)。
- **repo-switch / Backlog-Task UI / Wiki 自動管理 / Dashboard 4 象限**(BACKLOG §A)。
- **fan-out 並列 UoW**(v0.0.3 scope では除外)/ **並行サイクル(worktree 複数)**(v1 級)。

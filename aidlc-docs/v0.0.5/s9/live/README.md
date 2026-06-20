# S9 live operation dossier — v0.0.5(実 claude / 実操作)

> 「どう操作して → こうなったか」を実 claude + 実サイト操作で記録した証拠一式。
> scripts/live-run-s1.ts が同梱 chromium で実サイト(:8787 / `AIDLC_ORCHESTRATOR=live`)を
> 操作し、各操作の screenshot + 動画を残した。コードパス代替ではない(Rule C-2)。

## 実行環境
- backend: `AIDLC_ORCHESTRATOR=live`(実 `claude` CLI / 2.1.168)/ sandbox DB `/tmp/aidlc-sandbox-live.db` / 使い捨てリポ `/tmp/aidlc-sandbox`([[test-projects-use-throwaway-repo]])。
- 実 run runId(live backend ログ): **S1 = `fa85f89b-169b-4779-b610-5f48b346e13e`**(promptChars=33421 = 契約+運用モデル+§6 ルート台帳を本文注入した実プロンプト)/ 承認後 S2 自動起動 = `8316c8c1-56ea-468d-bb1b-919a7893c984`。

## 操作 → 結果(連番 screenshot)
| # | 操作 | 結果(screenshot)|
|---|------|------|
| 01 | アプリを開く | `01-open-app.png` — サイクル一覧 |
| 02 | サイクル作成ダイアログにゴール入力 | `02-create-cycle-dialog.png` |
| 03 | 「作成して開く」 | `03-cycle-created.png` — Phase パイプライン表示 |
| 04 | 「要件」を始める(実 claude 起動)| `04-s1-started-running.png` — 要件=進行中 |
| 05 | 受信箱で AI 出力を待つ → **実 claude が S1 要件を生成** | `05-turn1-review-card.png` — 「できあがりの確認」レビューカード |
| 06 | レビューを開く | `06-review-detail.png` — **実 claude 出力**(US-01〜05 ランチ予約アプリの実ユーザーストーリー / グルーピング方針 / 質疑応答ログ)+「承認して次 Phase へ」|
| 07 | 承認する | `07-approved.png` — **S1=完了(緑)→ S2「画面」自動起動(青)+ 工程再構成提案(US-08)発火** |

## 動画
- `page@*.webm` — 上記操作の連続録画(open→create→start→review→approve)。

## 到達範囲(正直な記録)
- **到達**: launch(実 claude)→ 成果物生成 → 人間レビュー(visual_review)→ **承認**(human-gate を実際に通過)→ 次 Phase 自動起動。
- 本 run では claude が brief から要件を直接生成し、質問(aidlc-question)を出さず review に到達した(= S1 hearing の Q&A サブループは本 run では発生せず)。これは実 AI の実挙動。質問→回答→resume サブループ自体は決定論 + 既存 live テストでカバー済。
- 本 dossier の存在は `bun run live:check v0.0.5`(`scripts/check-live-dossier.ts`)が機械検査する(Rule C-2)。

# aidlc-studio

AI-DLC(AI と人間が協調する開発プロセス)を **web 主導の自走開発スタジオ**に昇格させるプロダクト。

サイト操作が Claude Agent SDK で headless にAIを起動し、人間は IDE を触らず **Human Inbox**(AI→人間の依頼カード)を捌くだけで開発が進む。

## なぜ作るか(解く問題)

個別アプリで AI-DLC を回す中で出た土台の歪み:

1. AI にセッションを跨いで自走してほしい所で人間が手動でセッションを立て直している
2. AI が人間にコードレビューを求めてくる(人間がやるべきは実機+視覚レビューのみ)
3. 1サイクルが長い(「US 15前後」を AI が目標化し、機能でなく粒度を歪める)
4. md が見づらい(成果物の可視化が無い)
5. 前サイクルで固めた内容が次サイクルに漏れなく行かず勝手に格下げされる
6. 複数サイクルを同時に回せない

→ ①⑥はオーケストレーション、④は可視化、②③⑤は**スキル本文の修正**で根治する(道具では直らない層)。

## 構成

| dir | 役割 |
|---|---|
| `kit/skills/` | AI-DLC 9スキル(brief + S1〜S7 + S2.5)= 可搬な方法論本体 |
| `kit/rules/`  | Construction テスト方針 / 自動レビュー pipeline / md運用ルール |
| `web/`        | ビューア & 操作盤(ボード / Inbox / Wiki) |
| `orchestrator/` | Agent SDK runner / Phase 自走 / stall検知 / retry / worktree |
| `aidlc-docs/` | studio 自身の AI-DLC 成果物(dogfooding) |

詳細は [CLAUDE.md](./CLAUDE.md)。

## サンプルデータで試す(seed)

実 AI(claude)を起動せずに、各工程の見た目・証拠ゲート・レビューを**即確認**できるサンプルサイクル群を用意している(`fixtures/seed-cycles/`)。別アプリ・別停止工程の 5 サイクル(ToDo@S2 / 在庫@S4 / 予約@S6 / 経費@S8 / チャット@S9)。

```bash
# 1) サンプルを seed(毎回まっさらな初期データに戻る / throwaway DB + sandbox)
AIDLC_DB=/tmp/aidlc-suite.db AIDLC_SANDBOX=/tmp/aidlc-suite bun run seed:suite
#   → 1 つだけ見たいときは slug 指定: bun run seed:suite chat
#      (slug: todo-app | inventory | booking | expense | chat)

# 2) その DB でサーバ起動(閲覧は scripted でOK / :8787)
AIDLC_DB=/tmp/aidlc-suite.db bun run serve
#   → http://127.0.0.1:8787 を開く

# (証拠 screenshot を撮り直す: bun run seed:capture)
```

注意:
- ホームのサイクル一覧は **projects[0] の 1 プロジェクトしか出ない**(プロジェクト切替 UI = F-3 未実装)。他サイクルは `seed:suite` 出力の `cycle=<id>` を使い `http://127.0.0.1:8787/cycles/<id>` で直接開く。
- seed の即確認スコープは **工程(step)単位**(証拠ゲート等)。**跨サイクル機能(台帳横断注入 / reconcile)は現状の seed では再現しない**(`ledger.yml` 無し・1 project=1 cycle・reconcile/ledger CLI が studio リポ固定)。→ [BACKLOG.md](./BACKLOG.md) の P-ARCH-02。

## ステータス

P0(ブートストラップ)完了。次は P1 = `aidlc-brief` を studio 自身にかける(dogfooding 開始)。

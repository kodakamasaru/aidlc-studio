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

## ステータス

P0(ブートストラップ)完了。次は P1 = `aidlc-brief` を studio 自身にかける(dogfooding 開始)。

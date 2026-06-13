# v0.0.4 スコープ — live 会話ループ(S1 要件ヒアリングが web で成立する)

作成日: 2026-06-13 / 更新日: 2026-06-13 / ステータス: **進行中(S1)**

## 主軸

**live(実 AI)サイクルを「本物で・読めて・会話できる」状態にし、要件ヒアリング(S1)を web 上の会話だけで回せるようにする。**

v0.0.3 が live を「動く」状態にした(completeness gate / screenshot / 単一正本)のに対し、v0.0.4 は live を「人間が IDE を開かず使える」状態にする。carried 3 件(前段文脈・md 描画・出力質問の経路)を floor に、実機 dogfood feedback(§I #1 対話 UX / §I #2 一括ヒアリング)を上載せする。

出典 = [ROADMAP.md](../../ROADMAP.md) v0.0.4 節(cut=A)/ [v0.0.3/ledger.yml](../v0.0.3/ledger.yml) carried / BACKLOG §I(2026-06-13 実機 feedback)。

> 終点(全体)= IDE 不要で本リポ自身を回せる。v0.0.4 はその玄関手前 =「**S1 を web で**」。

---

## ユーザー明示制約(scope.md 記録義務 / operating-model S12-D01)

- **cut = A**(2026-06-13 承認): v0.0.4 は live 会話ループ。carried #4(evaluator 機械ゲート)は **v0.0.5 へ送る**(自走バンドルと同梱が自然)。
- **§I #2 一括ヒアリングの品質基準**: ① 見やすさ ② 見ようと思えば全文確認できる ③ 問題を感じたら手軽に根治できる。ステップ設定の個別フォーム欄は廃止方針。
- **QA 往復(§I #1)**: 同一画面に QA スレッドが時系列で積み上がり、画面遷移なしで連続回答できること。IDE の対話より「サクサク」であることが基準。
- **git 自動化は v0.0.4 では対象外**(v0.0.5)。本サイクル中の git は従来どおり手運用でよい。

---

## スコープ項目

| ID | 項目 | 出典 | US(予定) | 概要 |
|---|---|---|---|---|
| a | 前段成果物の prompt 注入 | carried #3 `S10-full-prior-artifact-context` | US-01 | live step の prompt に brief だけでなく前段成果物(S1→S2→…連鎖)を解決して渡す。`PromptComposer.contextPaths` を engine/app 側から配線 |
| b | レビューの md 描画 | carried #2 `S10-review-md-plaintext` | US-02 | summary block が実 AI の Markdown 本文を見出し/箇条書き/コードで描画([ReviewBlocks.tsx](../../web/src/features/review/ReviewBlocks.tsx)) |
| c | 出力質問の経路 | carried #1 `S10-live-question-as-review` | US-03 | live run の出力に含まれる「人間への質問」を `visual_review` でなく `question` カードとして Inbox に出す |
| d | 対話型 resume | §I #1 / BACKLOG §A「実 AI 対話型ループ」 | US-04 | 質問への回答で live セッションを `claude --resume` で継続(turn ベースの往復)。回答 → 再開が実 AI で回る |
| e | QA スレッド UI | §I #1 | US-05 | 同一画面に QA が時系列で積み上がり、画面遷移なしで連続回答できる対話型ビュー |
| f | AI 一括ヒアリング | §I #2 | US-06 | ステップ設定を個別フォームでなく AI のヒアリングでまとめて埋める(個別設定欄は廃止) |

> US の最終確定(本数・粒度・分割)は S1 Phase B で行う。上表は scope の起点であり目標本数ではない(US 数は出力であって目標ではない)。

---

## 前サイクル(v0.0.3) ledger reconcile

[v0.0.3/ledger.yml](../v0.0.3/ledger.yml) の `into: v0.0.4` を指す carried を全件突き合わせ(reconcile ゲート):

| carried ID | 内容 | v0.0.4 判定 | 行き先 |
|---|---|---|---|
| `S10-full-prior-artifact-context` | 前段成果物のフル文脈注入 | **IN** | US-01 |
| `S10-review-md-plaintext` | レビューの md 描画 | **IN** | US-02 |
| `S10-live-question-as-review` | 出力質問を question カードに | **IN** | US-03(+ US-04 対話) |
| `S11-P04-evaluator-mechanical-gate` | evaluator 確定前実行を hook/CI 強制 | **DEFER** | v0.0.5(roadmap 再 cut / D 記録 + 前 ledger を `into: v0.0.5` へ更新) |

→ 3 件を US で消化、1 件は理由つきで v0.0.5 へ再 point(黙って消さない)。これで reconcile ゲートを充足する。

---

## 成功基準(v0.0.4)

1. **要件ヒアリング(S1)が web 上の会話で回る**: 質問が `question` カードで出て、同一画面で連続回答でき、回答で live が resume する。
2. **live が前段文脈を踏まえた成果物を出す**(brief だけでなく前段 step の成果物が prompt に入る)。
3. **成果物がサイトで読める**: 実 AI の md 本文がレビュー画面で描画される。
4. **ステップ設定が AI 一括ヒアリングで埋まる**(個別フォーム不要)。
5. **既存テストが全て pass**(後方互換を割らない)。

---

## v0.0.4 でやらないこと(明示的な除外)

| 除外項目 | 理由 | 予定 |
|---|---|---|
| evaluator 機械ゲート(hook/CI) | doc でなくインフラ。自走バンドルと同梱が自然 | v0.0.5 |
| S10 受入ガイド / 自動ステップ連結 / git 自動化 | 受入+自走サイクル | v0.0.5 |
| Task→スコープ / Task→US 動的構成 | 玄関(エントリ)サイクル | v0.0.6 |
| mid-run の割り込み中断(実行途中を割る本格対話) | turn ベースで足りる。本格中断は別レイヤ | 後続(既存 S8-Q02) |

---

## 関連ドキュメント

- [ROADMAP.md](../../ROADMAP.md) — v0.0.4 節(出典)
- [v0.0.3/ledger.yml](../v0.0.3/ledger.yml) — carried(reconcile 対象)
- [BACKLOG.md](../../BACKLOG.md) — §I 実機 feedback / §A 実 AI 対話型ループ
- [brief.md](../brief.md) — プロダクト brief(全版共通)

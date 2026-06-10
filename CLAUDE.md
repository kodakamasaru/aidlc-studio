# aidlc-studio — リポジトリ運用

**AI-DLC を web 主導の自走開発スタジオに昇格させるプロダクト。** 現状 AI-DLC スキルは個別アプリの `.claude/skills/` に閉じ込められている。それを救出・可搬化し、サイト操作が Claude Agent SDK で headless にAIを起動する「ボード型 AI-DLC プラットフォーム」を作る。

このリポ自身も **AI-DLC で開発する(dogfooding)**。`kit/` が方法論本体、`aidlc-docs/` がこのプロダクト自身の AI-DLC 成果物。

## このプロダクトが何者か

| | 旧(IDE-skill モデル) | aidlc-studio(web-event モデル) |
|---|---|---|
| 起点 | 人間が IDE で `/aidlc-s1` | サイト操作 → backend が Agent SDK で headless 起動 |
| 単位 | スキル呼び出し | ボードのカード |
| AIの居場所 | 人間のセッション内 | バックグラウンドのワーカー(worktree) |
| 人間の役割 | ドライバー(IDE常駐) | 意思決定者(ボードだけ見る) |
| S1〜S12 | スキルの起動順 | マイルストーン内部のパイプライン(不変) |

**製品の魂 = Human Inbox**: AI→人間の依頼(Q回答 / 視覚レビュー+screenshot / 実機確認 / stall時の retry)を全部カード化。人間は IDE を触らず Inbox を捌くだけ。

## データモデル(ボードの背骨)

```
Milestone(= サイクル / vX.Y.Z)
  └ PhaseGroup(Discovery / Design / Build / Validation / Improvement)
      └ Step(S1〜S12)      ← AI実行の単位
          └ Run            ← 1回の Agent 起動。state: running|stalled|done|failed + retry
Artifact                 ← aidlc-docs の出力(US/画面/集約/コード/screenshot)を描画
Wiki                     ← ユビキタス言語 / D決定 / 引き継ぎ台帳 / brief。AI が常時更新、人間は読む
HumanTask ★              ← AI→人間の依頼が全部カードになる
```

- 真実の source = `aidlc-docs/`(各ターゲットPJ側)。studio の run/HumanTask 状態は別 store。
- 実行基盤 = ローカル常駐サーバ + Agent SDK + git worktree(並行サイクル対応)。

## ファイル配置

```
aidlc-studio/
├── CLAUDE.md            # これ
├── kit/
│   ├── skills/          # AI-DLC 12スキル(S1〜S12)= 可搬な方法論本体
│   └── rules/
│       └── aidlc-operating-model.md   # 4層構造 / PhaseGroup / Construction テスト方針 / md運用ルール
├── web/                 # ビューア & 操作盤(Vite + React)
├── orchestrator/        # Agent SDK runner / PhaseGroup 自走 / stall検知 / retry / worktree
└── aidlc-docs/          # studio 自身の AI-DLC 成果物(S1 で生成)
```

## AI-DLC v2 — 4層 + 5 PhaseGroup × S1-S12

| PhaseGroup | Step | 内容 |
|---|---|---|
| Discovery | S1 | 要件ヒアリング(brief + US 展開) |
| Discovery | S2 | 画面要素(ワイヤーフレーム) |
| Design | S3 | 本格 UI デザイン(旧 S2.5 昇格) |
| Design | S4 | 技術仕様(任意) |
| Build | S5 | 並行作業単位 + 依存 DAG(旧 S3+S4 統合) |
| Build | S6 | ドメインモデル |
| Build | S7 | ドメインコード(純粋・技術非依存) |
| Build | S8 | 実 PJ 統合 |
| Validation | S9 | シナリオテスト + 視覚証拠 |
| Validation | S10 | 人間による最終受け入れ |
| Improvement | S11 | サイクル振り返り |
| Improvement | S12 | プロセス改善提案 |

## スキルの去就 = web/IDE 両刀

`kit/skills/` は残す。orchestrator が backend から同じスキルを load し、IDE からも `/aidlc-sN` で叩ける。

- **理由**: ① porting コスト最小 ② プラットフォーム未完の間、studio 自身を AI-DLC で設計する(dogfooding)には IDE 起動が生命線 ③ stall 時の手動介入の逃げ道。
- web-only への純化は **後の収束**であって v0 の選択ではない。day0 で IDE surface を殺さない。

## 道具では直らない層 — kit/skills のテキストに焼き込む

サイトを作っても直らない3つは、スキル本文を直接修正して根治する。

- **#3 粒度ゲーミング**: S1 から「US 15前後」の目標値を削除。`1US = 1つの独立してテスト可能な縦スライス。US数は出力であって目標ではない。粒度を US数 に合わせて調整することは禁止`。
- **#2 レビュー要求**: S8 Phase完了ゲートに `verify-ui screenshot 自動生成を成果物として出す / 人間に求めるのは実機+視覚レビューのみ / コードレビューを人間に求めることは禁止`。S9 でシナリオテスト + 視覚証拠を義務化。
- **#5 引き継ぎ漏れ**: 散文の「次サイクルへの引き継ぎ」を **ledger**(D/確定項目に `state: carried|done|dropped` + carried なら `into:` / dropped なら `reason:` 必須)に置換。次サイクル S1 は未 reconcile 項目をゼロにするまで進めない。

## v0 スコープ — Human Inbox 縦ループを端まで閉じる

1マイルストーン手動作成 → サイトで Phase 起動 → AI が headless 実行・判断時に HumanTask カード生成 → サイトで回答 → AI 再開 → stall なら retry。**「人間が IDE を触らず1フェーズ回る」を最短で証明する**。

v0 の外(= v0+ に送る): Wiki 自動管理 / 台帳照合ビュー / 並行サイクル(worktree複数) / S1〜S12 全自動接続 / リッチ可視化。

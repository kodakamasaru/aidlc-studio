# S1 — ユーザーストーリー(一覧) — v0.0.3

## メタ
- 工程: S1 Discovery (Phase B)
- 役割: プロダクトディスカバリーリード
- ステータス: **確定**
- 入力参照: [brief.md](../../brief.md) / [v0.0.3 scope.md](../scope.md) / [ROADMAP.md](../../../ROADMAP.md) / [v0.0.2 ledger.yml](../../v0.0.2/ledger.yml)
- 作成日: 2026-06-12
- 更新日: 2026-06-12

## US 一覧

| # | US | scope ID | 概要 |
|---|---|---|---|
| 01 | [外部記憶の正本境界是正](./us-01-source-of-truth-boundary.md) | ①-a | 正本マップを operating-model にルール化 / 死蔵テーブル(ledger・conversation)削除 / wiki 方針確定 |
| 02 | [step 定義の単一正本化](./us-02-step-definition-canonical.md) | ①-b | file 単一 constant に導出(v2 12・S2.5 退役・実 dir skillRef)。DB は per-cycle 上書きのみ |
| 03 | [live prompt を実スキルから合成](./us-03-live-prompt-from-skill.md) | ①-c + ② | source 合成契約の明文化 + `defaultBuildPrompt` スタブを実合成へ |
| 04 | [live evaluator completeness emit](./us-04-live-completeness-emit.md) | ②(carry) | live が stream-json から completeness を emit → 実 AI で gate が効く |
| 05 | [live verify-ui screenshot を review block へ](./us-05-live-verify-screenshot.md) | ② | live run の実 screenshot を証拠として描画(S9 O-01 解消) |

## 全体方針(グルーピング・優先度)

### グルーピングの方針

ROADMAP v0.0.3 の作業項目を「独立してテスト可能な縦スライス」に整理:

- **①-a → US-01 / ①-b → US-02**: 外部記憶と step 定義は別テーブル・別コードだが、**同一の境界ルール(file=truth / DB=index|state)の 2 適用面**。検証が別(死蔵削除 vs 5 箇所食い違い解消)なので 2 US に分離。
- **①-c + ②-d → US-03 に統合**: source 合成「契約」(doc)とその「実装」(`defaultBuildPrompt` 実合成)は 1 つの縦スライス。契約だけ / 実装だけでは「live prompt が本物になる」価値が完結しないため統合。
- **②-e → US-04 / ②-f → US-05 を独立**: completeness emit(stream-json パース)と verify-ui screenshot(実画像描画)は機能面で独立。
- **carry `S8-live-completeness` は US-04 に吸収**(reconcile ゲート充足)。

### 実装順序(依存)

```
US-01(境界ルール確定)→ US-02(step 正本 = ①-c の前提)→ US-03(live prompt 実合成)
                                                           ├→ US-04(completeness emit)
                                                           └→ US-05(verify-ui screenshot)
```

- US-01 が境界ルールを 1 枚に確定 → US-02 がその step 適用面を実装(skillRef 実 dir 解決が US-03 の前提)。
- US-03 で live prompt が本物になって初めて、US-04/05 の「実 AI 成果物の品質証拠」が意味を持つ。
- US-04 と US-05 は US-03 完了後に並行可。

### 前サイクル(v0.0.2) ledger reconcile

| carried ID | 内容 | into | v0.0.3 判定 | 行き先 |
|---|---|---|---|---|
| `S8-live-completeness` | live evaluator が completeness を emit | **v0.0.3** | **IN** | US-04 |
| `S9-US08-liveE2E` | 実 AI E2E(Q→回答→resume)の常時実行化 | v0.0.4 | 据え置き(本サイクル対象外) | — |
| `S8-Q02` | auto-rework 完全 silent 化 | v0.0.6 | 据え置き(磨き込み) | — |

→ v0.0.3 を指す carried は 1 件(`S8-live-completeness`)。US-04 で消化。**reconcile ゲート充足**。

## 全体 質疑応答ログ (複数 US 横断の議論)

### Q-01 — 死蔵テーブル(ledger / conversation)の是正方針
- **回答**(ユーザー記入):
  > (2026-06-12 セッションで確定)**削除する**。app 参照 0・真実はファイル/規約。将来 listing の実需が出たら artifact と同じ path 索引で再導入。
- **確定**(AI 記入):
  > US-01 に反映。DB テーブルごと削除(YAGNI)。正本は `aidlc-docs/{v}/ledger.yml`(規約 path)。

### Q-02 — step 定義の正本(file / DB の役割分担)
- **回答**(ユーザー記入):
  > (2026-06-12 セッションで確定)サイクルごとに変えられる想定だから、**デフォルトはファイル管理、サイクル向けにカスタムしたものは DB 管理**。全部 DB ではない。
  > 補足(2026-06-12): カスタムしなくても、**サイクル作成時にその時点の default を DB へ snapshot コピー**する認識。
- **確定**(AI 記入):
  > US-02 に反映。default テンプレート = file 単一 constant(`kit/skills` 由来)/ per-cycle = DB(**作成時に file default を snapshot コピー** → 以後そのサイクルの正、カスタムは DB 編集、file の後変更は波及しない)。snapshot は不変 truth の複製でなく分岐状態の実体化 = ①-a 境界ルールと整合。

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — ①-a と ①-b を「同一境界ルールの 2 適用面」として 1 枚に統合
- **理由**: 両者とも「file=truth / DB=index|state、DB は内容を複製しない」の適用。別ルールで扱うと再び揺れる。1 枚に固定すれば wiki/将来データ種別もこの規則で判定できる。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — step 定義は file=default テンプレート / DB=作成時 snapshot に分離(全部 DB の正本化はしない)
- **理由**: 全部 DB だと方法論 default の正本が DB に移り、kit/skills を正本とする ①-b の目的(版管理・単一正本)を自壊させる。file を default テンプレート(truth)、DB をサイクル作成時の snapshot(以後分岐しうる状態)とする。ユーザー回答+補足(Q-02)と一致。snapshot は不変 truth の複製ではない。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-03 — ①-c(契約 doc)と ②-d(実合成)を US-03 に統合
- **理由**: 契約だけでは live prompt は 1 文スタブのまま、実装だけでは所有/順序が曖昧。「live prompt が本物になる」は両方揃って初めて 1 スライスとして完結する。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-04 — 成功基準の live 実証ターゲットを「S1」に固定
- **理由**: ROADMAP 成功基準が「S1 を実 AI で 1 本通し」。ドメイン発見系の S1 は成果物が md で screenshot / completeness が観測しやすく、live 貫通の最小実証に向く。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## 棄却した US 案

### R-01 — 「S1-S12 全 step を live で通す」US
- **棄却理由**: ROADMAP では v0.0.5(self-host バー)の仕事。v0.0.3 は live 経路を S1 1 本で実証するのが scope。前倒しは粒度ゲーミング(数合わせ)になる。

### R-02 — 「wiki を index-only に実装し直す」US
- **棄却理由**: scope.md 除外項目。本サイクルは wiki の正本方針を 1 枚に確定するまで(US-01 内の決定として記録)。実装は Wiki サイクル。

## 次工程 (S2) への引き継ぎ
- 画面化が必須な US: US-05(verify-ui screenshot を review block へ = 既存 review 画面の拡張)。
- 画面追加が薄い US: US-01〜04 は主にバックエンド/契約/正本整理。S2 は既存画面の差分確認が中心。
- Biz 論点: なし(内部基盤サイクル。ユーザー=開発者本人の意思決定は S1 で消化済)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (なし)

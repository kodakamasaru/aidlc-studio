# S3 — UI 設計確定(視覚意図のイメージ作り / 全体)

## メタ
- 工程: S3 (UI Design / Image)
- PhaseGroup: Design
- 役割: プロダクトデザイナー(視覚意図担当)
- バージョン: v0.0.4
- ステータス: 確定(2026-06-13)
- 入力参照: [s2/index.md](../s2/index.md)
- 作成日: 2026-06-13
- 更新日: 2026-06-13

## 全体方針

### スタイル方向
- **minimal / Linear・Vercel 系の dark-first**。装飾でなく階層と状態色で語る。
- v0.0.4 の 4 画面はいずれも **既存プロダクト UI の置換・拡張**(SCR-02 は `AnswerView`、SCR-04 は `StepConfigPage` の作り直し、SCR-01/03 は既存の延長)。ゆえに視覚言語は **新規創出せず、確定済みの [web/src/styles/tokens.css](../../../web/src/styles/tokens.css) を正本として継承**する(→ D-01)。
- これは S6/S7 の独断質素化を防ぐ S3 の役目に沿う:視覚契約は「既に承認された design system に一致していること」を撮って固める。

### カラー方針
- ベース: 4 段サーフェス `bg #09090b → surface #131316 → surface-2 #1a1a20 → surface-3 #212129`、境界は `line / line-strong`。**border-led 階層**(影は従)。
- アクセント: indigo `#6366f1`(primary)+ violet `#a78bfa`。
- 状態色(意味で割当): running `#2dd4bf` / stalled `#f59e0b` / done `#22c55e` / failed `#ef4444`。
- Inbox 種別の二重符号化(色 + 記号): 質問 `q #818cf8`(?)/ できあがりの確認 `review #c084fc`(◎)。

### タイポグラフィ
- ファミリ: 本文 Inter / コード・テンプレ記号 JetBrains Mono(2 ファミリまで)。
- スケール: display 28/700 / h1 20/600 / h2 16/600 / body 14 / caption 12.5 / micro 11。
- 対話テンプレの構造記号(【質問】等)は mono + violet で「機械が読む形」を視覚的に示す。

### 余白リズム
- 4px ベース(sp-1..sp-9)。カード内 sp-4/sp-5、セクション間 sp-6/sp-7。一様 padding は避け、密度はカード=密 / スレッド=ゆったり で差をつける。

### Radius / Shadow / Motion
- radius: sm 6 / md 8 / lg 12 / full。カード md、バブル lg。
- shadow: card(弱)/ popover(強)。影は階層の従。
- motion: fast 150ms / panel 200ms / ease-out。新しい質問の末尾追記は 200ms ease-out で fade+slide-up(transform/opacity のみ)。詳細は各 scr-NN md。

## 画面一覧 (S2 の SCR と 1:1 対応)
- [SCR-01 対応待ち一覧(Inbox)](./scr-01-inbox.html) | [仕様](./scr-01-inbox.md) | [スクショ](./screenshots/scr-01-inbox.default.png) — US-03
- [SCR-02 会話スレッド(統合対話ビュー)★核](./scr-02-conversation-thread.html) | [仕様](./scr-02-conversation-thread.md) | [スクショ](./screenshots/scr-02-conversation-thread.default.png) — US-03/04/05/06
- [SCR-03 成果物レビュー詳細](./scr-03-review-detail.html) | [仕様](./scr-03-review-detail.md) | [スクショ](./screenshots/scr-03-review-detail.default.png) — US-02(+US-04/US-01)
- [SCR-04 ステップ設定の確認・修正](./scr-04-step-config-readback.html) | [仕様](./scr-04-step-config-readback.md) | [スクショ](./screenshots/scr-04-step-config-readback.default.png) — US-06(全ステップ・名前表示 / スコープは入口で決定〔グローバル既定 ↔ サイクル〕/ 1 ステップ単位でない)
- [SCR-05 サイクル進捗(工程グループ束ね)](./scr-05-cycle-progress.html) | [仕様](./scr-05-cycle-progress.md) | [スクショ](./screenshots/scr-05-cycle-progress.default.png) — US-07(2026-06-13 追加)
- [SCR-06 ステップの指示・全文(原文)](./scr-06-step-spec.html) | [仕様](./scr-06-step-spec.md) | [スクショ](./screenshots/scr-06-step-spec.default.png) — US-06(全文確認② / SCR-04 のステップ名からドリルイン)

> **US-01(前段成果物注入)= 画面なし**(S2 D-01)。視覚 footprint は SCR-03 の「※ 前段文脈が見つかりません」マーカー(`missing-context` 状態)のみ。

### 状態網羅(撮影対象)
| SCR | 撮る状態 |
|---|---|
| 01 Inbox | default / empty(未対応 0 件)/ loading |
| 02 Thread | default(1 ターン複数質問をまとめて提示・まとめて回答 / バッチ)/ appended(resume が次バッチを末尾追記 / US-05)/ completed(質問が尽き成果物完成→スレッド完了→Inbox に ◎ / US-03 誤分類しない)/ running(まとめ回答受領→resume 中)/ stall / hearing(設定をバッチでヒアリング)/ empty(着手直後) |
| 03 Review | default(md 描画 + screenshot 2 枚グリッド)/ gallery(視覚証拠多数 = 8 枚グリッド)/ enlarged(クリックで拡大 lightbox)/ loading / missing-context(前段欠落マーカー) |
| 04 Config | default(サイクル入口 / このサイクルの実在ステップを名前で一覧 + 範囲バッジ + 既定を編集リンク)/ global(グローバル入口 = 既定のみ / サイクルタブ無し)/ pre-us(要件決定前 = サイクル最適化ロック)/ loading |
| 05 Progress | default(要件 完了 / 設計 進行中・ステップは名前表示)/ stall(UIデザインが行き詰まり)/ backtrack(画面要素 手戻り ↩)/ variable(技術仕様が無いサイクルでも崩れない = 実在ステップのみ名前表示 / 番号・省略ラベルなし) |
| 06 StepSpec | default(契約の全項目 + AI への指示本文=原文)/ no-instruction(指示本文 未登録)/ loading |

## 視覚カタログ
- [tokens.html](./tokens.html) — ブラウザで開く
- [tokens.png](./screenshots/tokens.png) — スクショ

## 全体 質疑応答ログ

### Q-01 — (現時点で横断論点なし)
- S2 で対話ビュー統合・テンプレ 4 部構成・turn ベースは確定済。S3 は視覚化のみで新たな構造論点は発生していない。視覚方針(既存 design system 継承)に異論があればここで提起。
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  >

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — 視覚言語を新規創出せず、既存 [tokens.css](../../../web/src/styles/tokens.css) を正本として継承する
- **理由**: v0.0.4 の 4 画面は全て既存画面の置換・拡張(S2 D-02)。新パレット/タイポを起こすと既存ボード UI と分裂し、最小差分・一貫性に反する。確定済み design system は既に承認済み。S3 の HTML/CSS は `tokens.css` の数値を複製し「一致を撮る」ことで視覚契約とする。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)
- **上書き内容**(上書き時のみ):

### D-02 — 対話テンプレの構造記号(【質問】【背景】【選択肢】【回答形式】/【回答 → 質問 N】)を mono + violet で描く / 質問はバッチ提示
- **理由**: S1 D-04 / S2 の「双方向フォーマット化」を視覚化。構造記号を等幅 + violet にすることで「機械が確実に処理する形式」を人間にも一目で伝える。背景は既定折りたたみ(disclosure)、展開で全文(品質基準 ①見やすさ / ②全文確認)。**質問は 1 ターンに複数まとめて提示し、まとめて回答・1 回 resume(2026-06-13 ユーザー指摘で確定 / S2・S3 scr-02 D-04)**。さらに **各質問は「選択肢 + ★おすすめ(理由)+ 自由入力欄」を毎回必須表示(Claude 質問窓と同じ感覚 / scr-02 D-05)**。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)
- **上書き内容**(上書き時のみ):

### D-03 — AI/人間バブルを「左 AI(indigo 左罫)/ 右 あなた(indigo soft 塗り)」で色・配置の二重符号化
- **理由**: 誰の発話かを一目で(US-05 主眼の時系列連続性)。色だけに頼らず左右配置でも区別(a11y)。装飾は最小、罫線主導で既存の border-led 階層に合わせる。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)
- **上書き内容**(上書き時のみ):

### D-04 — スレッドフレームのみ幅を狭め(760px)、他画面は 980px
- **理由**: 対話は縦に伸びるため 1 行を短くして視線移動を減らす(連続回答の軽さ / US-05)。一覧・レビュー・設定は情報密度が要るため広め。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)
- **上書き内容**(上書き時のみ):

### D-05 — SCR-05 進捗を 5 PhaseGroup 等幅帯 + 帯内ステップ wrap で可変ステップを吸収(2026-06-13 追加)
- **理由**: US-07(ユーザー指摘)。既存 PhasePipeline の横一列 12 ノードは本数可変で窮屈/はみ出し。PhaseGroup(Discovery/Design/Build/Validation/Improvement)等幅帯にし内包ステップを帯内 wrap すれば、ステップ数差・可変を帯が吸収し全体幅は一定。状態は ✓/●/!/○/↩ の記号+色で二重符号化(a11y)。`variable` スクショで S4 欠落時も崩れないことを視覚契約化。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)
- **上書き内容**(上書き時のみ):

---

## 棄却した案

### R-01 — v0.0.4 用に新しいスタイル方向(別パレット/別タイポ)を起こす
- **棄却理由**: 既存画面の置換・拡張であり、新パレットは UI を分裂させ最小差分に反する。design system は確定済み。

### R-02 — 対話バブルを色のみで AI/人間区別(配置は揃える)
- **棄却理由**: 色覚特性で区別不能になりうる。左右配置 + 色の二重符号化にする(D-03 / a11y)。

## 次工程への引き継ぎ
- S7/S8 が参照すべき対応表(**png + md のみ参照可 / html・css は Read 禁止**):
  | 画面 | スクショ | 仕様 md |
  |---|---|---|
  | SCR-01 | `screenshots/scr-01-inbox.*.png` | `scr-01-inbox.md` |
  | SCR-02 | `screenshots/scr-02-conversation-thread.*.png` | `scr-02-conversation-thread.md` |
  | SCR-03 | `screenshots/scr-03-review-detail.*.png` | `scr-03-review-detail.md` |
  | SCR-04 | `screenshots/scr-04-step-config-readback.*.png` | `scr-04-step-config-readback.md` |
  | SCR-05 | `screenshots/scr-05-cycle-progress.*.png` | `scr-05-cycle-progress.md` |
  | SCR-06 | `screenshots/scr-06-step-spec.*.png` | `scr-06-step-spec.md` |
- native 固有挙動でドメイン側に影響しそうな項目: 無し(本サイクルは web デスクトップのボード UI。native/モバイル固有挙動は対象外、各 md に明記)。
- 状態網羅が S7/S8 実装契約の質を決める: 特に SCR-02 の running / stall は US-04 AC(回答→resume / stall で再試行・黙って失わない)の視覚契約。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか:
- 暫定の解決方針:
- 棄却した案とその理由:

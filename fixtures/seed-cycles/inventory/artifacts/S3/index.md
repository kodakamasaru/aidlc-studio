# S3 — UI 設計確定(視覚意図のイメージ作り / 全体)

## メタ
- 工程: S3 (UI Design / Image)
- PhaseGroup: Design
- 役割: プロダクトデザイナー(視覚意図担当)
- バージョン: v0.0.1
- ステータス: 確定
- 入力参照: 画面要素(ワイヤーフレーム / S2)
- 作成日: 2026-06-13
- 更新日: 2026-06-14

---

## 全体方針

### スタイル方向
**Light Utility — 業務ツールとしての即読性を最優先にした明快なライトモード設計。**

参照イメージ: Linear の issue リスト / Notion の database ビュー。装飾を極力排除し「数字と色とラベルだけで状態が読める」を原則とする。スタッフが立ち仕事中に手に持ったスマートフォンを一瞥して状況判断できることがデザインの最優先指標。

- 背景は純白ではなくやや温かみのある off-white (`#FAFAF8`)
- カードのふちには強いシャドウではなく 1px の薄いボーダー
- 状態ラベル(在庫切れ/要注意/在庫十分)だけが有彩色で、その他のテキストはグレースケール

### カラー方針

| 役割 | 値 | 使用箇所 |
|------|-----|---------|
| Background | `#FAFAF8` | 全画面の最背面 |
| Surface | `#FFFFFF` | カード・フォーム背景 |
| Border | `#E5E5E2` | カードのふち・セパレータ |
| Text Primary | `#1A1A18` | 見出し・商品名 |
| Text Secondary | `#6B6B68` | 日時・メモ・補足 |
| Text Disabled | `#B0B0AD` | 読み取り専用フィールド |
| Status 在庫切れ BG | `#FEE2E2` | 行ハイライト背景 |
| Status 在庫切れ Label | `#DC2626` | ラベルテキスト・アイコン |
| Status 要注意 BG | `#FEF9C3` | 行ハイライト背景 |
| Status 要注意 Label | `#CA8A04` | ラベルテキスト・アイコン |
| Status 在庫十分 Label | `#6B6B68` | ラベルテキスト(強調しない) |
| Accent ボタン | `#18181B` | プライマリボタン背景(黒) |
| Accent Text | `#FFFFFF` | プライマリボタンテキスト |
| Danger | `#DC2626` | 無効化ボタン・破壊的操作 |
| Warning Banner BG | `#FFFBEB` | 棚卸し乖離警告バナー |
| Warning Banner Border | `#FCD34D` | 棚卸し乖離警告バナーのふち |

**階調数**: ニュートラル 9 段 (`#1A1A18` → `#FAFAF8`) / 状態色は各2段(背景+テキスト)

### タイポグラフィ

- **本文フォント**: `'Inter', 'Helvetica Neue', system-ui, sans-serif`
- **見出しフォント**: Inter 共通。別フォントは使わない
- **数字**: `font-variant-numeric: tabular-nums` を在庫数・差分の数字に適用して列揃え

| スケール | サイズ / ウェイト | 使用箇所 |
|---------|----------------|---------|
| heading-lg | 20px / 600 | 画面タイトル |
| heading-md | 16px / 600 | セクション見出し・在庫数 |
| body | 15px / 400 | 商品名・フォームラベル |
| body-sm | 13px / 400 | 在庫数補足・日時・メモ |
| label | 11px / 600 uppercase | ステータスラベル(在庫切れ等) |
| micro | 10px / 400 | 閾値・補足情報 |

- 行間: body `1.5` / heading `1.3`
- 字間: デフォルト。label のみ `letter-spacing: 0.05em`

### 余白リズム

ベース: **8px グリッド**

| トークン | 値 | 使用箇所 |
|---------|-----|---------|
| space-xs | 4px | アイコン ↔ テキストの隙間 |
| space-sm | 8px | フォームフィールド内 padding |
| space-md | 16px | カード内 padding / 行間隔 |
| space-lg | 24px | セクション間・フォームフィールド間 |
| space-xl | 32px | 画面上下の余白 |

### Radius / Shadow / Motion

| 項目 | 値 |
|------|-----|
| radius-sm | 6px (入力フィールド・ラベルバッジ) |
| radius-md | 10px (カード・ドロップダウン) |
| radius-lg | 16px (フローティングボタン群・ダイアログ) |
| shadow-card | `0 1px 2px rgba(0,0,0,0.06)` + `0 0 0 1px #E5E5E2` |
| shadow-dropdown | `0 8px 24px rgba(0,0,0,0.12)` |
| shadow-fab | `0 4px 12px rgba(0,0,0,0.15)` |
| motion-fast | 120ms ease-out |
| motion-normal | 200ms ease-out |
| motion-enter | 250ms cubic-bezier(0.16, 1, 0.3, 1) — slide-up fade-in |

---

## 画面一覧 (S2 の SCR と 1:1 対応)

| SCR | 画面名 | 主な状態 |
|-----|-------|---------|
| SCR-01 | 在庫一覧 | default / empty / loading |
| SCR-02 | 入庫フォーム | default / error / loading(submit中) |
| SCR-03 | 出庫フォーム | default / error(在庫超過) |
| SCR-04 | 商品登録フォーム | default / error(重複・必須未入力) |
| SCR-05 | 棚卸し — 実数入力 | default |
| SCR-06 | 棚卸し — 差分確認 | normal / warning(乖離) |
| SCR-07 | 商品詳細 / 編集画面 | default / read-only フィールド |

---

## SCR-01: 在庫一覧 — コンポーネント仕様

### レイアウト構造

```
[ヘッダーバー]          height: 56px, bg: Surface, border-bottom: Border
  左: アプリ名 (heading-md / Text Primary)
  右: アラートバッジ — 在庫切れ件数(bg:#FEE2E2, text:#DC2626) + 要注意件数(bg:#FEF9C3, text:#CA8A04)
      件数 0 の場合は非表示

[検索バー]              height: 44px, mx: space-md, my: space-sm
  bg: #F5F5F3, radius-sm, border: 1px Border
  左アイコン: 虫眼鏡(Text Secondary)
  placeholder: "商品名で検索..." (body / Text Disabled)

[フィルタタブ]          height: 40px, border-bottom: Border
  タブ3本: すべて / 要注意(件数バッジ) / 在庫切れ(件数バッジ)
  アクティブ: border-bottom 2px solid #1A1A18, Text Primary
  非アクティブ: Text Secondary

[商品リスト]            scroll可, pb: 80px (FAB 分)
  行の並び: 在庫切れ → 要注意 → 在庫十分 (優先度順)
  在庫切れ行: bg: #FEE2E2
  要注意行:   bg: #FEF9C3
  在庫十分行: bg: Surface
  各行の構造:
    左(flex-1): 商品名(body/600/Text Primary) / 単位+最終更新(micro/Text Secondary)
    右(fixed 80px): 在庫数(heading-md/tabular-nums/Text Primary) / 閾値(micro/Text Secondary) / ステータスラベル
  行セパレータ: 1px Border

[FABエリア]             fixed bottom-0, bg: Surface/90 backdrop-blur, border-top: Border
  ボタン4本横並び: [棚卸し] [出庫] [入庫] [+ 登録]
  各ボタン: bg:#1A1A18, color:white, radius-md, body-sm/600, height:40px, px:space-md
```

### 状態定義
- **default**: 商品リストあり。アラートバッジ表示
- **empty**: 商品0件。「まだ商品が登録されていません」(body/Text Secondary) + 「商品を登録する」ボタン(primary)
- **loading**: 各行をスケルトンブロック(bg:#E5E5E2, radius-sm, animate-pulse)で表示

### a11y
- 各商品行: `role="listitem"`, `aria-label="商品名, 在庫N単位, ステータス"`
- アラートバッジ: `aria-live="polite"` — 入出庫後に件数更新を通知
- ステータスラベルは色+アイコン+テキストの3点セット(色のみに依存しない / WCAG 1.4.1)
- 色コントラスト: 在庫切れ `#DC2626` on `#FEE2E2` → 4.6:1(AA 達成)
- 要注意 `#CA8A04` on `#FEF9C3` → 4.7:1(AA 達成)

### motion
- リスト初回表示: 各行が 20ms stagger で translateY(8px)→0 + opacity:0→1, 120ms ease-out
- 在庫数更新後: 数字が scale(1.2)→scale(1), 150ms ease-out

---

## SCR-02: 入庫フォーム — コンポーネント仕様

### レイアウト構造

```
[ナビバー]              bg: Surface, border-bottom: Border
  「← 入庫登録」(heading-md)

[フォーム本体]          padding: space-lg
  [商品選択フィールド]
    ラベル: body-sm/600/Text Primary
    ドロップダウン: height 44px, radius-sm, border: Border
    選択後: 現在庫「N 単位」を body-sm/Text Secondary でフィールド直下に表示

  [入庫数量フィールド]
    ラベル: body-sm/600/Text Primary
    Input + 単位ラベル inline (display:flex, gap:space-sm)
    Input: height 44px, width: 120px, text-align: right, tabular-nums

  [メモフィールド]
    ラベル: body-sm/Text Secondary + 「任意」バッジ(label, bg:#F5F5F3)
    Textarea: 3行, resize:none, radius-sm

[フッターボタン]         fixed bottom-0 + safe-area, bg: Surface, border-top: Border, padding: space-md
  [キャンセル] ghost button (body/Text Secondary)
  [登録する]   primary button (bg:#1A1A18, color:white, radius-md, body/600)
```

### フィールド共通スタイル
- Input / Select: height 44px, bg: Surface, border: 1px Border, radius-sm, px: space-md, body/400
- Focus ring: `outline: 2px solid #1A1A18; outline-offset: 2px`
- Error state: border-color `#DC2626`。エラーメッセージを body-sm/`#DC2626` でフィールド直下に表示

### 状態定義
- **default**: フォーム空。商品未選択時は現在庫表示なし
- **error**: 数量が0以下または空。インラインエラーメッセージ表示
- **loading(submit中)**: 「登録する」ボタンをスピナー+「登録中...」に置き換えてdisabled

### motion
- 画面スライドイン: translateX(100%)→0, 250ms cubic-bezier(0.16, 1, 0.3, 1)
- 現在庫表示の出現: opacity:0→1 + translateY(-4px)→0, 150ms ease-out (商品選択後)

---

## SCR-03: 出庫フォーム — コンポーネント仕様

SCR-02 と同構造。差分のみ記載。

### 差分
- タイトル: 「出庫登録」
- 出庫数量が現在庫数を超えた場合:
  - Input border: `#DC2626` (error state にリアルタイム移行)
  - フィールド下: 「在庫数(N 単位)を超えて出庫できません」(body-sm / `#DC2626`)
  - 「登録する」ボタン: disabled (bg: `#B0B0AD`, cursor: not-allowed)
- バリデーションはblur待ちにせず入力中にリアルタイム評価

---

## SCR-04: 商品登録フォーム — コンポーネント仕様

### レイアウト構造

```
[ナビバー]  「← 商品登録」
[フォーム]  4フィールド縦並び(各フィールド間: space-lg)
  商品名 *
  単位 *
  初期在庫数 *
  アラート閾値  ← フィールド下に micro/Text Secondary で「0 を設定するとアラートを無効にします」
[フッターボタン]  [キャンセル] / [登録する]
```

### 状態定義
- **error 重複**: 商品名フィールド下に「"XXX" はすでに登録されています」
- **error 必須未入力**: 「登録する」押下時に全未入力フィールドを一括エラー表示

---

## SCR-05: 棚卸し — 実数入力 — コンポーネント仕様

### レイアウト構造

```
[ナビバー]  「← 棚卸し (1/2)」
[ステッパー]  ●─○  (step1 塗り / step2 抜き)
             body-sm / Text Secondary
[フォーム]
  商品選択
  システム在庫数: フィールド下に body/600/Text Secondary で表示(入力を誘導しない大きさ)
  実在庫数入力: placeholder 「実際に数えた数を入力」
  メモ (任意)
[フッターボタン]  [キャンセル] / [確認へ進む]
```

---

## SCR-06: 棚卸し — 差分確認 — コンポーネント仕様

### レイアウト構造

```
[ナビバー]  「← 棚卸し確認 (2/2)」
[ステッパー]  ●─●  (両方塗り)

[警告バナー] (±20% 超の場合のみ表示)
  bg: #FFFBEB, border: 1px solid #FCD34D, radius-md, padding: space-md
  「⚠ 差分が 20% を超えています。入力を確認してください」
  body-sm / #92400E

[差分サマリーカード]
  bg: Surface, border: 1px Border, radius-md, padding: space-lg
  行1: 「調整前」(body/Text Secondary)  .... 「25 袋」(heading-md/tabular-nums/Text Primary)
  行2: 「調整後」(body/Text Secondary)  .... 「18 袋」(heading-md/tabular-nums/Text Primary)
  ─── セパレータ ───
  行3: 「差分」 (body/600/Text Primary)  .... 「−7 袋 (−28%)」
    normal: heading-md / tabular-nums / Text Primary
    warning: heading-md / tabular-nums / #DC2626

[メモ表示]  body-sm / Text Secondary

[フッターボタン]  [修正する](ghost) / [確定する](primary)
  ※±20% 超でも「確定する」は有効(強制上書き可)
```

### 状態定義
- **normal**: 差分±20%以内。警告バナーなし
- **warning**: 差分±20%超。警告バナー表示。差分テキスト `#DC2626`

### motion
- 警告バナーの出現: height:0→auto + opacity:0→1, 200ms ease-out

---

## SCR-07: 商品詳細 / 編集画面 — コンポーネント仕様

### レイアウト構造

```
[ナビバー]  「← 商品名」  右端に [保存する](primary, height:32px, body-sm/600)

[編集フィールド群]
  商品名 / 単位 / アラート閾値 (各フィールド共通スタイル)

[読み取り専用フィールド]
  初期在庫数: bg:#F5F5F3, Text Disabled, cursor:not-allowed, radius-sm
  登録日: body-sm / Text Secondary

[履歴セクション]
  見出し「直近の履歴」(heading-md)
  最新5件リスト:
    各行: 日時(micro/Text Secondary) | 種別バッジ(入庫=bg:#DBEAFE/text:#1D4ED8, 出庫=bg:#FEE2E2/text:#B91C1C, 棚卸し=bg:#EDE9FE/text:#6D28D9) | 差分数量(body-sm/tabular-nums) | メモ(body-sm/Text Secondary)

[無効化リンク]
  body-sm / #DC2626 / underline
  タップで確認ダイアログ表示
```

### 確認ダイアログ(無効化)

```
[オーバーレイ]         bg: rgba(0,0,0,0.4)
[ダイアログカード]      bg: Surface, radius-lg, padding: space-xl, max-width: 320px, centered
  タイトル: 「この商品を無効化しますか?」(heading-md)
  本文: 「在庫一覧から除外されます。履歴は保持されます。」(body-sm / Text Secondary)
  ボタン行: [キャンセル](ghost) / [無効化する](bg:#DC2626, color:white, radius-md)
```

### motion
- ダイアログ出現: scale(0.95)→scale(1) + opacity:0→1, 200ms ease-out

---

## 全体 質疑応答ログ

### Q-01 — ライトモードのみか、ダークモードも用意するか?
- **回答**(AI 代筆):
  > ライトモードのみで十分。店舗は明るい環境が多く、ダークモードは今サイクルの優先度ではない。
- **確定**(AI 記入):
  > v0.0.1 はライトモードのみで設計する。ダークモードは v0.0.2 以降に検討。

### Q-02 — ステータスラベルの色にブランドカラーの制約はあるか?
- **回答**(AI 代筆):
  > 特になし。業務ツールとして視認性が最優先。
- **確定**(AI 記入):
  > 状態色は赤/黄/グレーの業務標準配色を採用。ブランドカラーはプライマリボタン(黒)に限定する。

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — プライマリボタンを黒(#18181B)とした
- **理由**: 在庫切れ(赤)・要注意(黄)が常に画面上に存在する中で、有彩色のブランドカラーはステータス色と混同するリスクがある。黒は状態色と干渉しない。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — ステータスラベルを UPPERCASE の label(11px/600)とした
- **理由**: 在庫数(heading-md/大)と並ぶためラベルが同サイズだと競合する。小さく大文字のラベルは「補足情報」として視覚的に棲み分けられる。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — 在庫切れ・要注意行の背景全体を着色した
- **理由**: ラベルだけでは視線が自然に止まらない。行全体の着色により「この行に問題がある」という認知を一瞬で得られる。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-04 — Inter フォントを採用した
- **理由**: tabular-nums デフォルト対応で在庫数の列揃えに最適。Google Fonts からセルフホスト可能。Noto Sans JP は日本語フォールバックに任せることでロードコスト(150kB+)を回避。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案

### R-01 — グラスモーフィズム(すりガラス)デザイン
- **棄却理由**: 業務中の高速スキャン用途に視覚的装飾は余計。ノイズが状態認識を遅らせる。

### R-02 — サイドナビ付きのデスクトップファースト設計
- **棄却理由**: 対象ユーザーはスマートフォン/タブレットを手持ちで使う。モバイルファーストが正。

### R-03 — 商品ごとのカテゴリカラー(色分け)
- **棄却理由**: 商品数が増えると色の意味が消える。状態色(赤/黄)を最優先で機能させるため商品カラーはノイズになる。

---

## 次工程への引き継ぎ
- S7/S8 が参照すべき screenshots と md の対応表:
  - SCR-01 の default/empty/loading が視覚契約の中核
  - SCR-06 の warning 状態の警告バナーは実装で省略禁止
  - 在庫切れ行の背景色(#FEE2E2)・要注意行(#FEF9C3)は CSS クラスで必ず実現すること
- native 固有挙動でドメイン側に影響しそうな項目: なし(Web アプリのため)

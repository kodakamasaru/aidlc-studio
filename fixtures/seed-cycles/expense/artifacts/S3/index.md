# S3 — UI デザイン仕様

| 項目 | 値 |
|---|---|
| ステップ | S3 |
| 対象 | expense v0.0.1 |
| ステータス | 確定 |
| 完了日 | 2026-06-18 |

---

## 全体方針

**スタイルディレクション:** ミニマル + 暖色。清潔感のある白地ベースに amber をアクセントカラーとして用い、「家計管理」という日常ツールにふさわしい親しみやすさと信頼感を両立する。デコレーションは最小限にとどめ、数字と状態が素早く読み取れる可読性を最優先とする。

---

## カラーシステム

| 役割 | 変数名 | 値 | 用途 |
|---|---|---|---|
| ベース背景 | `--color-bg` | `#ffffff` | ページ背景 |
| サーフェス | `--color-surface` | `#fafaf9` | カード・リスト背景 |
| ボーダー | `--color-border` | `#e7e5e4` | 区切り線 |
| テキスト主 | `--color-text-primary` | `#1c1917` | 見出し・金額 |
| テキスト副 | `--color-text-secondary` | `#78716c` | メモ・日付 |
| アクセント | `--color-accent` | `#f59e0b` | CTA ボタン・選択状態 |
| アクセント濃 | `--color-accent-dark` | `#d97706` | ホバー・プレス状態 |
| 警告 | `--color-warning` | `#fef3c7` | 80%超過バナー背景 |
| 警告テキスト | `--color-warning-text` | `#92400e` | 警告バナー文字 |
| 超過 | `--color-danger` | `#fecaca` | 100%超過バナー背景 |
| 超過テキスト | `--color-danger-text` | `#991b1b` | 超過バナー文字 |
| 成功 | `--color-success` | `#d1fae5` | 登録完了トースト |

### カテゴリカラー(グラフ用)

| カテゴリ | 色 |
|---|---|
| 食費 | `#f59e0b` |
| 交通 | `#60a5fa` |
| 日用品 | `#34d399` |
| 娯楽 | `#f87171` |
| 医療 | `#a78bfa` |
| その他 | `#94a3b8` |

---

## タイポグラフィ

| 役割 | フォント | サイズ | ウェイト |
|---|---|---|---|
| 見出し(画面タイトル) | Inter, Noto Sans JP | `1.25rem` (20px) | 700 |
| 金額大 | Inter | `2rem` (32px) | 700 |
| 金額中 | Inter | `1.125rem` (18px) | 600 |
| 本文 | Inter, Noto Sans JP | `1rem` (16px) | 400 |
| 補助テキスト | Inter, Noto Sans JP | `0.875rem` (14px) | 400 |
| ラベル | Inter, Noto Sans JP | `0.75rem` (12px) | 500 |

```css
:root {
  --font-sans: 'Inter', 'Noto Sans JP', sans-serif;
  --text-heading: 1.25rem;
  --text-amount-lg: 2rem;
  --text-amount-md: 1.125rem;
  --text-body: 1rem;
  --text-sub: 0.875rem;
  --text-label: 0.75rem;
}
```

---

## スペーシング

8px グリッドベース。

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
}
```

---

## コンポーネント仕様

### 予算バナー (BudgetBanner)

- 状態: `warning`(80%+) / `over`(100%+) / `hidden`(予算なし or <80%)
- `warning`: 背景 `--color-warning`、アイコン ⚠ amber、テキスト `--color-warning-text`
- `over`: 背景 `--color-danger`、アイコン ✕ red、テキスト `--color-danger-text`
- 角丸: `8px`、padding: `--space-4`

### 支出行 (ExpenseRow)

- 左: カテゴリアイコン(カテゴリカラーの背景円)
- 中央上: カテゴリ名 + メモ先頭20文字
- 中央下: 日付(YYYY/MM/DD)
- 右: 金額 ¥X,XXX (Inter 600)
- 長押しで削除メニューが bottom sheet で出現

### CTA ボタン (PrimaryButton)

- 背景: `--color-accent`、テキスト: white、角丸: `12px`
- hover: `--color-accent-dark`、transition: `150ms ease`
- 幅: full-width(フォーム内) / auto(その他)

### カテゴリ選択チップ (CategoryChip)

- 未選択: border `--color-border`、背景 `--color-surface`
- 選択済: border `--color-accent`、背景 `#fef3c7`、テキスト `--color-accent-dark`

### 空状態 (EmptyState)

- SCR-01: テキストのみ。「まだ支出が登録されていません」グレー補助テキスト + CTA。
- SCR-03: SVG イラスト(グラフが空のイメージ、amber 単色)+ テキスト。イラストサイズ `160×120px`。

---

## 画面別スタイル補足

### SCR-01: ホーム

- ヘッダー: 白地、タイトル「家計簿」左寄せ、h1 相当
- リスト区切り: `1px solid --color-border`
- FAB ではなくボトム固定の full-width ボタン

### SCR-02: 支出登録フォーム

- 入力フィールド: 下線のみ(アウトラインなし)、フォーカス時に amber アンダーライン
- 日付: ネイティブ `<input type="date">` を使用、スタイル統一
- カテゴリ: 2列×3行グリッド、選択時 CategoryChip のアクティブスタイル

### SCR-03: 月次レポート

- 月切り替え: ◀ ▶ ボタン、月名は `--text-heading` 中央揃え
- 円グラフ: recharts `PieChart`、凡例は右側縦並び
- 棒グラフ: recharts `BarChart`、X 軸に月名

### SCR-04: 予算設定

- プログレスバー: 高さ `8px`、角丸 `4px`、充填色は `--color-accent`(80%+で `--color-warning-text`)

---

## Q&A ログ

### Q-01: SCR-03 空状態のイラストは自作 SVG か画像ファイルか?

**回答(D-01):** → インライン SVG で実装する。画像ファイルの依存を増やさない。amber 単色 + 線画スタイル。

### Q-02: ダークモードは対応するか?

**回答(D-02):** → v0.0.1 はライトモードのみ。`prefers-color-scheme` 対応は v0.1 以降。

---

## AI 独自決定

| ID | 決定内容 | 根拠 |
|---|---|---|
| D-01 | SCR-03 空状態: インライン SVG | 依存最小・軽量。amber 単色でブランドカラーと統一。 |
| D-02 | ダークモード非対応(v0.0.1) | MVP スコープ外。ライトモードの完成度を優先する。 |
| D-03 | グラフライブラリに recharts を採用 | React ネイティブ・軽量・宣言的 API。Chart.js より React 親和性が高い。 |

---

## 次工程 S4 への引き継ぎ

- カラー変数・タイポグラフィ変数・スペーシング変数を `tokens.css` に定義する。
- recharts を依存として追加する。
- ナビゲーションライブラリは未決定。S4 技術仕様で確定すること。

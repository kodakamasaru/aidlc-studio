# SCR-01: 対応待ち一覧(Inbox) — コンポーネント仕様

## メタ
- 親: [s3/index.md](./index.md)
- 視覚 source: [scr-01-inbox.html](./scr-01-inbox.html)(人間レビュー用 / S7/S8 は Read 禁止)
- スクショ:
  - [default](./screenshots/scr-01-inbox.default.png)
  - [empty](./screenshots/scr-01-inbox.empty.png)
  - [loading](./screenshots/scr-01-inbox.loading.png)
- 対応 S2 SCR: [SCR-01](../s2/scr-01-inbox.md)
- 対応 US: [US-03](../s1/us-03-output-question-routing.md)
- ステータス: 確定(2026-06-13)

## native 固有挙動
- 本サイクルは web デスクトップのボード UI。native/モバイル固有挙動(safe area / status bar / swipe back 等)は対象外。

## a11y
- **種別の二重符号化**: カード種別は色だけでなく、記号(「?」= 質問 / 「◎」= できあがりの確認)とテキストラベルの組み合わせで表示する。色覚特性があるユーザーでも記号とテキストのみで種別を判断できる。
- **カードのロール**: カード全体を単一のインタラクティブ要素(`<a>` または `role="link"`)とし、アクセシブルな名前として「[種別] [タイトル]—回答する」/「[種別] [タイトル]—確認する」を含める。スクリーンリーダーが一読して何ができるかを伝える。
- **フォーカス順**: カードは上から時系列順(新着が上)。Tab キーでカードを順に移動できる。先頭カードに到達するまでスキップリンクは不要だが、将来フィルタや検索 UI を追加する場合は再検討する。
- **コントラスト**: サブテキスト(`text-low` / `#8b8b96`)は背景(`surface-1` / `#1a1a2e` 相当)に対して 4.5:1 以上を満たすこと。tokens.css で管理し、値が変更された場合は本仕様と同期する。
- **empty 状態**: 「未対応のタスクはありません」等、意味のある空メッセージを表示する。単なる空欄は不可。
- **loading 状態**: スケルトンカードを表示。`aria-busy="true"` をリスト要素に付与し、スクリーンリーダーに読み込み中を伝える。

## pointer / keyboard 操作
- **hover**: カード上でポインタが乗ると `border-color` が `border-strong` へ、背景が `surface-2` へ遷移する。ポインタは `cursor: pointer`。
- **Enter / クリック**: カード全体がクリック可能。種別によって遷移先を分岐する。
  - 種別「質問」→ SCR-02(会話スレッド)
  - 種別「できあがりの確認」→ SCR-03(成果物レビュー詳細)
- **フォーカスリング**: フォーカス時に `outline: 2px solid var(--color-accent)` / `outline-offset: 2px` を表示する。デフォルト outline を消すことは禁止。

## motion
HTML の transition は参考にされない。motion 意図はここに文字で書く。

- **新着カードの差し込み**: 新着カードはリスト上端に挿入される。挿入時に `opacity: 0 → 1`(200ms) と `translateY(-8px → 0)`(200ms) を同時に行い、`ease-out` で着地させる。他のカードは位置変更アニメーションを伴わない(レイアウトシフト防止)。
- **hover 遷移**: `border-color` と `background-color` の変化は 150ms `ease` で遷移する。即時切り替えはしない。
- **loading→default**: スケルトンから実カードへの切り替えは 150ms `opacity` fade。
- **reduced-motion**: `prefers-reduced-motion: reduce` の場合、すべての transition を 0ms にフォールバックする。

## この画面固有の 質疑応答ログ
個別論点なし

---

## この画面固有の AI が独自に決めたこと と 理由
### D-01 — 新着カードの差し込み方向を `translateY(-8px → 0)` に決定
- **理由**: 時系列で上端=新しいレイアウトにおいて「上から落ちてくる」方向が自然。`translateY(8px → 0)`(下から浮き上がり)は逆方向で視覚的に違和感が生じる。8px は過度に大きくなく、motion の存在を示す最小限の変位。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)

### D-02 — hover 時に `box-shadow` / `transform: scale` を使わない
- **理由**: `box-shadow` はコンポジタ非対応でレイアウト再計算を誘発する可能性がある。`background-color` + `border-color` の変化のみでも「持ち上がり感」の視覚意図は十分表現できる。performance.md の方針(コンポジタフレンドリーなプロパティのみアニメート)に準拠。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)

---

## この画面固有の 棄却した案
- **R-01 カードをチェックボックス付きリストにする案**: 複数選択一括処理を想定した設計だが US-03 AC に一括対応は含まれない。YAGNI により棄却。

# SCR-04: レビュー詳細(汎用 block-stream)— コンポーネント仕様

## メタ
- 親: [s2.5/index.md](./index.md)
- 視覚 source: [scr-04-review-detail.html](./scr-04-review-detail.html)(人間レビュー用 / S6/S7 は Read 禁止)
- スクショ:
  - [default](./screenshots/scr-04-review-detail.default.png)
  - [backtrack](./screenshots/scr-04-review-detail.backtrack.png)
- 対応 S2 SCR: [SCR-04](../s2/scr-04-review-detail.md) / 設計: [design/review-output.md](../design/review-output.md)
- 対応 US: [US-13](../s1/us-13-visual-review-step.md)
- ステータス: 確定

## 状態網羅
- **default**: ReviewBlock[] を上から block-stream で描画(summary / ac-map / mermaid / risk … MVP は軽いブロックのみ)。topbar 右に 2 アクション = 差し戻し(↩・危険寄り)/ 承認して次 Phase へ(primary)。
- **backtrack**: 差し戻しダイアログ(modal)。戻り先ステップ(任意の過去ステップ select)+ 理由(必須・複数行)。確定で「Sn から再開する」。

## block-stream の視覚規約(製品の心臓)
- 各 block = カード(surface + line + radius-lg)。head に `kind` ラベル(violet・uppercase・tracking)。
- **block 種別ごとの見た目**:
  - `summary`: 段落本文。要点を太字(text-hi)。
  - `ac-map`: US 番号(mono・indigo-400)+ 対応行。1 行 1 マッピング、薄い区切り線。
  - `mermaid`: 図のプレースホルダ枠(dashed)。MVP は静的図、リッチ描画は v0.0.x。
  - `risk`: 重大度バッジ(CRITICAL/HIGH=red・MEDIUM=amber・LOW=neutral)+ 説明。
  - `screenshot` / `test-report` / 動画 dossier 等の重いブロックは **v0.0.x**(MVP は描かない)。
- **未知の block 種別**: 壊さず安全にスキップ or プレースホルダ(汎用レンダラの堅牢性 / S2 備考)。S6/S7 はこの「未知種別の安全描画」を実装契約として持つこと。

## 挙動(web / レスポンシブ)
- block-stream は max-width ~820px の単一カラムで可読性優先。アクションは topbar に固定(長い stream をスクロールしても届く)。
- 差し戻しは **手戻り先ステップ選択 + 理由** → Decision/ledger に残す(監査可能性 / S2 D-03)。理由は必須。

## a11y
- アクション 2 つは色だけでなくラベル(承認 / 差し戻し)+ アイコン。差し戻しは危険寄りだが赤一色にせず、確定はダイアログで二段階(誤操作防止)。
- block の kind ラベルはスクリーンリーダ向けに `aria-label`(例: "ブロック種別: リスク")。
- risk 重大度は色 + テキスト(CRITICAL 等)。
- modal: フォーカストラップ / Esc / `aria-modal`。理由未入力時は確定不活性 + 入力誘導。

## interaction(web pointer / keyboard)
- 承認 = primary、Enter で確定可。差し戻し = ダイアログを開く(直接確定はしない)。
- ダイアログ: select でステップ選択 → 理由入力 → 「Sn から再開する」。Tab 循環。

## motion(文字で)
- block-stream は初回 stagger fade-in(各ブロック 60ms ずつ遅延、150–200ms ease-out)で上から順に。
- 差し戻しダイアログ: 200ms cubic-bezier(0.16,1,0.3,1) fade+slide-up。
- 承認 / 差し戻し確定後は SCR-02 へ遷移(画面切替は 200ms クロスフェード想定)。

## 設計連携メモ(S3/S5 へ)
- ReviewBlock[] は step × task-kind の出力差をデータで吸収(S2 D-02 / review-output.md)。S5 で ReviewBlock の kind を持つ集約として定義し、未知 kind の前方互換(安全スキップ)を型で担保すること。差し戻しは Decision/ledger 追記を伴う。

## この画面固有の 質疑応答ログ
### Q-01 — アクションの重み付け(承認 primary / 差し戻し危険寄り)で良いか
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  > (暫定)承認 = primary(前進が既定)、差し戻し = 危険寄り outline + ダイアログ二段階。差し戻しを軽くしすぎない(手戻りは品質投資だが誤爆は防ぐ)。

---

## この画面固有の AI が独自に決めたこと と 理由
### D-01 — block head に kind ラベルを常時表示(violet)
- **理由**: 汎用 block-stream は種類が混在する。各ブロックが何か(summary/ac-map/mermaid/risk)を即判別できると、人間のレビュー走査が速い。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-02 — 差し戻しは必ずダイアログ(直接確定不可)
- **理由**: 戻り先 + 理由は監査記録(ledger)になる。1 クリック誤爆を防ぎ、理由必須を強制するため二段階に。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

---

## この画面固有の 棄却した案
### R-01 — 重いブロック(動画 dossier 等)を MVP で描く
- **棄却理由**: S2 で v0.0.x 送り。MVP は軽いブロック(summary/ac-map/mermaid/risk)で縦ループ貫通に集中。

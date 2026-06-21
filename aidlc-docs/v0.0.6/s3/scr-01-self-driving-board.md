# SCR-01: 自走ボード — コンポーネント仕様

## メタ
- 親: UIデザインの一覧(このサイクルの S3)
- 視覚 source: scr-01-self-driving-board.html
- スクショ:
  - default: screenshots/scr-01-self-driving-board.default.png
  - empty: screenshots/scr-01-self-driving-board.empty.png
- 対応 S2 SCR: SCR-01(このサイクルの S2 成果物)
- 対応 US: US-01(スケジューラ)/ US-05(reconcile-resume)/ US-06(stall)/ US-07(逐次監視)/ US-08(稼働台帳)
- ステータス: 確定

## native 固有挙動
- safe area: web/desktop — N/A
- status bar: web/desktop — N/A
- keyboard avoidance: web/desktop — N/A(入力フォームなし)
- iOS swipe back / Android back: web/desktop — N/A
- pull-to-refresh: web/desktop — N/A。稼働台帳は WebSocket または短周期ポーリングで自動更新。

## a11y
- VoiceOver / TalkBack ラベル: web 用 aria-label を付与。各タスク行は `role="row"` + `aria-label="[バッジ種別], [サイクル] / [ステップ名], [last activity]"` を設定。並列インジケータは `aria-label="並列実行数 3 / 上限 4"` を付与。
- focus order: トップバー(タイトル → プロジェクト切替 → 並列数表示) → 稼働中セクション(各タスク行) → 待ち・復帰中セクション(各タスク行 → parking 行の「Inbox で回答」ボタン)。論理順序と DOM 順序を一致させる。
- 色コントラスト基準(WCAG AA 4.5:1 以上): 全バッジは三重エンコード(色 + アイコン + テキスト)で色のみに依存しない。
  - `--color-backoff: #60a5fa` vs `--color-bg: #09090b` → 約 6.8:1 ✓
  - `--color-resume: #5eead4` vs `--color-bg: #09090b` → 約 8.2:1 ✓
  - `--color-parking: #818cf8` vs `--color-bg: #09090b` → 約 4.9:1 ✓
  - `--color-running: #2dd4bf` vs `--color-bg: #09090b` → 約 7.1:1 ✓
  - `--color-stalled: #f59e0b` vs `--color-bg: #09090b` → 約 5.3:1 ✓
- 三重エンコードの根拠: アイコン(●/⟳/⏸/⚠/◐) + 色(teal/blue/indigo/amber/lt-cyan) + テキストラベルの 3 つで状態を識別できるため、色覚特性やモノクロ環境でも判別可能。

## gesture
- tap: タスク行をクリック → 該当ステップの会話スレッドへ遷移(既存スレッド画面)
- long press: N/A(web/desktop)
- swipe: N/A(web/desktop)
- pan / drag: N/A(web/desktop)

## motion
- 状態バッジの切り替わり(例: 実行中 → stall→retry): 150ms ease-out で `background-color` / `border-color` を cross-fade。`transform` / `opacity` のみ使用。
- 稼働中一覧へのタスク追加(新タスク起動): 200ms cubic-bezier(0.16, 1, 0.3, 1) で `opacity: 0 → 1` + `transform: translateY(-4px) → translateY(0)` の fade-slide-in。
- タスク行の削除(完了 / done): 150ms ease-out で `opacity: 1 → 0`、次の 200ms で後続行が `transform: translateY` でスムーズに詰まる。
- 並列インジケータのドット色変化(空 → 埋まる): 150ms ease-out で `background-color` が `--color-surface-3` → `--color-running` に変化。
- empty 状態への切り替わり: 200ms ease-out で fade-in。

## この画面固有の 質疑応答ログ

### Q-01 — parking タスクの `Inbox で回答` ボタン位置は task-meta 列か、別行展開か
- **回答**(人間の回答を AI が記入):
  > (S2 の Q&A で parking = human-gate 回答待ちと確定。追加 Q なし)
- **確定**(AI 記入):
  > parking バッジが付いたタスク行の末尾 action 列にゴーストボタンを出す。別行展開は情報密度を下げるため採用しない(技術判断 D-01)。

---

## この画面固有の AI が独自に決めたこと と 理由

### D-01 — 稼働中 / 待ち・復帰中 の 2 セクション分割
- **理由**: 「今動いている」と「待っている」は人間のアクション不要 / 要の境界と一致する。稼働中は監視のみ。待ちセクションのうち parking 行だけ「Inbox で回答」ボタンが必要。セクション見出しで分ければスキャンしやすく、介在点の有無を一目で判断できる。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — backoff の補助文言「約 N 分後に自動再開」+ 残時間を task-meta 列に表示
- **理由**: S2 D-02「backoff は時間で回復する待ち / 人間に行動を求めない」。残時間を見せることで人間が不要な介入をせず放置できると判断できる。責務契約②(human-gate のみ停止)に対応。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — stall→retry の補助文言「無音 90秒 — 自動作り直し (2/3)」で retry カウンタを補助表示
- **理由**: 無音タイムアウトの理由と残 retry 数を事業語で伝える。内部の pid / session_id は出さない(責務契約①)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この画面固有の 棄却した案

### R-01 — 状態バッジの補助に内部識別子を表示する
- **棄却理由**: 責務契約①(サーバ内部情報は秘匿)。人間には事業語(サイクル名 / ステップ名 / 経過時間)だけ見せる。

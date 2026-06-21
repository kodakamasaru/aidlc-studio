# SCR-02: Inbox「要対応」例外カード — コンポーネント仕様

## メタ
- 親: UIデザインの一覧(このサイクルの S3)
- 視覚 source: scr-02-inbox-retry-exhausted.html
- スクショ:
  - default: screenshots/scr-02-inbox-retry-exhausted.default.png
- 対応 S2 SCR: SCR-02(このサイクルの S2 成果物)
- 対応 US: US-04(retry 上限到達 → inbox + 後続継続)
- ステータス: 確定

## native 固有挙動
- safe area: web/desktop — N/A
- status bar: web/desktop — N/A
- keyboard avoidance: web/desktop — N/A
- iOS swipe back / Android back: web/desktop — N/A
- pull-to-refresh: web/desktop — N/A

## a11y
- VoiceOver / TalkBack ラベル: 要対応カードは `role="alert"` を付与し、スクリーンリーダーが優先的に読み上げるようにする。カード全体に `aria-label="要対応 自動復旧できず: [サイクル] / [ステップ名], N 回作り直したが完了条件を満たせなかった, 他のタスクは停止していない"` を付与。routine Q / レビューカードとは `aria-label` の種別部分で明示的に区別する。
- focus order: ページ上部から順に routine カード → 区切り帯 → 要対応カード(「手動で再実行」→「戻って直す」→「保留」→「詳細を見る」の順) → 残りのカード。論理順序と DOM 順序を一致させる。
- 色コントラスト基準(WCAG AA): 要対応カードは赤 `#ef4444` を使うが、三重エンコードで色のみに依存しない。カード種別ラベル「要対応(自動復旧できず)」テキスト + ⚠ アイコン + 赤系ボーダー(左 3px アクセントライン + 全周 border)の 3 つで識別できる。`#ef4444` vs `#09090b` 背景 → 約 4.8:1(AA 合格)。routine カードとの区別は border-left 3px アクセントラインでも補強。
- 三重エンコードの根拠: 赤色 + ⚠ アイコン + 「要対応(自動復旧できず)」テキストラベルで区別。routine の Q(indigo / ?) / レビュー(violet / ◎) / 実機確認(blue / 実機テキスト)とは色・アイコン・ラベルすべてが異なり、色覚特性があっても判別可能。

## gesture
- tap: routine カード行 → 会話スレッドへ遷移。要対応カードの「詳細を見る」→ 会話スレッドへ遷移
- long press: N/A(web/desktop)
- swipe: N/A(web/desktop)
- pan / drag: N/A(web/desktop)

## motion
- 要対応カードの出現(新規 inbox 落ち時): 250ms cubic-bezier(0.16, 1, 0.3, 1) で `opacity: 0 → 1` + `transform: translateY(-6px) → translateY(0)` の fade-slide-in。区切り帯も同タイミングで fade-in する。
- 「手動で再実行」ボタンを押した後のカード消去: 150ms ease-out で `opacity: 1 → 0`、残リストの再配置は 200ms ease-out で `transform: translateY` によるスムーズな詰め。
- hover 時: 要対応カードは `border-color` を `--color-attention-border` から `--color-attention` に 150ms ease-out で変化させる(routine カードより強調)。

## この画面固有の 質疑応答ログ

### Q-01 — 要対応カードの Inbox 内での位置(先頭固定か時系列か)
- **回答**(人間の回答を AI が記入):
  > (S2 の確定事項に対する追加 Q なし)
- **確定**(AI 記入):
  > 要対応カードは時系列順には置かず、専用の「要対応」区切り帯で Inbox 内に固定ゾーン化する(技術判断 D-01)。

---

## この画面固有の AI が独自に決めたこと と 理由

### D-01 — 「要対応」区切り帯で Inbox 内に固定ゾーンを設ける
- **理由**: S2 D-01「別画面に隔離すると見落とす → Inbox 内に置く」方針を踏襲。先頭固定では routine Q/レビューカードの視覚安定性が壊れる。区切り帯でゾーニングするのが可視性と安定性のバランスとして最良。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — 「他のタスクは止まらず進行中」を card-sub テキストとして必ず表示
- **理由**: S2 D-02 / US-04 AC「非ブロッキングの明示」。要対応が出た時に人間が全停止と誤解しないよう、カード内で明示する。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — 要対応カードの border-left を 3px 赤アクセントラインにして routine カードと段差を付ける
- **理由**: routine の `.card` が `border: 1px solid --color-line` のみを持つのに対して、要対応は `border-left: 3px solid --color-attention` を追加。スキャン時に左端の幅の違いで素早く識別できる。色のみに依存しない視覚差分。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-04 — アクションは「手動で再実行 / 戻って直す / 保留」(+ 詳細を見る)。旧「スキップ」を廃止
- **理由**: S3 視覚レビューでユーザーが「スキップを押したらどうなるか」を指摘(2026-06-21)。旧「スキップして後続を優先」は ① 後続継続が設計§6 で**自動**なのでボタン化は二重操作 ② 必須 step を「飛ばして done 扱い」は `done=納品`(責務契約③)に反する、ため semantics が破綻していた。正しい解決経路は 3 つ:**手動で再実行**(人間が手を貸して再試行)/ **戻って直す**(真因が上流なら手戻り = AI-DLC 正常系)/ **保留**(カードを未対応から外すのみ。step は failed のまま・依存は parking・スケジューラは自動で他タスク継続)。詳細を見るは解決でなく会話スレッドへの navigation なので ghost の補助リンク。S2 SCR-02 も同内容に更新(S3→S2 の軽微な情報構造修正)。
- **種別**: 事業判断(ユーザー確定)
- **上書き**: 旧「スキップ」を廃止し「戻って直す / 保留」に置換。

---

## この画面固有の 棄却した案

### R-01 — 要対応カードをページ最上部に固定する
- **棄却理由**: routine な Q/レビューカードの視覚安定性が失われ、Inbox が「例外通知板」に変わってしまう。区切り帯ゾーニングで同一 Inbox 内に置きつつ優先度を伝えるのが正しい設計。

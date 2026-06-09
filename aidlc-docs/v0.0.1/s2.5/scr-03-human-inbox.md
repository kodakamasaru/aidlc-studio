# SCR-03: Human Inbox — コンポーネント仕様

## メタ
- 親: [s2.5/index.md](./index.md)
- 視覚 source: [scr-03-human-inbox.html](./scr-03-human-inbox.html)(人間レビュー用 / S6/S7 は Read 禁止)
- スクショ:
  - [list](./screenshots/scr-03-human-inbox.list.png)
  - [empty](./screenshots/scr-03-human-inbox.empty.png)
- 対応 S2 SCR: [SCR-03](../s2/scr-03-human-inbox.md)
- 対応 US: [US-12](../s1/us-12-answer-question.md) / [US-13](../s1/us-13-visual-review-step.md)
- ステータス: 確定

## 状態網羅
- **list**: Q 待ち / レビュー待ちカードが混在で時系列に並ぶ。各行 = 種別バッジ(色 + アイコン)+ タイトル + meta(Cycle / ステップ / 相対時刻 / 補足)+ 種別に応じた主アクション(回答する / レビュー)+ chevron。sidebar Inbox に未処理件数。
- **empty**: 待ち 0 件。glyph + 「いま捌くものはありません」+ Cycles への導線。

## 挙動(web / レスポンシブ)
- **ハブ性**: 製品の中心。種別で遷移先が分岐 — Q 待ち → SCR-05、レビュー待ち → SCR-04。
- **種別の一目識別**(index D-03): Q 待ち = indigo-400 + `?`、レビュー待ち = purple-400 + `◎`。色 + アイコンの二重符号。
- **捌いたら消える**: 回答 / 承認後は当該カードが list から消え、Inbox 件数が減る(or 既処理表示は v0.0.x)。
- 並びは生成日時順(一定順序)。

## a11y
- 種別は色に依存せずアイコン + バッジ語(「Q 待ち」「レビュー待ち」)で判別可能。
- list は `role="list"`、各カード `role="listitem"` + 主アクションは独立ボタン。
- 件数バッジは `aria-label="未処理 3 件"`。
- empty は装飾 glyph を `aria-hidden`、見出しで状態を伝える。

## interaction(web pointer / keyboard)
- カード行クリックでも開ける(主アクションボタンは明示導線)。Enter/Space 対応。
- リアルタイム到着: 新規カードが上(or 時系列位置)に差し込まれ、件数が更新。

## motion(文字で)
- 新規カード到着: 上から 200ms cubic-bezier(0.16,1,0.3,1) で slide+fade-in。
- 処理済カード退出: 150ms fade-out + height collapse、後続が詰める。
- 件数バッジ更新: 数字が 120ms で差し替え(過度なバウンスはしない)。

## 設計連携メモ(S3/S5 へ)
- カードの到着・消滅をリアルタイム反映するため push 経路(SSE/WebSocket)が必要。HumanTask の kind(question/review)が視覚バッジと 1:1。S5 で HumanTask 集約の kind/state を確定すること。

## この画面固有の 質疑応答ログ
### Q-01 — Inbox と レビュー詳細(SCR-04)の分離は維持でよいか
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  > S2 Q-01 で「分離のまま」確定済。S2.5 もハブ(一覧)→ 詳細 の 2 画面で踏襲。

---

## この画面固有の AI が独自に決めたこと と 理由
### D-01 — 種別ごとに主アクション語を変える(回答する / レビュー)
- **理由**: 同じ「開く」でも人間がやる行為が違う(回答 vs 判断)。ボタン語で次の動作を予告し、捌く速度を上げる。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

---

## この画面固有の 棄却した案
### R-01 — Q とレビューをタブで分ける
- **棄却理由**: MVP は件数が少なく、混在の時系列 1 リストの方が「次に何を捌くか」が一望できる。タブ分割は件数増時(v0.0.x)に再検討。

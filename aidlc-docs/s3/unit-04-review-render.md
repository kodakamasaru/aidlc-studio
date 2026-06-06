# Unit-04: Review Rendering(block-stream)

## メタ
- 親: [s3/index.md](./index.md)
- 所属 US: [US-18](../s1/us-18-rich-review.md)(+ [US-13](../s1/us-13-visual-review-step.md) のレンダラを提供)
- ステータス: 確定
- MVP: ○(US-13 が使う最小レンダラのみ)

## 責務 (1〜2 行)
**製品の心臓**。`ReviewBlock[]` を上から順に描画する**汎用 block-stream レンダラ**。step × task-kind の出力差を画面分岐でなくデータ(ブロック型)で吸収する。承認 / 差し戻し(戻り先ステップ選択 + 理由)の UI を持つが、判断の記録は Unit-03 に委ねる純粋表示部品。

## 外部依存
- **無し(純粋データ駆動)**。`ReviewBlock[]` を渡されて描画し、ユーザー操作を `onApprove` / `onReject(toStep, reason)` のコールバックで上位(Unit-03)に返すだけ。
- **共有 types 層**: `ReviewBlock` 型の正本を共有 types に置き、Unit-02(emit)/ Unit-03(受け渡し)/ Unit-04(描画)が import(Q-01 確定)。
- design 参照: [design/review-output.md](../design/review-output.md)(block-stream 仕様)。
- 視覚意図参照: [s2.5/scr-04-review-detail.md](../s2.5/scr-04-review-detail.md) + screenshots(コンポーネント仕様)。

## I/F 定義 (この Unit が公開する契約)

### ReviewBlock 型(判別可能ユニオン / 共有 types 層に正本)
```
ReviewBlock =
  | { type: 'summary',    title, body }            // 変更説明
  | { type: 'ac-map',     items: {ac, status}[] }  // AC ↔ 実装 対応
  | { type: 'mermaid',    src }                    // フロー/構造図
  | { type: 'screenshot', src, caption }           // verify-ui 出力
  | { type: 'test',       passed, total, detail? }
  | { type: 'coverage',   pct, byFile? }
  | { type: 'risk',       level: low|med|high, note }
  | { type: 'diff',       summary, files: {path, add, del}[] }
  | { type: 'video',      src, poster }            // 動画 dossier(v0.0.x)
```
> MVP は `summary` / `ac-map` / `mermaid` / `screenshot` の軽量ブロックのみ描画。重い `video` 等は v0.0.x で実装。未知 type は安全にスキップ(前方互換)。

### コンポーネント I/F
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| renderReview | { blocks: ReviewBlock[], onApprove, onReject } | UI | UnknownBlockType(=skip + warn) |
| (callback) onApprove | () | → 上位(Unit-03)が answerTask(approve) | — |
| (callback) onReject | { toStep, reason } | → 上位が answerTask(reject, backtrackTo) | EmptyReason |

## この Unit 固有の 質疑応答ログ

### Q-01 — ReviewBlock 型の所有はこの Unit でよいか?(共有型の置き場)
- ReviewBlock は Unit-02(emit)・Unit-03(受け渡し)・Unit-04(描画)が触る横断型。型定義の正本を Unit-04(描画責務)に置き他が import する案。それとも共有 types に出すか。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > **共有 types 層に正本**を置く(Unit-02/03/04 が import)で確定。描画 Unit 専有にせず、emit する Unit-02 と受け渡す Unit-03 も同じ型を参照できるようにする。型の進化は共有層で一元管理。

### Q-02 — 未知ブロック type の扱いは「skip」でよいか?
- 前方互換のため、レンダラが知らない type は警告ログのみで描画スキップ。v0.0.x で型追加しても旧レンダラが壊れない。落とす vs エラー表示、どちらが望ましいか。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > **skip + warn**(前方互換)で確定。未知 type は警告ログのみで描画スキップし、旧レンダラを壊さない。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — レンダラを副作用なしの純粋表示部品にする(判断記録を持たない)
- **理由**: 承認/差し戻しの**記録**は Decision(Unit-03)の責務。Unit-04 は描画とコールバック発火に専念すると、ビジュアルリグレッション(web/testing 準拠)と単体テストが容易で、Inbox と並行開発できる。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-02 — ReviewBlock を判別可能ユニオン + 未知 type skip(前方互換)
- **理由**: S2 D-02「出力差を画面でなくデータで吸収」。type を増やすだけで新しいレビュー表現を追加でき、旧レンダラを壊さない。MVP は軽量4種、動画 dossier は型だけ予約。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — step ごとに専用レビュー画面を作る(S1用/S6用…)
- **棄却理由**: 画面が step×kind で爆発する。block-stream(データ駆動)1 枚で全 step を描く design 確定方針に反する。

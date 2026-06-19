# US-05: live verify-ui の実 screenshot を review block に出す

## メタ
- 親: [s1/index.md](./index.md)
- 対応 S2 画面 (確定後に追記): 既存 review 画面(ReviewDetail / ReviewBlocks の screenshot・video 枠)
- ステータス: 確定
- scope: ②-f

## 3 視点

### なぜするか (Why)
S9 観察 O-01: scripted では verify-ui の screenshot が実ファイルを持たず placeholder 描画になっている。**実 AI が成果物を出したとき、その動作の視覚証拠(実画像)が review block に出ない限り、人間はコードを見ずに承認できない(原則③・①視覚確認)。** live が本物の screenshot を撮り、それを証拠として描画する。

### UX へのインパクト
ユーザーは Inbox の review で、実 AI 実行が生んだ実際のスクリーンショットを見て approve / reject できる。「動いている証拠」が placeholder ではなく本物の画像になる。

### 受け入れ条件 (AC)
- live run の verify-ui が実 screenshot を生成し、その path が review block(screenshot / video 枠)に載って web で実画像が描画される(placeholder からの脱却)。
- screenshot は **artifact 模範(path 索引のみ)** に従って参照される(画像バイナリを DB に複製しない / US-01 境界ルール準拠)。保存先は `aidlc-docs/{v}/…/screenshots/` 規約(S9 の shotS9 命名規約を踏襲)。
- screenshot 取得失敗時は placeholder + 失敗理由を出す(silent に空表示しない / 原則④)。
- **テスト**: review block に実画像 path が載り web が描画する E2E と、live screenshot 生成の統合テストが pass。`bun test:live` 実画像経路は加算層([[real-ai-tests-additive]])、決定的スイートは fixture 画像で常時検証。
- v0.0.2 ledger 観察 O-01 が解消(scripted placeholder の説明をマップ/scope に残す)。既存 235 + E2E 6 pass。

## この US 固有の 質疑応答ログ

### Q-01 — screenshot の撮影主体(live evaluator が verify-ui 内で撮る / orchestrator が別途撮る)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定方針: verify-ui は評価ステップの一部なので evaluator 経路で撮影し、artifact として path 搬送。orchestrator は path を review block に配線するだけ。)

---

## この US 固有の AI が独自に決めたこと と 理由

### D-01 — 画像は path 参照(artifact 模範)。バイナリを DB/イベントに載せない
- **理由**: US-01 の境界ルール(DB は内容を複製しない)を画像にも適用。review block は path を持ち web が読む。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — 既存 screenshot/video 枠(v0.0.2 K リッチ描画)を流用し新描画コンポーネントを作らない
- **理由**: v0.0.2 で video/screenshot 枠は描画実装済(録画実体のみ未)。枠は再利用し、実画像を流し込むだけにする(DRY)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## この US 固有の 棄却した案

### R-01 — 本サイクルで動画(video block 実体)録画まで実装
- **棄却理由**: v0.0.2 scope で video 録画実体は v0.0.3+ だが、本サイクルの ② 実証は静止画 screenshot で足りる。動画は別途(粒度を膨らませない)。

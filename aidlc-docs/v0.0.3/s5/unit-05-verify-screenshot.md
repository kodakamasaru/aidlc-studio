# Unit-05: verify-ui screenshot 撮影 & 描画配線

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-05](../s1/us-05-live-verify-screenshot.md)
- Phase: 3(並行可)
- ステータス: 確定

## 責務 (1〜2 行)
live evaluator 経路で verify-ui の実 screenshot を生成し、**artifact(path 索引)** として搬送して既存 review block(screenshot 枠)で実画像描画。撮影機構は net-new(`Bun.spawn` で Playwright CLI 起動 / 新規 import 依存なし)。

## 外部依存
- **Unit-03**(整合テストのみのハードゲート): live が本物に動いて初めて撮る対象が出る。**ただし `Bun.spawn` 撮影・path 搬送・`ReviewBlocks` 描画・失敗 placeholder は U03 と並行に作れる**(S5 評価 AI / live 整合テストだけが U03 完了待ち)。
- 既存 `web` review block(`ReviewBlocks.tsx` の `ScreenshotFigure`)— **再利用**(path 描画)。
- Playwright CLI(既存 devDependency / subprocess 起動)。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| verify-ui 撮影 | 撮影対象 URL(dev server / env 経由) | 画像ファイル path(`aidlc-docs/{v}/…/screenshots/`) | 撮影失敗は path 無し + 失敗理由 |
| review への搬送 | 画像 path | review block screenshot 枠が実画像描画 | path 無し時は placeholder + 理由(S3 failed 契約) |

## 不変条件
- 画像バイナリは DB / イベントに載せない(path 参照のみ / 境界ルール)。
- 撮影失敗は空表示にせず placeholder + 理由(S3 `scr-01-review-evidence.failed.png`)。
- 既存 screenshot/video 枠を流用(新描画コンポーネント不要)。

## この Unit 固有の 質疑応答ログ
### Q-01 — 撮影主体(evaluator 経路で撮る / orchestrator が別途撮る)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定: evaluator 経路で撮影し artifact path 搬送、orchestrator は path を review に配線。US-05 Q-01。)

---

## この Unit 固有の AI が独自に決めたこと と 理由
### D-01 — 撮影は `Bun.spawn` で Playwright CLI(programmatic import を避ける)
- **理由**: `import { chromium }` は新規 import 依存。CLI subprocess なら既存 devDependency を新規依存なしで使える(S4 R-02)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## この Unit 固有の 棄却した案
### R-01 — 本 Unit で動画録画(video block 実体)まで実装
- **棄却理由**: 本サイクルの ② 実証は静止画で足りる。動画は別途(粒度を膨らませない)。

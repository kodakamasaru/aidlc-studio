# Unit-04: live completeness emit

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-04](../s1/us-04-live-completeness-emit.md)(carry `S8-live-completeness`)
- Phase: 3(並行可)
- ステータス: 確定

## 責務 (1〜2 行)
live evaluator の stream-json 出力から `addressed`(対応済み要件)をパースし、既存 `ResultEmitted.completeness?` に載せて app へ搬送。**scripted と同一の app ゲート**で completeness 判定(gap→descope)を効かせる。

## 外部依存
- **Unit-03**(整合テストのみのハードゲート): live が completeness を出せるのは composer の eval payload が「addressed を出せ」と指示している前提。**ただしパーサ・fallback・単体テストは fixture で U03 と並行に作れる**(S5 評価 AI / 実 AI 整合テストだけが U03 完了待ち)。
- 既存 app ゲート `engine-service.onEvaluatorResult`(`evaluateCompleteness→decideDisposition`)— **再利用**(新設しない)。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| live stream-json → completeness 変換 | live evaluator の stream-json | `ResultEmitted{ completeness? }`(既存加法型 events.ts:49) | パース不能/欠落は `completeness` 無しで emit |
| (再利用) app ゲート | `ResultEmitted{completeness}` | gap→descope Question / 全充足→review | (既存挙動) |

## 不変条件
- 新イベント・新ゲートを作らない(infra は「stream-json→既存ドメイン型」変換のみ / S4 D-01)。
- completeness 無/壊れは visual_review fallback(現行)。ただし「emit 期待が外れた」事実は観測可能に(silent failure 禁止 / 原則④)。

## この Unit 固有の 質疑応答ログ
### Q-01 — completeness 出力フォーマット要求の置き場(eval payload 契約 = Unit-03 / スキル本文)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定: フォーマット強制は Unit-03 の eval payload 契約。スキル本文は方法論。US-04 Q-01。)

---

## この Unit 固有の AI が独自に決めたこと と 理由
### D-01 — 既存 `ResultEmitted.completeness?` + 既存 app ゲートに載せる
- **理由**: scripted/live を 2 経路にすると片方だけ直す事故を招く。1 本化で drift を防ぐ(S4 D-01 / 評価 AI も sound 確認)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## この Unit 固有の 棄却した案
### R-01 — infra に閉じた専用 completeness サービス新設
- **棄却理由**: app ゲートと二経路化。infra は変換に留め判定は app 既存経路へ。

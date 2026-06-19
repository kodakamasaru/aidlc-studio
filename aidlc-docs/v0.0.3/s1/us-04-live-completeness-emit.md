# US-04: live evaluator が completeness を emit する

## メタ
- 親: [s1/index.md](./index.md)
- 対応 S2 画面 (確定後に追記): —(描画は既存 CompletenessTable を流用)
- ステータス: 確定
- scope: ②-e / 前サイクル carry `S8-live-completeness`

## 3 視点

### なぜするか (Why)
現状 completeness(requirements↔addressed の照合ブロック)を出すのは scripted アダプタのみで、live は completeness なし → `visual_review` fallback に落ちる。つまり **実 AI では completeness gate(漏れ検出 → descope Question)が効いていない**。品質ハーネスの中核(AI が勝手に漏らさない)が live で動いて初めて self-host に進める。v0.0.2 ledger の carried(into: v0.0.3)を消化する唯一項目。

### UX へのインパクト
実 AI を起動したとき、要件に対する gap が機械的に検出され、漏れがあれば descope Question が Inbox に届く。ユーザーはコードを見ずに「何が要件で、何が満たされ、何が落ちたか」を completeness table で確認できる(原則③)。

### 受け入れ条件 (AC)
- live evaluator の出力(stream-json)を**パース**して `completeness`(addressed 集合)を `ResultEmitted.completeness?` に載せて app へ搬送する([[harness-quality-vision]] / S7 で加法追加済の型を使用)。
- live completeness が来たとき、app の `evaluateCompleteness→decideDisposition`(v0.0.2 S8-D04)が **scripted と同じ経路**で gate を効かせる(gap→descope Question 発火)。
- completeness が**無い/壊れた**場合は visual_review fallback に落ちる(現行挙動)。ただし「本来 emit すべきが来ない」ケースは silent にせずログ/観測可能にする(silent failure 禁止)。
- **テスト**: live 出力サンプル(stream-json fixture)から completeness がパースされ gate が効く統合テストが pass。`bun test:live` の実 AI 経路は加算層([[real-ai-tests-additive]])として別途、決定的スイートは fixture で常時検証。
- v0.0.2 ledger の `S8-live-completeness` を `done` に更新(closed_in に実装先を記載)。既存 235 + E2E 6 pass。

## この US 固有の 質疑応答ログ

### Q-01 — live evaluator に completeness を出させる契約(出力フォーマット)はスキル本文側に書くか、prompt 合成(US-03)側で要求するか
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定方針: 出力フォーマット要求は US-03 の eval payload 契約に置く。スキル本文は方法論、フォーマット強制は実行層の責務。)

---

## この US 固有の AI が独自に決めたこと と 理由

### D-01 — completeness の搬送は既存 `ResultEmitted.completeness?`(S7 加法型)を使い新イベントを作らない
- **理由**: scripted/live で同一の app 経路(S8-D04)に載せれば gate ロジックが 1 本化し、live だけ別分岐になる drift を防ぐ。後方互換も維持。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — stream-json パース失敗は fallback だが「emit 期待が外れた」事実は観測する
- **理由**: 黙って visual_review に落ちると「live で gate が効かない」退行が隠れる(silent failure)。fallback はするが理由が後で見つかる状態にする(原則④)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## この US 固有の 棄却した案

### R-01 — live completeness 用に専用イベント/専用 gate を新設
- **棄却理由**: scripted と二経路になり、片方だけ直す事故(v0.0.2 で経験)を招く。既存経路に載せる。

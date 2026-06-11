# モデル: 見送りの意思決定(Descope Policy)

## メタ
- 親: [s6/index.md](./index.md)
- 対応 US: [US-03](../s1/us-03-completeness-gate.md)(descope 制御)
- 所属 Unit: [Unit-05](../s5/unit-05-completeness-descope.md)
- 既存集約: Question(申請)+ Task(backlog 化)へマッピング(新集約は立てない)
- ステータス: 確定

## モデル定義(DDD 採用 / 意思決定の純粋部 + 既存集約へのマッピング)

gap([brief-completeness](./brief-completeness.md) が算出)の後始末を決める**決定的な意思決定**。状況 → 帰結のマッピング:

| 状況 | 帰結 | 人間に出るか |
|------|------|-------------|
| gap あり / AI の見送り申請なし | generator を自動差し戻し(再 generate) | 出ない |
| AI が理由付きで見送り申請 | **descope 申請を Question 化**(理由必須) | 出る |
| gap ゼロ | Step done を許可 | — |

- **descope 申請 = Question**: 既存 Question 集約に乗せる(新集約を立てない / index R-01)。
- **見送り承認 = Task**: 「見送る」を人間が承認 → 既存 Task の accept ゲート(INV-5: 生成=AI / 判断=人間)を通って backlog Task 化。不可逆のため確認あり。
- **人間の選択肢**(Question の応答): つくる(差し戻し)/ 見送る(backlog 化)/ 後回し(backlog deferred)/ 前のステップからやり直す。
  - 「前のステップからやり直す」= 既存 `backtrack` の語彙に合流(AI が推奨ステップ + 理由を提示)。

## 不変条件
- **理由のない見送りは発生しない**(gap は理由なしなら自動差し戻し、人間に届くのは AI が理由を添えた申請だけ / 原則#6)。
- **全 gap が解消(または承認済み見送り)されるまで Step を done にしない**(hard gate / 原則#2)。
- 見送り承認 → backlog Task 化は **不可逆**。実行前に人間確認を挟む。
- 「処理」は決定的、「requirement が満たされたかの判断」は AI(evaluator)。両者を混ぜない(S4 D-04)。

## この集約固有の 質疑応答ログ

### Q-01 — descope 申請を新 Question kind `descope` にするか、既存 `decision`/`backtrack` で表すか(index Q-01 と同一論点 / ここで詳細)
- 提案: 新 kind `descope`(payload = `{ requirement, aiReason, recommendedStep? }`)を 1 つ足す。`decision` は statement のみで requirement+理由+推奨ステップを運べず、`backtrack` は戻り先専用。「前のステップからやり直す」選択時のみ既存 `backtrack` 経路へ合流。1 申請 = 1 カード([[q-emission-per-task-unit]])。
- **回答**(ユーザー記入):
  > OK(推奨どおり / 2026-06-11)。
- **確定**(AI 記入):
  > 新 kind `descope` で確定。payload = `{ requirement, aiReason, recommendedStep? }`。「やり直す」選択時のみ `backtrack` へ合流。配線(verdict 語彙・Task 化橋渡し)は D-01。

### Q-02 — 「後回し(backlog deferred)」は Task の新 state か、既存 `backlog` + フラグか
- 提案: 既存 `TaskState`(backlog/assigned/done)を増やさず、`backlog` + 優先度/種別で「後回し」を表す(deferred を別 state にすると state 機械が広がる)。実装時に確定。
- **回答**(ユーザー記入):
  > OK(推奨どおり / 2026-06-11)。
- **確定**(AI 記入):
  > 既存 `backlog` + 優先度/種別で表現。`TaskState` は増やさない。

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — descope は新集約を立てず Question(申請)+ Task(結果)の**境界に収める**(ただし「乗るだけ」ではない)
- **理由**: 申請は AI→人間の依頼=Question の役割、見送り結果は開発要求=Task の役割。新集約は境界の重複を生むため不要。ただし**既存集約にそのまま乗るわけではなく**、次の追加が要る(過小評価しない / S7 引き継ぎに明記):
  1. **Question に新 kind `descope`**(payload = `{ requirement, aiReason, recommendedStep? }`)+ 4 択 verdict 語彙(つくる/見送る/後回し/前のステップからやり直す)を `Verdict` と `ALLOWED_VERDICTS` に追加。
  2. **descope 承認 → backlog Task 化を仲介する新ドメイン命令**。現状 `applyAnswer`/`deriveCommand` が返す命令(resumeRun/approveTaskReview/backtrack/retryLaunch/cancelRun)に **Task 生成命令が無い**ため、`acceptProposal`(INV-5)へ橋渡しする経路を足す。
  3. 「前のステップからやり直す」選択時のみ既存 `backtrack` 命令へ合流。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

### D-02 — 見送り承認は既存 Task accept ゲート(INV-5)を再利用する
- **理由**: 「生成=AI / 判断=人間」のゲート(`acceptProposal` / INV-5)は Task に既に存在。descope 承認 → Task 化は **D-01 ②の橋渡し命令を介して**このゲートに繋ぐ(Answer から直接は到達経路が無いため新命令が要る)。原則#6(人間判断なしに descope しない)の証跡が backlog に残る。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

---

## この集約固有の 棄却した案

### R-01 — gap を必ず人間に投げる(理由の有無を問わず)
- **棄却理由**: US-03 D-03(S3 反映)。受信箱が溢れる。理由なし gap は AI が自分で作り直し、人間には理由付き見送りだけ届ける。

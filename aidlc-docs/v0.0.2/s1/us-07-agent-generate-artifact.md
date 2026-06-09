# US-07: ステップ専用 Agent が成果物を生成する (v0.0.2 拡張)

## メタ
- 親: [s1/index.md](./index.md)
- v0.0.1 成果物: [v0.0.1/s1/us-07](../../v0.0.1/s1/us-07-agent-generate-artifact.md)
- ステータス: 確定

## 3 観点

### なぜするか (Why)
v0.0.1 では generator が成果物を出して人間が直接レビューした。しかし自己レビューは弱く(§1)、AI が黙ってスコープを狭めるリスクがある(⑥)。別文脈の evaluator が検証することで、品質を機械的に保証する。

### UX へのインパクト
ユーザーが見るのは evaluator pass 済みの成果物のみ。未検証の生成果物には触れない。品質ゲートが自動で回り、人間は「本当にこれでいいか」の最終判断に集中できる。

### 受け入れ条件 (AC)
- [v0.0.1] 起動された Phase に対応するステップ専用 Agent が生成される
- Agent は対象ステップの kit/skills/aidlc-sN を load して成果物を生成する
- 生成された成果物は Artifact として対象 Cycle に紐づけて保存される
- 各 Agent は最小コンテキスト(必要な成果物のみ)で起動され、全量は引き継がない
- 生成完了後、次の人間アクション(Q 回答 or 視覚レビュー)に状態遷移する
- [v0.0.2] generator 完了後、別 Run の evaluator が成果物を検証する(gen→eval ループ)
- [v0.0.2] evaluator が completeness gap を検出した場合、StepDef.escalation.onGap に従って descope Question または gen 再起動する
- [v0.0.2] evaluator 前に deterministic gate(成果物存在検査)が走る
- [v0.0.2] 各 step は BriefIn を読み BriefOut を書く(構造化ハンドオフ)

## 質疑応答ログ
（なし）

## AI が独自に決めたこと と 理由
（なし）

## 棄却した案
（なし）

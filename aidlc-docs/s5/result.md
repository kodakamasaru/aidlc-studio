# 集約 / モデル: Result(レビュー成果 / block-stream)

## メタ
- 親: [s5/index.md](./index.md)
- 対応 US: [US-13](../s1/us-13-visual-review-step.md)(視覚レビュー), [US-18](../s1/us-18-rich-review.md)(リッチレビュー)
- 所属 Unit: [Unit-04](../s3/unit-04-review-render.md)
- ステータス: 確定
- MVP: ○(US-13 が使う軽量 4 種のみ)
- 設計参照: [design/review-output.md](../design/review-output.md), [s2.5/scr-04-review-detail.md](../s2.5/scr-04-review-detail.md)

> Q-02 でユーザー提案の `Result` を top-level に。**Result = Run が産むレビュー成果(dossier)**。中身は `ReviewBlock[]`(判別可能ユニオンの値オブジェクト = block-stream)。実体ファイルは外部記憶(aidlc-docs)に在り、Result はその「レビュー表現」を束ねる不変スナップショット。
>
> **レビューは Task に対して**(Q-02 / ユーザー指摘): 成果物の妥当性は「その Task の要求を満たすか」で判断するため、**Result は Task ごとに分解**し(`taskId`)、視覚レビューも Task 単位で出す。1 Run(Phase 実行は Cycle 単位)が Task 分の Result を 1..N 個産む。Task に割れないアーキ成果(S4/S5)は `taskId=null`(Cycle 単位)。

## モデル定義 (DDD 採用)

**集約ルート**: `Result`(Run 単位の成果スナップショット。生成後は不変)

```
Result (集約ルート / 不変スナップショット)
 ├─ runId: RunId              // どの Run が産んだか
 ├─ cycleId: CycleId          // 由来 Cycle(ID 参照)
 ├─ step: Step                // どの工程の成果か
 ├─ taskId: TaskId?           // ★この成果が対応する Task(妥当性を照らす要求)。null=Cycle 単位(S4/S5 等)
 ├─ blocks: ReviewBlock[]     // 内部 VO 族(上から描く 1 列)
 └─ producedAt: Instant

// 1 Run は Task ごとに分解した Result を 1..N 個産む(Task 分解できる工程)+ 必要なら Cycle 単位 Result(taskId=null)

ReviewBlock (値オブジェクト / 判別可能ユニオン)
  | { type: 'summary',    title, body }                    // 変更説明
  | { type: 'ac-map',     items: { ac, status }[] }        // AC ↔ 実装 対応
  | { type: 'mermaid',    src }                            // フロー/構造図
  | { type: 'screenshot', src, caption }                   // verify-ui 出力
  | { type: 'test',       passed, total, detail? }
  | { type: 'coverage',   pct, byFile? }
  | { type: 'risk',       level: low|med|high, note }
  | { type: 'diff',       summary, files: { path, add, del }[] }
  | { type: 'video',      src, poster }                    // 動画 dossier(v0.0.x)
```

> `ReviewBlock` の正本は共有 types 層に置き、Unit-02(emit)/ Unit-03(Question payload)/ Unit-04(描画)が import(S3 Unit-04 Q-01 確定)。

### MVP スコープ
- **MVP で描画**: `summary` / `ac-map` / `mermaid` / `screenshot`(軽量 4 種)。
- **v0.0.x**: `test` / `coverage` / `risk` / `diff` / `video`(型は予約済、レンダラ後追い)。

## 操作 / 描画 I/F

| 操作 | 入力 | 出力 / 効果 | エラー |
|------|------|------|--------|
| buildResult | { runId, cycleId, step, taskId?, blocks } | Result(`ResultEmitted` 受信で構築。Task 単位 or Cycle 単位) | — |
| renderResult | { result, onApprove, onReject } | UI(block-stream 描画) | UnknownBlockType(=skip + warn) |
| (callback) onApprove | () | → Question.answerQuestion(approve) → `approvePhase` | — |
| (callback) onReject | { toStep, reason } | → Question.answerQuestion(reject, backtrackTo) | EmptyReason |

## 不変条件 / 規則
- **INV-1(不変スナップショット)**: 生成後の Result は不変(その Run が産んだ成果の記録)。再実行(retry)は別 Run の別 Result を産む。
- **INV-2(前方互換)**: レンダラは**未知の `type` を安全にスキップ + warn**(エラーにしない)。型を増やしても旧レンダラが壊れない(S3 Unit-04 Q-02 確定)。
- **INV-3(純粋・副作用なし)**: ReviewBlock の描画は副作用なし。承認/差し戻しの**記録は持たない**(それは [facts.md](./facts.md))。レンダラは `onApprove` / `onReject(toStep, reason)` を上位(Question)に返すだけ。
- **INV-4(reason 必須)**: `onReject` は `toStep` と `reason` を伴う(空 reason 不可、Question INV-3 と整合)。
- **INV-5(データで吸収)**: step × kind の出力差は**画面分岐でなく block の種類**で表現(S2 D-02)。step ごとの専用画面を作らない。
- **INV-6(Task 妥当性)**: Task 分解できる工程の Result は **`taskId` で対応 Task に紐づける**(成果物の妥当性=その Task の要求充足で判断)。1 Run は Task 分の Result を産み、視覚レビューは Task 単位で出る。Task に割れないアーキ成果(S4/S5)のみ `taskId=null`(Cycle 単位)。

## この集約固有の 質疑応答ログ

### Q-01 — Result を「Run の成果スナップショット集約」、ReviewBlock を「その内部 VO」とする構造でよいか?
- 観点: フォローQで Result=レビュー dossier を選択。Result は runId/step を持つ不変スナップショットにし、ReviewBlock は中身の VO 族(共有 types 層に正本)とした。Question(visual_review)の payload は Result を参照で同梱。描画ロジック自体は S6/Unit-04。この構造でよいか。
- **回答**(ユーザー記入):
  > runId 付き不変スナップ
- **確定**(AI 記入):
  > **runId 付き不変スナップショットで確定**。Result は runId/cycleId/step を持ち生成後不変。ReviewBlock は identity を持たない純粋 VO で共有 types 層に正本(Unit-02 emit / Unit-03 payload / Unit-04 描画が import)。未知 type は skip+warn(前方互換)。Question(visual_review)payload は Result 参照で一意。

### Q-02 — レビューを Task に紐づける(Result を Task ごとに分解)でよいか?
- 観点: ユーザー指摘「Cycle 自体は Task ごとでなくていいが、レビューは Task に対してでないと成果物の妥当性として微妙」。Phase 実行は Cycle 単位のまま、**1 Run が産む成果を Task ごとの Result に分解**(`taskId`)し、視覚レビューを Task 単位で出す。アーキ成果(S4/S5)は taskId=null(Cycle 単位)。この形でよいか。
- **回答**(ユーザー記入):
  > Cycle自体はTaskごとじゃなくていいけど、レビューはタスクに対してじゃないと成果物の妥当性として微妙じゃない?
- **確定**(AI 記入):
  > **レビューは Task 単位で確定**。`Result.taskId` で対応 Task に紐づけ、1 Run は Task 分の Result を産む(視覚レビュー Question も Task 単位 = 1 枚ずつ)。妥当性は「その Task の要求を満たすか」で判断。Task に割れないアーキ成果(S4/S5)は taskId=null(Cycle 単位)。Phase は全 Task レビュー承認で done([cycle.md](./cycle.md) 反映)。

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — Result を runId 付き不変スナップショットにする(ReviewBlock は内部 VO)
- **理由**: 「どの Run の成果か」を Result が持つと、retry で別 attempt の成果が並んでも区別でき、Question(visual_review)の payload も Result 参照で一意になる。ReviewBlock は identity を持たない純粋 VO のまま共有層に置き、Result が束ねる。
- **判断**(ユーザー記入): 承認(Q-01 確定に同梱)
- **上書き内容**(上書き時のみ):

### D-02 — ReviewBlock を判別可能ユニオン + 未知 type skip(前方互換)(S3 Unit-04 D-02 踏襲)
- **理由**: S2 D-02「出力差を画面でなくデータで吸収」。`type` を足すだけで新レビュー表現を追加でき、旧レンダラを壊さない(未知 skip)。MVP は軽量 4 種、動画 dossier は型だけ予約。
- **判断**(ユーザー記入): 承認(Q-01 確定に同梱)
- **上書き内容**(上書き時のみ):

---

## この集約固有の 棄却した案

### R-01 — step ごとに専用レビュー画面/型を作る(S3 Unit-04 R-01 踏襲)
- **棄却理由**: 画面・型が step×kind で爆発する。block-stream(データ駆動)1 枚で全 step を描く design 確定方針に反する。

### R-02 — Result を持たず ReviewBlock を裸の VO のまま渡す
- **棄却理由**: 「どの Run の成果か」が型に乗らず、retry 時の成果区別や Question payload の参照が曖昧になる。Result で束ねる(D-01 / index R-03)。

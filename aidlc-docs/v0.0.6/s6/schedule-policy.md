# 集約: schedule-policy(eligibility / 並列上限 / parking)

## メタ
- 親: ドメインモデルの一覧
- 対応 US: [US-01](../s1/us-01-self-driving-scheduler.md)
- ステータス: 確定

## 集約ルート
**SchedulePolicy** — 「次にどの step を起動してよいか」を決める純粋な述語と規則。pending step 群・依存 DAG・現在の起動数・human-gate 情報を入力に、起動可能集合と parking 対象を出力する。状態は持たない(DB が真実 / 毎 tick 再導出)。

## 値オブジェクト / 述語
- **Eligible**(述語): step が `依存 DAG を満たす ∧ 現在の起動数 < N ∧ human-gate でない` を全て満たす。
- **ParkReason**(VO / enum): human-gate の種別(`要件 | 画面 | 視覚レビュー | 受け入れ | 改善`)。固定 4(+受け入れ/改善)以外で park しない。
- **IdempotencyKey**(VO): `cycle + step`。同一 step の二重起動を防ぐ。

## 規則(純粋関数)
1. **eligibleSet(pending, dag, runningCount, N)** → 起動可能な step 集合。
2. **isHumanGate(step)** → human-gate なら park(回答待ちで永続)。
3. **nextAfterDone(step)** → done 後に新たに eligible になる step を返す(自動次起動)。

## 不変条件
1. **並列上限を超えない**: 起動後の running 数が常に **N 以下**(eligibleSet は `runningCount < N` を必ず見る / 設計§12-5 / US-01)。
2. **二重起動しない**: 同じ IdempotencyKey(cycle+step)の Run が既に running なら起動しない(desired vs actual 再導出 / 設計§9)。
3. **human-gate でのみ park**: 技術 step は park しない(park は固定の human-gate のみ / 契約② / 技術失敗は failure-policy が処理)。
4. **依存先が done でないと eligible でない**: DAG の上流が未完了の step は起動しない(循環なし前提 = S5 で保証)。
5. **状態を持たない**: SchedulePolicy は毎回 DB(pending/running)を読み直す純粋関数(設計§2 / 再起動で消える in-memory キューを持たない)。

## この集約固有の 質疑応答ログ

### Q-01 — (未)
- **回答**(人間の回答を AI が記入):
  > 
- **確定**(AI 記入):
  > 

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — SchedulePolicy は状態を持たない純粋述語にする(キューを持たない)
- **理由**: 設計§2・§9。スケジューラが in-memory キューを持つと再起動で消え自己復帰が壊れる。毎 tick に DB(desired)と稼働台帳(actual)から eligibleSet を再導出する純粋関数にすれば、何度 tick しても二重起動せず冪等。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — park は固定の human-gate のみ。技術失敗は park でなく failure-policy へ
- **理由**: 契約②/設計§3。介在点は固定 4(+受け入れ/改善)。技術的失敗で park(=人間待ち)にすると介在点が増える。技術失敗は failure-policy(作り直し/backoff/inbox)が処理し、park は事業判断の human-gate に限定する。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この集約固有の 棄却した案

### R-01 — 起動可能 step を優先度ソートして 1 つずつ起動する
- **棄却理由**: 本サイクルは「N 以下で起動可能を埋める」だけで足りる(US-01)。優先度付けは過剰な前倒し。N の空きに eligible を入れる単純規則に留める(将来の最適化は別)。

# Unit-04: 自走スケジューラ

## メタ
- 親: 作業単位の一覧
- 所属 US: [US-01](../s1/us-01-self-driving-scheduler.md)
- ステータス: 確定

## 責務 (1〜2 行)
DB 駆動の自走の司令塔。pending から「依存 DAG・並列上限 N・human-gate でない」を満たす step を起動し、起動毎に desired vs actual を再導出して二重起動を防ぎ(冪等)、human-gate step は parking、完了後は次の eligible を自動起動する。Unit-01/02/03 を統べる Phase 3 の統合点。

## 外部依存
- Unit-01 の **launch**(step 起動)と **稼働台帳 query**(現在の起動数)。
- Unit-02 の **reconcileOnBoot**(起動毎に呼ぶ)。
- Unit-03 の失敗時ポリシー(retry/backoff/inbox の適用)。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| tick() | (周期 / イベント駆動) | desired vs actual を再導出 → 起動可能な step を launch | — |
| isEligible(step) | step | 依存 DAG 満たす & 並列数 < N & human-gate でない | — |
| onStepDone(step) | done した step | 次の eligible を自動起動 / human-gate なら parking | — |
| park(step) | human-gate step | run を「待ち」で永続(人間回答まで) | — |

## この Unit 固有の 質疑応答ログ

### Q-01 — (未)
- **回答**(人間の回答を AI が記入):
  > 
- **確定**(AI 記入):
  > 

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — 二重起動防止は冪等キー(cycle+step)+ desired vs actual 再導出で行う
- **理由**: 設計§9。スケジューラは状態を持たず、毎 tick で DB(desired)と稼働台帳(actual)を突合して差分だけ起動する。これで再起動・多重 tick でも二重起動しない。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — 並列は単一 worktree 内のプロセス並列(N 上限)。worktree 並行(N>1)は範囲外
- **理由**: US-01 D-01 / v0.0.7 分割。Unit-04 の N は claude 子プロセスの同時起動上限。worktree 複数は v0.0.7(AUTO-ORCH-monitoring-parallel 残り)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この Unit 固有の 棄却した案

### R-01 — スケジューラに in-memory のキュー状態を持たせる
- **棄却理由**: 設計§2。再起動で消える。DB(pending/run state)が唯一の真実で、スケジューラは毎 tick それを読み直す(使い捨て)。

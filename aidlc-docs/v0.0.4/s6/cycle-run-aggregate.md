# 集約: Cycle・Run(v0.0.4 ビュー)

## メタ
- 親: [s6/index.md](./index.md)
- 対応 US: [US-04](../s1/us-04-conversational-resume.md)(resume turn 継続)
- 所属 Unit: [Unit-04](../s5/unit-04-resume-turn.md)
- ステータス: 確定(2026-06-13 / 評価 AI レビュー)
- 正本コード: [src/domain/cycle/cycle.ts](../../../src/domain/cycle/cycle.ts)(**本サイクルで Run 実体の変更なし**)

## このビューの目的
US-04 の「答えると次 turn / 失敗なら stall→retry」が既存 `Cycle・Run` 集約の状態遷移で表現できることを確認し、**session-id をこの集約に持たせない境界**を明文化する。

## モデル定義(既存 / DDD 採用)
- **集約ルート**: `Cycle`(`store/SDK/HTTP を知らない` INV-9)。
- **エンティティ `Run`**: `{ id, attempt, state, startedAt, endedAt?, failureReason?, role? }`
  - `RunState` = `"running" | "stalled" | "done" | "failed"`
  - **session-id フィールドは無い(意図的)**。turn 継続は infra(claude session + studio store)で実現(index D-02)。
- **状態遷移関数(既存)**: `startPhase` / `launchEval` / `relaunchPhase` / `advanceRun` / `resumeRun`(stalled→running)/ `retryRun`(attempt+1)/ `backtrackTo`。

## 不変条件(既存 / 本サイクルが依存)
- INV-2: 1 Phase に running な Run は同時に最大 1 つ。
- `advanceRun`: `running` のみが `stalled|done|failed` に遷移可。`done` で Phase は `review` へ。
- `resumeRun`(ドメイン): `stalled` のみ `running` に戻せる(US-04 の **resume 失敗→stall→再開** の足場)。

> 用語注意: ドメインの `resumeRun`(Cycle の状態遷移 = stalled→running)と、`Unit02Command.resumeRun`(回答→継続命令)と、infra の `claude --resume`(turn 起動)は**別レイヤの 3 つ**。本サイクルでは混線させない(Unit-04 が翻訳)。

## 境界(本サイクルで滲ませない線)
- **session-id は infra store**(sqlite)に `runId` で紐づけ、`Run` 実体・`aidlc-docs` に載せない(S4 D-01 / `cycle.ts` INV-9)。`Run` 実体はゼロ変更。
- turn 継続は**新 Run を起こさない**(同 run を `--resume`)。ドメイン Run 状態は turn ごとに増えない。turn 失敗時のみ `stalled` として可視化し retry。

## この集約固有の 質疑応答ログ

### Q-01 — (なし)
- 既存遷移の reuse 確認のみ。新規 Biz/モデル判断なし。

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — turn 継続で `Run` に新状態(例: `awaiting-answer`)を増やさない
- **理由**: 「人間の回答待ち」は既存の **open な `Question` の存在**(`isAwaitingHuman`)で表現済。`Run` に待機状態を足すと Question 側と二重表現になり整合崩れの温床。Run は `running/stalled/done/failed` のまま、待機は Question 集約が担う(集約責務の分離)。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計 / 2026-06-13 評価 AI レビュー)。ユーザー上書き希望時は随時反映。

---

## この集約固有の 棄却した案

### R-01 — session-id を `Run` 実体に optional フィールドで追加
- **棄却理由**: `cycle.ts` INV-9(Cycle は store/SDK/HTTP を知らない)に反する。session-id は実行基盤の状態で、infra store に置けば足りる(index D-02 / S4 D-01)。ドメイン汚染を避ける。
</content>

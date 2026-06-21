# S6 — ドメインモデリング(全体)

## メタ
- 工程: S6 (Domain Model)
- PhaseGroup: Build
- 役割: ドメインモデラー
- ステータス: 確定
- 入力参照: このサイクルの要件一覧(US 群)/ 作業単位(S5 Unit + 依存マップ)
- 作成日: 2026-06-21
- 更新日: 2026-06-21

## 本サイクルの S6 の位置づけ

既存ドメイン(`RunState = running|stalled|done|failed` / `PhaseState = pending|running|review|done`)を**拡張**する。中核は **durable / self-healing なステートマシン**で、自走エンジン core の不変条件をコード化前に固める。Unit-05/06(gate CLI / UI)はドメインより手続き・presentation 寄りなので S6 では薄く扱う(主対象は Unit-01〜04)。

## DDD 採用判断

- **軽量 DDD(状態機械 + 不変条件中心)を採用**。集約 = 「一貫性境界を持つ状態機械」、値オブジェクト = カウンタ等の不変な値。重い DDD 儀式(リポジトリ抽象の網羅等)は持ち込まない。理由: 自走エンジンの本質は「状態遷移と不変条件」であり、PM がレビューしやすいのは状態遷移図 + 不変条件の箇条書き。既存 domain も state-machine 主体で整合する。

## 既存原則の継承(重要 / 旧 S6 D-01・D-02)

- **進行状態(gen→検証→eval)を `RunState` に入れない。** それは app 層のオーケストレーション状態が持つ(role と二重の真実を避ける)。
- v0.0.6 もこれを守る: **board の 5 バッジ(実行中 / backoff待ち / parking / stall→retry / resume復帰)は新 `RunState` enum 値ではなく、`RunState` + 失敗分類 + カウンタ + 復帰 provenance からの導出ビュー**。`RunState` は最小に保つ(下 D-01)。

## 集約 / モデル一覧
- [run-lifecycle(Run の durable 状態機械 + 復帰)](./run-lifecycle.md) — US-05 / US-06 / US-07 / US-08
- [failure-policy(失敗分類 → retry / backoff / inbox / silent 再生成)](./failure-policy.md) — US-02 / US-03 / US-04 / US-11
- [schedule-policy(eligibility / 並列上限 / parking)](./schedule-policy.md) — US-01

## ユビキタス言語(本サイクルで増える語 / 既存 vocab を拡張)

| 用語 | 意味 | 備考 |
|------|------|------|
| Run | 1 回の AI 起動。`RunState` を持つ | 既存 |
| RunState | `running / stalled / done / failed`(最小) | 既存。本サイクルで enum は増やさない(D-01) |
| 稼働台帳(LiveRunRegistry) | runId↔pid↔session_id↔startedAt↔last-activity の DB 事実 | 新規(US-08)。Run の read-model |
| last-activity | Run が最後に出力した時刻(逐次監視が更新) | 新規(US-07) |
| 孤児(orphan) | DB は running だが実 pid が居ない Run | 新規(US-05) |
| stall | last-activity が idle timeout を超えた / ハング | 既存語の厳密化(US-06) |
| 復帰(recovery) | 孤児/stall を resume or re-run で続きへ戻す | 新規(US-05) |
| resume / re-run | session_id で同一文脈継続 / 冪等な新試行 | 新規(US-05) |
| late-emit | 死んだ Run の遅延完了報告 | 新規(US-06) |
| 失敗分類 | failure を `backoff-retriable`(上限/レート)/ `incomplete`(成果物 NG)に分ける | 新規(US-03) |
| backoff | backoff-retriable を指数 backoff で自動再開(別カウンタ) | 新規(US-03) |
| 作り直し(rework) | 検証 NG を人間に出さず再生成(上限あり) | 新規(US-02) |
| 要対応(attention) | 作り直し上限到達 = inbox の例外通知 | 新規(US-04) |
| parking | human-gate で人間回答待ちの永続待機 | 既存概念の明示化(US-01) |
| eligible | 依存 DAG 満たす & 並列数 < N & human-gate でない | 新規(US-01) |
| silent 再生成 | 理由なし gap を黙って再生成 | 新規(US-11) |

## 全体 質疑応答ログ (スタック・DDD 判断・ユビキタス言語・モデル横断)

### Q-01 — RunState を増やすか(backoff/parking/resuming を enum に足すか)
- **回答**(人間の回答を AI が記入):
  > 設計まで確定で区切る(S6 承認 / 2026-06-21)。
- **確定**(AI 記入):
  > RunState は増やさず 5 バッジは導出ビュー(D-01)で確定。3 集約(run-lifecycle / failure-policy / schedule-policy)で S6 確定。S7 実装は次セッションで Phase 1 から。

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — `RunState` enum は増やさない。5 バッジは導出ビューにする
- **理由**: 旧 S6 D-02「二重の真実を避ける」。backoff/parking/resume を RunState に足すと、失敗分類・カウンタ・provenance と状態が二重化し整合が崩れる。`RunState`(running/stalled/done/failed)は最小に保ち、board の 5 バッジは `RunState` + 失敗分類 + retry/backoff カウンタ + 復帰 provenance + parking(human-gate)から**導出**する関数で表す。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — 稼働台帳(LiveRunRegistry)は Run の read-model であってドメイン集約の真実源ではない
- **理由**: pid/last-activity は OS 観測の事実(infra)。ドメインの Run state とは別レイヤー。reconcile(復帰)は「DB の Run state(真実)」と「稼働台帳(観測)」を突合する処理であって、台帳がドメイン不変条件を持つわけではない。台帳は infra に置き、domain は突合結果(孤児判定)だけ受け取る。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — 失敗時ポリシー(failure-policy)を Run 集約から分離した独立モデルにする
- **理由**: S5 Unit-03。「失敗時に何をするか」(分類 → 作り直し / backoff / inbox / silent)は Run の状態遷移とは別の判定木。Run 集約に埋めると肥大化し、検証 NG の作り直しと上限/レートの backoff が混ざる。独立モデルで判定木を 1 箇所に集約する。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案

### R-01 — backoff待ち / parking / resume復帰 を RunState の新しい状態値にする
- **棄却理由**: D-01。二重の真実。board 表示のために domain state を増やすのは presentation 都合での汚染。導出ビューで表現する。

## 次工程 (S7) への引き継ぎ
- 純粋ドメインコード化の対象: run-lifecycle(状態遷移 + 導出ビュー関数)/ failure-policy(分類 + 判定木)/ schedule-policy(eligibility 述語 + parking)。すべて SQLite / Agent SDK を知らない純粋関数として実装。
- infra に隔離するもの: 稼働台帳(pid/last-activity)/ Agent SDK / SQLite 永続。domain は突合結果・signal・カウンタだけ受け取る。
- 不変条件のテスト: 「N を超えない」「done は証拠で裏取り」「late-emit を冪等に無視」「resume 優先」を domain テストで実証(claude 非依存)。

## binding 逆引き確認(完了条件 5)
- US-01〜08 / US-11 の AC をドメイン不変条件として表現(各集約の「対応 US」+ 不変条件で逆引き)。矛盾なし。US-09/10/12/13 はドメインより手続き/presentation 寄りで S6 の主対象外(S7/S8 で扱う)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか: (手戻り時に追記)
- 暫定の解決方針:
- 棄却した案とその理由:

# Unit-08: Dashboard

## メタ
- 親: [s3/index.md](./index.md)
- 所属 US: [US-10](../s1/us-10-dashboard-minimal.md), [US-11](../s1/us-11-dashboard-full.md)
- ステータス: 確定
- MVP: —(v0.0.x / S1 Q-01 で MVP から外した)

## 責務 (1〜2 行)
**read-only 集約ビュー**。最小版は待ち2列(AI待ち / Human待ち)、フル版はプロダクトバックログ風4象限(Backlog / Active Cycles / AI待ち / Human待ち)。他 Unit の state を読み集約するだけで、状態を持たない・書き換えない終端 Unit。

## 外部依存(全て read-only)
- **Unit-01**(Cycle/Run): Active Cycles / Run state を集計。
- **Unit-03**(Inbox): Human 待ち(open な HumanTask)を集計。
- **Unit-06**(Backlog): Backlog の Task を集計。
- AI 待ち = Unit-01 の running/stalled Run から導出。

## I/F 定義 (この Unit が公開する契約)

### read モデル(導出 / 非永続)
```
DashboardView {
  aiWaiting:    { runId, cycleId, step, state: running|stalled }[],
  humanWaiting: { taskId, cycleId, kind }[],
  activeCycles: { cycleId, version, currentStep, progress }[],   // フル版
  backlog:      { taskId, title, priority }[]                    // フル版
}
```

### 操作
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| getMinimalBoard | { } | { aiWaiting, humanWaiting } | — |
| getFullBoard | { projectId } | DashboardView(4象限) | — |

### 更新方式(確定)
- 独自 state を持たず、Unit-01/03/06 から**都度導出**。リアルタイム更新は**イベント購読 or ポーリング**(集計キャッシュは持たない)。

## この Unit 固有の 質疑応答ログ

### Q-01 — Dashboard は純粋導出(read model)でよいか?
- 独自 state を持たず Unit-01/03/06 から都度集計する案。リアルタイム更新は購読 or ポーリング。集約専用で正しいか、それとも独自の集計キャッシュを持つべきか。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > **純粋導出(read model)で確定**。独自 state・集計キャッシュは持たず、Unit-01/03/06 から都度導出。更新は購読/ポーリング。性能問題が出たら将来キャッシュ追加を検討(可変点)。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — Dashboard を状態を持たない read-only 終端 Unit にする
- **理由**: 待ち状況は Unit-01/03/06 が真実。Dashboard が独自に状態を持つと二重管理・不整合。導出ビューに徹し、何にも依存されない終端にすることで他 Unit と疎結合・並行開発可能。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — Dashboard を操作の起点(ここから Cycle 起動等)にする
- **棄却理由**: 操作は各 Unit の画面(SCR-01/02/03)が持つ。Dashboard は俯瞰専用に絞り責務肥大を防ぐ(導線リンクは持つが操作ロジックは持たない)。

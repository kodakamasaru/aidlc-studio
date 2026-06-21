# Unit-01: 実行基盤 + 稼働台帳(monitoring substrate)

## メタ
- 親: 作業単位の一覧
- 所属 US: [US-07](../s1/us-07-agent-sdk-monitoring.md), [US-08](../s1/us-08-liverun-registry.md)
- ステータス: 確定

## 責務 (1〜2 行)
headless step を **Agent SDK `query()` の逐次ストリーム**で起動・観測し、走行中の進捗/状態(last-activity)を取得する。runId↔pid↔session_id↔startedAt↔last-activity を **SQLite に永続(稼働台帳)**して「今何が起動中か」を DB 事実として持つ。全 self-healing(Unit-02/03/04)の substrate。

## 外部依存
- Claude Agent SDK `query()`(`@anthropic-ai/claude-agent-sdk` 相当 / infra に隔離 / 正確な API は S7 実装時)。
- SQLite(稼働台帳・session の永続)。
- (移行前)既存 CLI `claude -p` spawn 経路 — 置換対象。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| launch(step, ctx) | step 種別・実行コンテキスト | runId(台帳登録済 / pid・session_id 記録) | spawn 不能 → 失敗 signal(Unit-03 が分類) |
| stream を購読 | runId | 逐次メッセージ(進捗/状態)。受信ごとに last-activity 更新 | stream 中断 → 失敗 signal |
| resume(runId) | runId(session_id を台帳から引く) | 同一文脈で継続した runId | session 不在 → 不能(Unit-02 が re-run へ) |
| 台帳 query | (なし) / runId | 起動中 run 一覧(runId/pid/last-activity)| — |
| 失敗 signal | runId | exit code / エラー種別(文章でなく信号) | — |

## この Unit 固有の 質疑応答ログ

### Q-01 — (未)
- **回答**(人間の回答を AI が記入):
  > 
- **確定**(AI 記入):
  > 

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — executor の「失敗 signal」を文章でなく構造化信号(exit/エラー種別)で出す
- **理由**: 設計§7-4「上限は exit/エラー信号から分類(文章解釈に頼らない)」。Unit-03 の失敗分類が claude の自然文に依存すると不確実。Unit-01 が信号として出す境界を引く。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — Agent SDK / SQLite は infra に閉じ、ドメインへ型を漏らさない
- **理由**: レイヤー依存内向き(S4)。ステートマシン(domain)は SDK も SQLite も知らない。Unit-01 の公開 I/F は抽象 port として表現し、infra が実装する。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この Unit 固有の 棄却した案

### R-01 — last-activity を in-memory のマップで持つ
- **棄却理由**: 設計§2。再起動で消える。稼働台帳は DB 永続でなければ Unit-02 の起動時 reconcile が突合できない。

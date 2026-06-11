# Unit-04: 対話型 Q→回答→Resume

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-08](../s1/us-08-qa-resume-loop.md)(S7-C1 / live 往復)
- Phase: Phase 4
- レイヤ: `infra/orchestrator/live.ts`(Q 検出 / resume)+ `app/`(stalled→HumanTask 生成)+ `web`(回答→送信は Unit 横断で既存 inbox/cycle 画面を利用)
- ステータス: 確定

## 責務 (1〜2 行)
headless live AI が方針を **Q で停止**し、人間が回答して **resume** する対話ループ。live adapter の stream-json パーサで Q を検出 → Run を `stalled` に → HumanTask(Q)を自動生成 → 回答送信で `--resume <session-id>` 再開(S4 §6 / US-08 D-01・D-02)。

## 外部依存
- **Unit-03**: Run ライフサイクル(`Run`/`RunState='stalled'`)・`OrchestratorPort.resume`・`DomainEventSink`。gen→eval 往復の上で動く。
- 既存: live adapter(`infra/orchestrator/live.ts`)・`domain/question/`(Question 集約)・`inbox-service` / `question-repo` / 既存 inbox・cycle 画面(回答 UI は S3 で「サイクル画面側」に確定)。

## I/F 定義 (この Unit が公開する契約)

| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| live: Q 検出 | stream-json stdout の Q マーカー | `RunEmission`(Question 発火 + Run→stalled) | パース失敗時は run failed |
| `resume(cmd)`(既存ポート利用) | `ResumeRun { runId, body? }` | `Promise<void>`(resume 後の出力を継続 emit) | session 喪失時は retry へ |
| HumanTask(Q)生成 | stalled Run + Question | お知らせ一覧(種類+サイクル/ステップ+件数)に計上 | — |

- 受信箱は **お知らせ一覧**(判断しない / 件数のみ)。回答・判断は **サイクル画面側**で 1 件ずつ。
- 回答入力: 「選択肢(推奨マーク付き)+ その他(自由入力)」のハイブリッド、**入力欄は 1 個**(その他選択時のみ展開)。

## 主な AC(US 由来)
- live が Q 出力を検知して Run を stalled に → HumanTask(Q)自動生成。
- 受信箱は一覧、回答はサイクル側、複数 Q は 1 件ずつ。
- 回答送信で session resume、resume 後の出力を継続 emit。
- resume→完了/再 Q→回答→resume が **2 周以上**回る。**実 AI 使用の E2E** が pass。既存テスト全 pass。

## この Unit 固有の 質疑応答ログ

### Q-01 — 実 AI テスト(live)の実行タイミングは Phase 4(Unit-03 確立後)でよいか
- 提案: Engine 往復(Unit-03)が scripted で固まってから live 実 AI E2E を載せる(scripted+live の 2 アダプタ分離。実 AI は決定論スイートの追加層 / メモリ方針)。
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  >

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — Q 検出は live adapter の stream-json パーサに実装し、scripted は固定 Q で代替
- **理由**: US-08 D-01。live は実 CLI の Q マーカーを検出。scripted は決定論で Q を固定注入し resume ループを CI で高速に回す(実 AI に依存しない)。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

### D-02 — resume は `--resume <session-id>` で再接続(新セッションを作り直さない)
- **理由**: US-08 D-02。Q で止まったセッション ID を保持し回答を入力に resume。コンテキストを保ったまま続行できる。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — Q→回答を WebSocket リアルタイム化
- **棄却理由**: US-08 R-01。v0.0.2 はポーリング。push(SSE/WS)は v0.0.3 defer。

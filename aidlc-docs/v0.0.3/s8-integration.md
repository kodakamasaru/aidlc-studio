# S8 — PJ 統合 進行ログ — v0.0.3

## メタ
- 工程: S8 (Integration)
- PhaseGroup: Build
- 役割: アプリケーションエンジニア(統合)
- バージョン: v0.0.3
- ステータス: 進行中
- 入力参照: [s7-domain-code.md](./s7-domain-code.md) / [s5/](./s5/index.md) / [s6/](./s6/index.md)
- コード出力先: `src/`(domain 配下は触らない)
- 作成日: 2026-06-12
- 更新日: 2026-06-12

> **進め方(2026-06-12 ユーザー確定)**: S5 DAG 順に **3 増分**でコミット — ①U01 死蔵削除 ②U02 snapshot/skillRef 配線 ③U03-05 live + 視覚ゲート。**live(U03-05)は S8 内で実 `claude` CLI 貫通まで**検証する(`bun test:live` 加算層 / [[real-ai-tests-additive]])。決定論スイートは scripted で常時 green を維持。

## I/F 契約整合チェック (S5 ↔ ドメイン公開関数)
| # | S5 I/F 定義 | ドメイン公開関数(S7) | 一致/差分 | 解消方針 |
|---|------------|----------------------|----------|---------|
| 1 | Unit-02 skillRef→実 dir 解決 | `skillRefOf(step): SkillRef \| undefined`(vocab) | 一致(S7 で新設) | app `defaultPipeline` が呼ぶ(U02) |
| 2 | Unit-02 作成時 snapshot | `createCycle(cmd.pipeline[].stepDef?)` 写し | 一致(S7) | app `cycle-service` が snapshot を解決し詰める(U02) |
| 3 | Unit-01 死蔵削除 | (削除のみ / ドメイン公開関数なし) | 一致 | U01 で全波及点除去(完了) |
| 4 | Unit-03 PromptComposer | (app 新設 / ドメイン非関与) | — | U03 で app 層に新設 |
| 5 | Unit-04 completeness | 既存 `CompletenessBlock`/`ResultEmitted.completeness?` | 一致(S7 で変更なし) | U04 で infra parse → 既存型へ |
| 6 | Unit-05 screenshot | 既存 `ArtifactRef`(kind screenshot) | 一致 | U05 で infra 撮影 → path 索引 |

## アダプタ実装一覧
| # | アダプタ種別 | コードパス | 呼び出すドメイン関数 | テストパス | 対応 US | 状態 |
|---|------------|----------|------------------|----------|--------|------|
| U01 | (削除) 死蔵 repo/table 除去 | external-memory / ids / repos / composition / sys / db / migrations / tests | — | 既存回帰 | US-01 | **確定** |
| U02 | DB/app 配線 snapshot + skillRef | cycle-service / project-service | `createCycle` / `skillRefOf` | (予定) | US-02 | 予定 |
| U03 | app PromptComposer + Fs.read + live | prompt-composer / sys ports / live.ts | (なし / app) | (予定) | US-03 | 予定 |
| U04 | infra live completeness parse | live.ts | (既存 events 型) | (予定) | US-04 | 予定 |
| U05 | infra verify-ui screenshot | live/screenshot | (既存 ArtifactRef) | (予定) | US-05 | 予定 |

## 増分①: U01 — 死蔵モデル削除(Ledger / Conversation)
- **対象**: [s6/external-memory-pruning.md](./s6/external-memory-pruning.md) 削除対象表の全波及点。
- **削除したファイル**: `src/infra/db/ledger-repo.ts` / `src/infra/db/conversation-repo.ts`(ファイルごと)。
- **編集して除去**: `domain/external-memory.ts`(Ledger*/Conversation* 型・関数・`present` ヘルパ・未使用 import / 集約コメント更新)/ `domain/shared/ids.ts`(`LedgerEntryId`)/ `external-memory.test.ts`(Ledger/reconcile 2 describe)/ `app/ports/repos.ts`(`LedgerRepo`/`ConversationRepo`)/ `composition.ts`(`Repos.ledger`/`conversations`)/ `sys.ts`(`IdGen.ledgerEntryId`)/ `infra/db/store.ts`(配線)/ `migrations.ts`(`ledger`/`conversations` テーブル + index + コメント)/ `infra/sys/id-gen.ts` + `fakes.ts`(`ledgerEntryId`)/ `tests/integration/builders.ts`(`buildLedgerEntry`/`buildConversation`)/ `store.test.ts`(2 describe)。`proposal-repo.ts` は stale コメントのみ調整。
- **残置(無傷)**: `WikiSection`(`"ledger"` メンバ = doc 分類 / 別概念)・`ArtifactRef`・`DocPath`・`WikiDoc`・`extractHumanBlocks`/`regenerateWikiBody`。
- **検証(独立に裏取り)**:
  - 残参照 `grep -rn "LedgerEntry|LedgerRepo|ConversationRepo|makeLedgerEntry|ledgerEntryId|buildLedgerEntry|buildConversation"` → **0 件**。広域 `grep "Ledger|Conversation"` も 0(WikiSection 小文字 `"ledger"` は無傷)。
  - 差分 = **7 insertions / 365 deletions の純粋削除**(振る舞い追加なし)。`migrations.ts` に dangling テーブルなし、`store.ts` 配線クリーン。
  - typecheck: `src` エラー 0。回帰: `bun test src tests/integration` → **234 pass / 0 fail**(削除前 240 → 6 test 削除 = 234)。SQLite store/migrations を `store.test.ts` が実走するため、削除の健全性は決定論ハーネス自体が担保。
  - **INV-P1 達成**: domain/app/infra/tests の `Ledger*`/`Conversation*`/`LedgerEntryId` 参照 0。**業務フロー参照は元から 0** のため機能無影響。

## 技術依存マップ
- (U03-05 で live(`claude` CLI subprocess)/ Playwright(`Bun.spawn`)/ Fs read を追記)

## mock 突合レビュー (S3 視覚契約 ↔ 実装画面)
> 完全性ゲート: `ls aidlc-docs/v0.0.3/s3/screenshots/ | grep -v tokens | wc -l` = **3 状態**。下表は 3 行ちょうどで、`乖離`/`未実装` を残さず処理する(U05 完了後に埋める)。

| S3 状態 (scr-NN.state.png) | 実アプリでの出し方 | 構成要素 | 情報粒度 | 日本語水準 | 判定 | 対応 |
|---|---|---|---|---|---|---|
| scr-01-review-evidence.default.png | (U05 後) | | | | 未記入 | |
| scr-01-review-evidence.failed.png | (U05 後) | | | | 未記入 | |
| scr-02-step-config-snapshot.default.png | (U02 後) | | | | 未記入 | |

## 質疑応答ログ

### Q-01 — (なし。内部判断は evaluator 裁定 + 決定論ハーネスで担保)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > 

---

## AI が独自に決めたこと と 理由

### D-01 — U01 は機械的削除を subagent に委譲し、結論(grep 0 / 234 green / 純粋削除 diff)を自分で独立裏取り
- **理由**: 削除対象は S6 で全波及点を表に確定済。機械作業は委譲し、正しさは決定論ハーネス(SQLite store 実走 234 test)+ grep 0 + deletions-only diff で検証する方が確実([[dogfood-harness-principles-on-this-repo]] / 人間にはコードでなく結論)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## 棄却した案
### R-01 — 死蔵を deprecated で残置(S6 R-01 と同じ)
- **棄却理由**: 境界の明快さ。正本は file 側。S6 で確定済。

## 次サイクルへの引き継ぎ
- (S8 確定時に記載)

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (なし)
</content>

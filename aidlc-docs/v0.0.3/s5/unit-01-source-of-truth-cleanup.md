# Unit-01: 外部記憶境界是正 & 死蔵削除

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-01](../s1/us-01-source-of-truth-boundary.md)
- Phase: 1(leaf / 独立)
- ステータス: 確定

## 責務 (1〜2 行)
正本境界ルール(file=truth / DB=index|state、DB は不変 truth を複製しない)を operating-model に 1 枚化し、死蔵テーブル `ledger` / `conversation` を**波及込みで一式削除**する。

## 外部依存
- なし(leaf)。他 Unit の I/F を呼ばない・呼ばれない。

## I/F 定義 (この Unit が公開する契約)
削除中心のため新規公開 I/F は無い。**契約 = 「消える I/F の一覧」と「残す正本ルール」**。

| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| (削除) `LedgerRepo` / `ConversationRepo` ポート | — | ポートと実装が存在しない状態 | 残参照があれば `tsc` 失敗(完了条件で検出) |
| (削除) `IdGen.ledgerEntryId()` | — | ポートから消える | 同上 |
| (追記) operating-model 正本マップ | データ種別 | `truth` / `DB 役割` の 1 枚表 | — |

## 削除波及(S4 §3.1 の一覧 = 完了条件)
- `infra/db/{ledger-repo,conversation-repo}.ts` / `migrations.ts`(2 DDL)/ `store.ts`(配線)
- `app/ports/repos.ts`(2 ポート)/ `app/ports/composition.ts`(wiring)
- `app/ports/sys.ts`(`IdGen.ledgerEntryId`)/ `infra/sys/fakes.ts`(実装)
- `domain/shared/ids.ts`(`LedgerEntryId`)/ `domain/external-memory/external-memory.ts`(`LedgerEntry`/`Conversation`/`makeLedgerEntry`)+ `*.test.ts`
- `tests/integration/store.test.ts`(round-trip)/ `tests/integration/builders.ts`(`buildLedgerEntry`)
- **触らない**: `WikiSection` の文字列 `"ledger"`(Wiki セクション名で無関係)。`wiki` 実装も本サイクル対象外。

## 完了条件
- 上記を全削除後 `bun test` + 既存 E2E スイートが pass(`tsc` green が前提)。
- operating-model に正本マップが 1 枚記載されている。

## この Unit 固有の 質疑応答ログ
### Q-01 — (なし)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > 

---

## この Unit 固有の AI が独自に決めたこと と 理由
### D-01 — 削除は型・ポート・テストまで一式(S4 D-03 を Unit に継承)
- **理由**: repo impl だけ消すと型/ポートが宙に浮き `tsc` が落ちる。境界を明快にするため一式。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## この Unit 固有の 棄却した案
### R-01 — wiki の index-only 是正も本 Unit に含める
- **棄却理由**: scope 除外(Wiki サイクル)。本 Unit は方針マップ記載まで。

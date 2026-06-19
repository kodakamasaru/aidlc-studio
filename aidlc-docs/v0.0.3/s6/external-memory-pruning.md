# モデル: 外部記憶からの死蔵モデル削除(Ledger / Conversation)

## メタ
- 親: [s6/index.md](./index.md)
- 対応 US: [US-01](../s1/us-01-source-of-truth-boundary.md)
- 所属 Unit: [Unit-01](../s5/unit-01-source-of-truth-cleanup.md)
- ステータス: 確定
- 集約: **ExternalMemory**(既存)。本書は削除する部分と、それに伴い **退役する不変条件** を記録する(黙って消さない / 原則#6)。

## なぜモデル化するか
ドメインモデリングは通常「足す」が、削除も**境界の確定**としてモデル判断に含まれる。`Ledger`/`Conversation` は **業務フロー(`src/app/services` / `src/infra/orchestrator`)からの呼び出しが 0**(grep 確認済 / 2026-06-12)— repo 配線・DB テーブルは存在するが engine/service が一度も使わない**死蔵**。scope.md 境界ルールが **削除**と確定済(US-01 D-01)。**消える不変条件**を明示記録し、引き継ぎの正本がどこへ移るかを残すことで、黙った descope(原則#6)と「不変条件が消えた事実の喪失」を防ぐ。

> **「死蔵」の正確な意味(評価 AI 是正 / 2026-06-12)**: 「app 参照 0」は**誤り**だった。正しくは「**業務フロー(services/orchestrator)参照 0**」。repo インタフェース・SQLite 実装・store 配線・migration・id-gen・テストには**生きた参照が存在する**(下表)。削除はこれら**全配線層の除去を伴う**。S6 段階では削除を決定し、参照 0 の達成は **S7 実装の完了条件**(未来形 / INV-P1)。

## 削除対象(差分の起点 = 実在コード / 全波及点)
**domain**
- `src/domain/external-memory/external-memory.ts`: 型 `LedgerKind`(:81)/`LedgerState`(:82)/`LedgerEntry`(:84)/`LedgerError`(:94)/`MakeLedgerEntryCmd`(:96)、関数 `makeLedgerEntry`(:109)/`reconcileEntry`(:126)/`unreconciledCount`(:142)/`canStartNextCycleS1`(:146)、型 `ConversationTurn`(:150)/`Conversation`(:156)、import `LedgerEntryId`(:12)
- `src/domain/shared/ids.ts`: `LedgerEntryId` 型(:17)+ コンストラクタ(:28)
- `src/domain/external-memory/external-memory.test.ts`: Ledger/Conversation セクション

**app/ports(配線・要除去)**
- `src/app/ports/repos.ts`: `LedgerRepo`(:95)/`ConversationRepo`(:101) インタフェース + import(:18-19)
- `src/app/ports/composition.ts`: `Repos.ledger`(:33)/`Repos.conversations`(:34) + import(:19-20)
- `src/app/ports/sys.ts`: `IdGen.ledgerEntryId()`(:40) + import(:13)

**infra(実装・配線・要除去)**
- `src/infra/db/ledger-repo.ts`(`SqliteLedgerRepo` ファイル全体)
- `src/infra/db/conversation-repo.ts`(`SqliteConversationRepo` ファイル全体)
- `src/infra/db/store.ts`: import(:18-19)+ 配線(:37-38)
- `src/infra/db/migrations.ts`: `ledger` テーブル(:103)/`conversations` テーブル(:110)+ index(:108/:115)+ コメント(:19-21)
- `src/infra/sys/id-gen.ts`: `ledgerEntryId()`(:53-54)+ import(:14/:25)
- `src/infra/sys/fakes.ts`: `ledgerEntryId()`(:117-118)+ import(:17/:28)

**tests**
- `tests/integration/builders.ts`: `buildLedgerEntry`(:198)/`buildConversation` + import(:17/:35/:39-40)
- `tests/integration/store.test.ts`: `LedgerRepo`/`ConversationRepo` describe(:338-)+ import(:16/:34-35)

> 注: `src/infra/db/proposal-repo.ts` の `ConversationRepo` 言及はコメントのみ(偽陽性 / 削除不要)。

## 残すもの(削除しない)
| 残す | 理由 |
|---|---|
| `DocPath` / `docPath`(path traversal 検証) | artifact 索引の安全性に必須(模範) |
| `ArtifactRef` / `indexArtifact`(kind に `screenshot` 含む) | 模範 = index-only。US-05 がこの kind を使う |
| `WikiDoc` / `WikiSection`(`"ubiquitous"\|"facts"\|"ledger"`) | wiki は本サイクル**方針のみ確定**。`WikiSection` の `"ledger"` は **doc 分類**であり台帳テーブル(`LedgerEntry`)とは別概念。残す |
| `extractHumanBlocks` / `regenerateWikiBody` | wiki の人間ブロック保護(INV-5)。wiki サイクルで使う |

> **重要(混同注意)**: 削除するのは **`LedgerEntry`(持ち越し台帳の DB 実体)**。残すのは **`WikiSection = "...|ledger"`(wiki セクションの種別ラベル)**。名前が似るが別物。

## 退役する不変条件(モデルから消える = 明示記録)
| 旧不変条件 | 内容 | 退役後の正本 |
|---|---|---|
| 旧 INV-3(Ledger) | `carried⇒into 必須 / dropped⇒reason 必須`(`makeLedgerEntry`/`reconcileEntry`) | file `aidlc-docs/{v}/ledger.yml`(規約 path)。studio ドメインは台帳不変条件を持たない |
| 旧 INV-4(Ledger) | 次サイクル S1 着手 = 未 reconcile 0(`canStartNextCycleS1`) | 同上(file 側の規約 / 将来 v0.0.5 の照合ゲートで再導入可) |

- **可逆性**: 将来 listing 実需が出たら `artifact` と同型の path 索引で再導入できる(US-01 D-01 / Q-01)。削除は不可逆な情報喪失ではない(正本は file に在る)。

## 不変条件(削除後に保つもの)
- **INV-P1(参照切れ 0 / S7 完了条件・未来形)**: **現状は配線層に参照が在る**(上表)。S7 実装完了時に、`domain`/`app/ports`/`infra/db`/`infra/sys`/`tests` から `Ledger*`/`Conversation*`/`LedgerEntryId` への参照を **0** にする(= 全波及点除去)。達成後 235 回帰 + E2E 6 が pass(参照切れ 0)。**業務フロー(services/orchestrator)参照は既に 0** のため、削除は機能を壊さない(死蔵除去)。
- **INV-P2(境界の明快さ)**: 削除により ExternalMemory は「**index(artifact)+ state + wiki 方針**」に収束し、「DB が不変 truth を複製する」モデルが消える(scope.md 統一原則)。
- **INV-P3(wiki 不変)**: 本サイクルで wiki の実装是正はしない(`WikiDoc`/`WikiSection`/人間ブロック保護はそのまま)。

## この集約固有の 質疑応答ログ

### Q-01 — `ids.ts` の `LedgerEntryId` を消すと branded id レジストリに穴が空かないか
- 文脈: `LedgerEntryId` は `LedgerEntry.id` 専用だが、`app/ports/sys.ts` `IdGen.ledgerEntryId()`(:40)・`infra/sys/id-gen.ts`(:53)・`fakes.ts`(:117)が依存している。これらも同時に消さないと型エラー。
- 提案: `LedgerEntry` 本体 + `LedgerEntryId` + 上記 `IdGen.ledgerEntryId` 一式を**同時削除**(削除対象表の全波及点)。残参照 0 を S7 実装時に grep で再確認。波及点ファイルの所在は厳密に: `src/infra/sys/fakes.ts`(`src/infra/sys/` 配下) / `tests/integration/builders.ts`(`tests/` 配下のテストヘルパー。`src/` ではない) / `tests/integration/store.test.ts`。
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定: `LedgerEntry`/`LedgerEntryId`/`IdGen.ledgerEntryId` を波及点表ごと同時削除。S7 で全消し + grep 0 確認。)

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — 削除を「モデル判断」として S6 に明示記録する(黙って S7 で消さない)
- **理由**: 削除は不変条件(旧 INV-3/4)の退役を伴う設計判断。S7 実装ログだけに埋めると「なぜ消えたか・正本がどこへ移ったか」が失われ、原則#6(黙った descope 禁止)に反する。S6 で退役を表に残す。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — `WikiSection` の `"ledger"` メンバは残す(`LedgerEntry` 削除と混同しない)
- **理由**: `WikiSection` は wiki doc の分類で、台帳テーブル `LedgerEntry` とは別概念。wiki は本サイクル方針のみ(INV-P3)。混同して消すと wiki セクション種別が欠落し回帰割れする。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## この集約固有の 棄却した案

### R-01 — Ledger を消さず deprecated コメントだけ付けて残す
- **棄却理由**: 死蔵が温存され「複製しない」原則の判定が曖昧なまま(US-01 R-01)。境界は削除の方が明快。正本は file に在るので情報は失われない。
</content>

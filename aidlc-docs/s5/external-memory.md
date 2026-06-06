# 集約: 外部記憶(Artifact / Wiki / Ledger / Conversation)

## メタ
- 親: [s5/index.md](./index.md)
- 対応 US: [US-19](../s1/us-19-artifact-view.md), [US-20](../s1/us-20-wiki-read.md), [US-21](../s1/us-21-ledger-reconcile-view.md), [US-28](../s1/us-28-conversation-history.md), [US-32](../s1/us-32-wiki-edit.md), [US-33](../s1/us-33-ai-maintain-wiki.md)
- 所属 Unit: [Unit-05](../s3/unit-05-artifact-wiki-ledger.md)
- ステータス: 確定
- MVP: —(v0.0.x)

> **設計の核**: aidlc-docs を**唯一の真実 source** とし、studio store には**内容を複製しない**(参照・索引・状態のみ)。これは S1 非機能「圧縮回避 = 外部記憶 + 選択的ロード」をドメインに焼き込んだもの。ここのモデルは「内容を持つ集約」ではなく「**aidlc-docs への参照とその上の薄い不変条件**」。

## モデル定義 (DDD 採用 / 参照主体)

```
ArtifactRef (索引エントリ / 内容は aidlc-docs に在る)
 ├─ cycleId: CycleId
 ├─ step: Step
 ├─ path: DocPath             // VO: aidlc-docs ルート配下に限定
 ├─ kind: us|mock|flow|uow|code|screenshot
 └─ updatedAt: Instant

WikiDoc (section 単位の参照)
 ├─ section: ubiquitous | facts | ledger   // facts = 確定事項(旧 decision section)
 ├─ path: DocPath
 └─ updatedAt: Instant
 // 人間編集ブロックは本文中の `<!-- human -->` マーカーで保護(AI 上書き禁止)
 // facts section は Facts 集約([facts.md])を源泉に AI が再生成(Fact が真実、Wiki は投影)

LedgerEntry (集約ルート / 持ち越し台帳の 1 行)
 ├─ id: LedgerEntryId
 ├─ kind: D | 確定項目
 ├─ label: Text
 ├─ state: carried | done | dropped
 ├─ into: Ref?                // carried のとき必須(次サイクルのどこへ)
 ├─ reason: Text?             // dropped のとき必須
 └─ cycleFrom: CycleId

Conversation (runId 単位の対話ログ参照)
 ├─ runId: RunId
 └─ turns: { role, text, at }[]
```

### 値オブジェクト
- `DocPath`: aidlc-docs ルート配下に限定する正規化済みパス。**ルート外 / path traversal を拒否**(セルフホスト安全。S3 Unit-05 Q-01 確定)。

## 操作

| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| listArtifacts | { cycleId } | ArtifactRef[] | — |
| readArtifact | { path } | content(都度 aidlc-docs から read) | PathOutsideDocs / NotFound |
| readWiki | { section } | WikiDoc + content | — |
| editWiki | { section, patch } | WikiDoc(人間編集を保存) | Conflict |
| regenerateWiki | { section } | WikiDoc(AI が成果物から再生成・`<!-- human -->` は保持) | — |
| listLedger | { cycleId } | LedgerEntry[] + 未 reconcile 件数 | — |
| getConversation | { runId } | Conversation | NotFound |

## 不変条件
- **INV-1(単一真実)**: store は `ArtifactRef`(索引)だけを持ち、**成果物内容を複製しない**。内容は `readArtifact` で都度 aidlc-docs から read(二重真実・陳腐化の回避。S3 Unit-05 D-01)。
- **INV-2(パス安全)**: `readArtifact` / `DocPath` は aidlc-docs ルート配下のみ。ルート外参照は `PathOutsideDocs`。
- **INV-3(Ledger 完全性)**: `state=carried` なら `into` 必須 / `state=dropped` なら `reason` 必須(kit ルール #5)。欠落は不正な LedgerEntry。
- **INV-4(reconcile ゲート)**: 次サイクルの S1 は**未 reconcile の LedgerEntry をゼロにするまで進めない**(kit #5。`listLedger` の未 reconcile 件数 = 0 が S1 着手条件)。
- **INV-5(人間編集保護)**: `regenerateWiki` は `<!-- human -->` マーカーで囲まれた人間編集ブロックを**上書きしない**(US-32 / US-33 の共存。S3 Unit-05 Q-02 確定)。

## この集約固有の 質疑応答ログ

### Q-01 — 外部記憶を「内容を持つ集約」でなく「aidlc-docs への参照 + 薄い不変条件」とする設計でよいか?
- 観点: Artifact/Wiki/Conversation は内容を aidlc-docs(真実)に置き、studio は参照・索引・状態だけを持つ。唯一「内容に近い不変条件」を持つのは LedgerEntry(carried⇒into / dropped⇒reason / reconcile ゲート)。この「参照主体 + Ledger だけ厚い」モデルでよいか。
- **回答**(ユーザー記入):
  > PJ ごとにカスタムは「取り込み」が要るのでは? → 真意は「ステップの意味・数も PJ ごとに変える可能性ある」
- **確定**(AI 記入):
  > **成果物の内容は参照主体のまま確定**(aidlc-docs が唯一の真実、studio は ArtifactRef 索引のみ・内容複製なし・都度 read。圧縮回避を維持)。PJ ごとのカスタムは**成果物内容の取り込みではなく、方法論(ステップ定義)の per-PJ 可変**として [project.md](./project.md) の `pipelineDef` が保持(Project D-03)。これにより外部記憶は参照主体を保ったまま、ステップ可変要件を別レイヤで満たす。Ledger は厚い不変条件(carried⇒into / dropped⇒reason / reconcile ゲート)、readArtifact は aidlc-docs ルート配下限定。

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — store に内容を複製せず常に aidlc-docs から read(S3 Unit-05 D-01 踏襲)
- **理由**: S1 非機能「圧縮回避 = 外部記憶 + 選択的ロード」。内容を studio に複製すると二重真実・陳腐化。store は ArtifactRef(索引)のみ、内容は都度 read。これによりコンテキストも「必要な成果物だけ選択的にロード」できる。
- **判断**(ユーザー記入): 承認(Q-01 確定に同梱)
- **上書き内容**(上書き時のみ):

### D-02 — LedgerEntry を構造化集約にし reconcile ゲートを不変条件化(S3 Unit-05 D-02 踏襲)
- **理由**: kit #5(引き継ぎ漏れ根治)。散文でなく `state` 必須の entry にし、`carried⇒into / dropped⇒reason` と「次サイクル S1 は未 reconcile=0 まで進めない」をドメインの不変条件(INV-3/4)として焼き込む。S6 で機械チェック可能になる。
- **判断**(ユーザー記入): 承認(Q-01 確定に同梱)
- **上書き内容**(上書き時のみ):

---

## この集約固有の 棄却した案

### R-01 — Wiki/Artifact を studio の DB に取り込んで管理(S3 Unit-05 R-01 踏襲)
- **棄却理由**: 真実 source の二重化。aidlc-docs(git 管理)を唯一の source とし、studio は索引と状態のみ持つ。

### R-02 — Artifact / Wiki / Ledger を 3 つの別 Unit/集約に割る(S3 index R-03 踏襲)
- **棄却理由**: いずれも aidlc-docs を真実 source とする「外部記憶」の読み書きで I/F 基盤を共有する。分けると aidlc-docs アクセス層が重複。1 ファイルに束ね、Ledger だけ厚い不変条件を持たせる。

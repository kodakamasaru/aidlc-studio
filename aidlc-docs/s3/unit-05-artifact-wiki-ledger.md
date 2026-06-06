# Unit-05: Artifact / Wiki / Ledger

## メタ
- 親: [s3/index.md](./index.md)
- 所属 US: [US-19](../s1/us-19-artifact-view.md), [US-20](../s1/us-20-wiki-read.md), [US-21](../s1/us-21-ledger-reconcile-view.md), [US-28](../s1/us-28-conversation-history.md), [US-32](../s1/us-32-wiki-edit.md), [US-33](../s1/us-33-ai-maintain-wiki.md)
- ステータス: 確定
- MVP: —(v0.0.x)

## 責務 (1〜2 行)
**外部記憶層**。aidlc-docs 成果物(US/Mock/Flow/UoW/code/screenshot)の閲覧、AI による Wiki(ユビキタス言語 / Decision / ledger)の自動維持(US-33)、人間の Wiki 編集(US-32)、ledger reconcile ビュー(US-21)、AI 会話履歴(US-28)。**aidlc-docs を唯一の真実 source** として読み書きし、store に内容を複製しない(圧縮回避)。

## 外部依存
- **aidlc-docs/**(ファイルシステム): 成果物の真実 source を read。Wiki/ledger はここに write。
- **Unit-02**(Orchestration): `ArtifactEmitted` / `WikiUpdated` を購読してインデックス更新・Wiki 再生成。
- **Unit-01**(Cycle/Run core): 成果物を cycle/phase に紐づけて参照。

## I/F 定義 (この Unit が公開する契約)

### state / 型
```
ArtifactRef { cycleId, step, path(aidlc-docs 相対), kind: us|mock|flow|uow|code|screenshot, updatedAt }
WikiDoc     { section: ubiquitous|decision|ledger, path, updatedAt }
LedgerEntry { id, kind: D|確定項目, label, state: carried|done|dropped, into?, reason?, cycleFrom }
Conversation{ runId, turns: {role, text, at}[] }
```
> ledger は kit ルール準拠: `carried` なら `into:` 必須 / `dropped` なら `reason:` 必須。日付 ISO-8601。

### 操作
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| listArtifacts | { cycleId } | ArtifactRef[] | — |
| readArtifact | { path } | content(md/mermaid/png) | PathOutsideDocs / NotFound |
| readWiki | { section } | WikiDoc + content | — |
| editWiki | { section, patch } | WikiDoc(human 編集を保存) | Conflict(AI 維持と衝突) |
| listLedger | { cycleId } | LedgerEntry[] + 未 reconcile 件数 | — |
| getConversation | { runId } | Conversation | NotFound |

### パス安全(確定)
- `readArtifact` は **aidlc-docs ルート配下に限定**(path traversal を弾く)。セルフホストで任意パス read を禁止。

### AI 維持(US-33)/ 人間編集(US-32)のマージ(確定方針)
- AI は `WikiUpdated` 受信で section を成果物から再生成・追記。**人間編集ブロックは `<!-- human -->` マーカーで保護**し AI は上書きしない。詳細(マーカー粒度・衝突 UX)は v0.0.x で詰める。

## この Unit 固有の 質疑応答ログ

### Q-01 — readArtifact のパス安全(aidlc-docs 外を読ませない)
- セルフホストで任意パス read は危険。`readArtifact` は aidlc-docs ルート配下に限定(path traversal を弾く)。この制約でよいか。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > **aidlc-docs ルート配下限定**(path traversal 拒否)で確定。ルート外参照は `PathOutsideDocs` エラー。

### Q-02 — AI 自動維持(US-33)と人間編集(US-32)の衝突解決方針
- AI が Wiki を常時再生成する中で人間が編集した箇所をどう守るか。案: 人間編集ブロックに `<!-- human -->` マーカーを置き AI は上書きしない / or 編集は別レイヤ。MVP 外だが I/F に影響。
- **回答**(ユーザー記入):
  > 推奨どおり一括確定(2026-06-06)
- **確定**(AI 記入):
  > **`<!-- human -->` マーカーで人間編集ブロックを保護**(AI は上書き禁止)を方針として確定。マーカー粒度・衝突時 UX の詳細は v0.0.x 実装時に確定(I/F は `editWiki` の Conflict エラーで予約)。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — store に成果物内容を複製せず、常に aidlc-docs から read
- **理由**: S1 非機能「圧縮回避 = 外部記憶 + 選択的ロード」。内容を studio store にコピーすると二重真実・陳腐化。store は ArtifactRef(索引)だけ持ち、内容は都度 read。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

### D-02 — ledger を散文でなく構造化 entry(state 必須)に
- **理由**: kit ルール #5(引き継ぎ漏れ根治)。`carried|done|dropped` + carried は `into:` / dropped は `reason:` 必須の entry にし、次サイクル S1 が未 reconcile=0 を機械チェックできる。
- **判断**(ユーザー記入): 承認
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — Wiki/Artifact を studio の DB に取り込んで管理
- **棄却理由**: 真実 source 二重化。aidlc-docs(git 管理)を唯一の source とし、studio は索引と状態のみ。

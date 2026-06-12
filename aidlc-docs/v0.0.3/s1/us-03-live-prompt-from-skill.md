# US-03: live prompt を実スキル本文から合成する(契約 + 実装)

## メタ
- 親: [s1/index.md](./index.md)
- 対応 S2 画面 (確定後に追記): —(実行プロンプトは内部。画面追加なし)
- ステータス: 確定
- scope: ①-c + ②-d

## 3 視点

### なぜするか (Why)
現状 live の `defaultBuildPrompt` は 1 文スタブで、実 AI に渡るプロンプトが「方法論本文(`kit/skills`)」「step 契約(`StepDef.contracts`)」「brief/前段成果物(`aidlc-docs`)」のどれも実体で含んでいない。これでは live が出す成果物は scripted と別物の薄いものになり、品質ハーネスを live で貫通できない。**source 合成の所有・順序を契約化し、その契約に従って実プロンプトを組み立てる。** US-04/05 の品質証拠はこれが本物であって初めて意味を持つ。

### UX へのインパクト
サイトから live を起動したとき、実 AI がそのサイクルの brief・前段成果物・step 手順を踏まえた本物の成果物を出す。ユーザーが Inbox で見るレビューが「実 AI が方法論に沿って書いたもの」になる。

### 受け入れ条件 (AC)
- **合成契約の明文化**: live prompt を `kit/skills/aidlc-sN`(手順本文)+ `StepDef.contracts`(DB)+ brief/前段成果物(`aidlc-docs`)から合成する**順序と所有**が doc 化されている(US-04/v0.0.2 の 2 層 prompt = Core 常時 + Step Payload 遅延 を実体化)。置き場は scope.md 関連 doc / operating-model に従う。
- **実合成の実装**: [live.ts](../../../src/infra/orchestrator/live.ts) の `defaultBuildPrompt` が契約どおりに 3 source を合成する(US-02 の skillRef 実 dir 解決を使ってスキル本文を取得)。
- **gen と eval で別 payload**: generator と evaluator で渡す payload が契約どおり出し分けられる(v0.0.2 §11 の 2 layer を踏襲)。
- **テスト**: 合成結果に 3 source(スキル本文の要点 / contracts / brief)が含まれることを検証するテストが pass。スキル dir 不在時は明示エラー(silent fallback 禁止)。
- 既存テスト(235 + E2E 6)pass。`bun test:live` 環境ゲートの加算層方針([[real-ai-tests-additive]])を維持(決定的スイートを緩めない)。

## この US 固有の 質疑応答ログ

### Q-01 — live prompt の合成契約 doc の置き場(scope.md design/ 新設 / operating-model / kit/skills 内の規約)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定方針: 「source 合成順序・所有」は恒久ルールなので operating-model に 1 節追加。サイクル固有の payload 構成は scope の design ノートに。)

---

## この US 固有の AI が独自に決めたこと と 理由

### D-01 — ①-c(契約)と ②-d(実装)を 1 US に統合
- **理由**: 契約のみだと prompt はスタブのまま、実装のみだと所有/順序が暗黙。「live prompt が本物になる」は両方で 1 縦スライス(index D-03)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — スキル本文取得は US-02 の単一正本(skillRef→実 dir)経由に限定
- **理由**: live が独自に dir 名を組み立てると ①-b の偽リンク問題が live 側に再発する。正本解決を 1 経路に統一。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## この US 固有の 棄却した案

### R-01 — スキル本文全文を常に prompt に注入
- **棄却理由**: v0.0.2 §11 の遅延ロード(Core 常時 + Step Payload 遅延)に反し、コンテキストを浪費。契約は「必要な層だけ」を要求する。

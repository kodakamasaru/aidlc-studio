# Unit-05: reconcile/ledger project 化 + ルール↔ゲート drift 検出

## メタ
- 親: 作業単位の一覧
- 所属 US: [US-09](../s1/us-09-rule-gate-drift.md), [US-10](../s1/us-10-project-param-reconcile.md)
- ステータス: 確定

## 責務 (1〜2 行)
gate/CLI 層(reconcile / ledger / probe)を studio 固定から project-agnostic へ硬化する。① reconcile/ledger を **repoPath パラメータ化**し、跨サイクル seed fixture で block/pass を seed 上で即確認(US-10)② `probe:rules` を拡張し「機械強制を謳う binding ルール↔ gate↔ test」の連結を機械検査、欠ければ赤(US-09)+ 既存不変条件 1〜2 件を step-contracts 駆動へ移行して橋の型を実証。engine core と独立(leaf)。

## 外部依存
- 既存 scripts(reconcile-check / migrate-root-ledger / probe-binding-rules)+ root-ledger / step-contracts。
- seed materializer(複数 version / ledger.yml 対応に拡張)。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| reconcile(repoPath, version) | 対象 PJ の repoPath + version | PASS / BLOCK(未 reconcile id 列挙) | repoPath 不在 |
| ledger 操作(repoPath) | repoPath | root 台帳の再生成 / check | — |
| probe:rules(拡張) | (なし) | binding ルール↔gate↔test の連結検査 → 欠落で exit 1 | — |
| seed(suite, repoPath) | 跨サイクル fixture(前サイクル done + ledger carried + 現サイクル S1)| seed 済の sandbox PJ | — |

## この Unit 固有の 質疑応答ログ

### Q-01 — (未)
- **回答**(人間の回答を AI が記入):
  > 
- **確定**(AI 記入):
  > 

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — drift 検出ゲートは「連結の有無」までに留め、中身の質は見ない
- **理由**: precision-first(US-09)。ゲートは存在/連結(決定論)、質は evaluator、最終確信は人間。連結検査を超えて中身の質をゲートで見ると偽物が通る/正解が落ちる。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — 単一正本インタプリタ全面化は範囲外。橋の型 1〜2 件移行に留める
- **理由**: BACKLOG §K (3c) big-bang 禁止 / index D-04。`requiresLiveEvidence` に倣い 1〜2 件を step-contracts 駆動へ寄せて型を確立するところまで。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この Unit 固有の 棄却した案

### R-01 — reconcile/ledger を studio 固定のまま残す
- **棄却理由**: P-ARCH-02。studio 前提がコア実行経路に漏れると別 PJ の gated step が stall する(P-S9-03 の実例)。repoPath パラメータ化が必須。

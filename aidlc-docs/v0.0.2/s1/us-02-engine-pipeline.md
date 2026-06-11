# US-02: Engine 実行パイプライン

## メタ
- 親: [s1/index.md](./index.md)
- 対応 scope: B(§4) + C(§8) + D(§11.2)
- 実装フェーズ: P2
- ステータス: 確定

## 3 視点

### なぜするか (Why)
v0.0.1 は「Run が1回実行されて終わる」単方向フローだった。v0.0.2 は **generator が成果物を出し、別 Run の evaluator が検証する** 往復フローが必要。この gen→eval ループが品質ハーネスの核心。BriefIn/BriefOut 型で入出力を型安全に定義し、deterministic gate で evaluator 前の機械的チェックを自動化する。

### UX へのインパクト
ユーザー(開発者)は「AIが成果物を出した後に、別のAIが自動で検証する」サイクルを体験する。generator の出力に欠落があれば deterministic gate が即座に弾く。evaluator が品質を判定し、人間は最終結果だけを見て承認/差し戻しする。**人間がコードレビューする必要がなくなる**。

### 受け入れ条件 (AC)
- [ ] BriefIn 型(context + requirements)が定義される
- [ ] BriefOut 型(成果物 + 決定 + 申し送り + CompletenessBlock)が定義される
- [ ] Run に `role: 'generator' | 'evaluator'` が追加される
- [ ] OrchestratorPort に `launchEval` メソッドが追加される
- [ ] Deterministic gate が evaluator 起動前に以下を検査する:
  - 成果物パスが存在する
  - 必須 block が存在する(Profile レジストリに基づく)
- [ ] Deterministic gate は **AI 非依存・決定的**に実装される(S4 Q-02 確定: app 層の決定的サービス。「Node.js スクリプト」の意図 = AI を呼ばず機械的に判定すること)
- [ ] gen→deterministic→eval の E2E テストが pass する
- [ ] 既存テストが全 pass

## この US 固有の 質疑応答ログ

---

## この US 固有の AI が独自に決めたこと と 理由

### D-01 — Deterministic gate を AI 非依存(Node.js スクリプト)にする
- **理由**: AI 呼び出しはコストが高く nondeterministic。パス存在・block 存在は機械的チェックなので AI を使わない。これにより evaluator 前の無駄な AI 起動を防ぐ。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-02 — Run.role を discriminator にする(union type)
- **理由**: generator と evaluator で持つべきフィールドが異なる(input/output の型が違う)。role で判別する方が型安全。ただし既存 Run(roleなし)も動くよう optional にする。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

---

## この US 固有の 棄却した案

### R-01 — Deterministic gate を AI プロンプトで実装
- **棄却理由**: パス存在チェックに AI を使うのは過剰。コストが高く nondeterministic。Node.js の fs.exists で十分。

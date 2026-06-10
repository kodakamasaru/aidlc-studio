# US-01: StepDef 契約拡張 + 成果物 Profile レジストリ

## メタ
- 親: [s1/index.md](./index.md)
- 対応 scope: A(§2) + G(§5)
- 実装フェーズ: P1
- ステータス: 確定

## 3 視点

### なぜするか (Why)
現状の StepDef は `name` と `description` のみで、各 Step が何を出力し・何で検証し・いつ人間に渡すかを宣言する手段がない。後続の Engine パイプライン(US-02)と Completeness gate(US-03)は StepDef に契約情報が載っていることを前提とする。この US は **全ハーネス機能のデータモデル基盤** であり、P1 で最初に完成させる必要がある。

### UX へのインパクト
ユーザー(開発者)は Step の振る舞いをコードではなく **宣言型の契約** で理解できるようになる。「この Step は何を出すか / 何で検証するか / いつ人間に委ねるか」が StepDef を見れば一目で分かる。US-06(Step カスタム UI)で画面編集可能になる前段としてのデータ定義。

### 受け入れ条件 (AC)
- [ ] StepDef 型に `contracts` フィールド(optional)が追加され、4つの契約タイプ(Output / Verification / HumanGate / Escalation)を定義できる
- [ ] `execMode` フィールド(optional, `'sequential' | 'parallel'`)が追加される
- [ ] Profile レジストリ(タスク種別→必須 block 集合のマッピング)が定義される
- [ ] `coerceBlocks` 関数が前方互換で動作する(未知 block を無視し既知 block を補完)
- [ ] 既存の StepDef(契約なし)も後方互換で動作する(v0.0.1 の 155 tests が全 pass)
- [ ] 追加された型の unit test が 95%+ coverage を満たす

## この US 固有の 質疑応答ログ

### Q-01 — contracts は optional にするか required にするか?
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  >

---

## この US 固有の AI が独自に決めたこと と 理由

### D-01 — 4契約の種類を Output / Verification / HumanGate / Escalation に固定
- **理由**: scope.md §2 で指定済。それぞれが成果物出力・検証方法・人間判断タイミング・エスカレーション先を宣言する。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-02 — coerceBlocks で前方互換を保証
- **理由**: Profile レジストリが将来 block 種を増やしても、古い Step の成果物が壊れないようにする。未知 block は無視、既知 block が不足なら警告(エラーにしない)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

---

## この US 固有の 棄却した案

### R-01 — contracts を required にする
- **棄却理由**: v0.0.1 の 155 tests が全壊する。段階的移行ポリシーに反する。

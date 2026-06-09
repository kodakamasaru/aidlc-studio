# S3 — Unit of Work(全体) — v0.0.2

## メタ
- 工程: S3 (Unit of Work)
- 役割: ソフトウェアアーキテクト
- ステータス: 確定
- 入力参照: [v0.0.2/s1](../s1/index.md) / [v0.0.2/s2](../s2/index.md) / [v0.0.1/s3](../../v0.0.1/s3/index.md) / [design/quality-harness.md](../design/quality-harness.md)
- 作成日: 2026-06-10
- 更新日: 2026-06-10

> v0.0.1 の 8 Unit 構成を引き継ぎ、品質ハーネスに必要な拡張を各 Unit に追記する。
> 新規 Unit なし。品質ハーネスの概念は既存 Unit の責務内に収まる。

## v0.0.2 影響マップ

| Unit | 名称 | v0.0.2 拡張内容 | 対応 scope 項目 |
|------|------|----------------|----------------|
| Unit-01 | Cycle & Run ライフサイクル | Run に `role: 'generator' \| 'evaluator'` 追加。同 Phase 内の複数 Run を許容(§8.2) | C |
| Unit-02 | Orchestration / Agent Runner | gen→eval ループ(§8) / deterministic gate(§11.2) / BriefIn-Out 組立(§4) / prompt 構成(§11.1,11.3,11.4) / completeness gate 起動(§7.4) | B,C,D,F |
| Unit-03 | Human Inbox & Decision | evaluator pass 後のみ visual_review カード提示(§8.5) / descope Question 専用 kind(§7.1) / `deferScope` 命令(§7.3) | E |
| Unit-04 | Review Rendering | 新 block 型(completeness/impact/decision/scope/parity/handoff/pointer/cause/prevention)の描画 / descope card 操作 / video embed 枠 / Profile レジストリ(§5) | G,H,K |
| Unit-07 | Project & Config | StepDef 拡張(4契約+execMode)(§2) / 契約 UI(SCR-06) / Profile → StepDef 紐づき | A,G,I |

Unit-05/06/08 は v0.0.2 で変更なし。

## 新規ドメイン概念(既存 Unit に追加)

### Unit-01 追加: Run.role
```
Run = {
  ...existing,
  readonly role: 'generator' | 'evaluator'  // §8.2
}
```
- evaluator は同 Phase の別 Run にすぎない(§8.2)
- 既存 Run 型への optional 追加。JSON 永続化でマイグレ不要

### Unit-02 追加: 品質ハーネス engine
- **BriefIn/BriefOut** 型(§4): engine が各 step 起動時に BriefIn を組み立て、完了時に BriefOut を受け取る
- **Deterministic gate**(§11.2): evaluator 起動前に成果物パス存在 + 必須 block 存在を Node.js スクリプトで検査
- **Completeness gate**(§7.4): evaluator が BriefIn.requirements ↔ Review.completeness.addressed を照合
- **Prompt 構成**(§11): Core(常時) + Step Payload(遅延) の 2 層。gen/eval で別 payload
- **gen→eval ループ**(§8): ResultEmitted → deterministic gate → eval launch → EvaluationCompleted → 分岐(pass/fail/descope)

### Unit-03 追加: descope & evaluator gate
- **evaluator pass 後ゲート**(§8.5): visual_review カードは evaluator pass 済みのみ
- **descope Question kind**(§7.1): 専用 kind `{kind:'descope', target, mode, reason, impact, alternatives, recommendation}`
- **deferScope 命令**(§7.3): approve 時に backlog Task を直接生成 + resume

### Unit-04 追加: Profile レジストリ + 新 block 型
- **Profile レジストリ**(§5): task 種別 → 必須 block 集合のデータ構造。`coerceBlocks` で前方互換
- **新 ReviewBlock 型**: completeness / impact / decision / scope / parity / handoff / pointer / cause / prevention / video(既存)
- **bugfix dossier プロファイル**(§6): cause(2層)/impact/fix/prevention/video の必須 block 定義
- **descope card 描画**: approve/reject ボタン付きカード

### Unit-07 追加: StepDef 契約 + Profile 紐づき
- **StepOutput / StepVerification / StepHumanGate / StepEscalation / StepExecMode** 型(§2)
- **STEP_CONTRACT_DEFAULTS**(§2.2): 省略時のデフォルト
- **resolveStepDef**: デフォルト埋めの純粋関数
- **SCR-06 UI**: 契約フィールドのフォーム + Profile 表示

## 依存方向(変更なし)
v0.0.1 の依存方向を維持。品質ハーネスは既存依存の中に収まる:
- Unit-02 が evaluator Run を Unit-01 に create → Unit-01 は知らない(核)
- Unit-02 が EvaluationCompleted を emit → Unit-03 が購買(descope Question 起票)
- Unit-04 は Profile レジストリを read するだけ(純粋)

## 実装フェーズ(scope-v0.0.2.md 準拠)
```
P1: 型拡張基盤(A, G) → Unit-01(role) + Unit-07(StepDef contracts) + Unit-04(Profile)
P2: Engine 組立(B, C, D) → Unit-02(BriefIn-Out + gen→eval + deterministic gate)
P3: Gate/Policy(E, F) → Unit-02(completeness gate) + Unit-03(descope) + Unit-02(prompt)
P4: Profile 具体化(H) → Unit-04(bugfix dossier blocks)
P5: Step カスタム UI(I) → Unit-07(SCR-06)
P6: リッチ描画(K) → Unit-04(新 block renderer)
```

## 次工程 (S4) への引き継ぎ
- ContextMap で強調: Unit-02 が新しく emit する EvaluationCompleted イベント / descope Question の経路
- P1 がクリティカルパス(型拡張なしに他フェーズが進めない)

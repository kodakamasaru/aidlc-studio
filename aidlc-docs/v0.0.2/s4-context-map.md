# S4 — コンテキストマップ — v0.0.2

## メタ
- 工程: S4 (Context Map)
- 役割: ソフトウェアアーキテクト
- ステータス: 確定
- 入力参照: [v0.0.2/s3/index.md](./s3/index.md) / [v0.0.1/s4-context-map.md](../../v0.0.1/s4-context-map.md)
- 作成日: 2026-06-10
- 更新日: 2026-06-10

> v0.0.1 の DAG(Phase 1→4)は不変。v0.0.2 が追加する依存(event + minor strong)を差分で記載する。

## Phase レイアウト(不変)

```
Phase 1(leaf):  Unit-01 / Unit-04 / Unit-07
Phase 2:        Unit-02 / Unit-05 / Unit-06
Phase 3:        Unit-03
Phase 4:        Unit-08
```

v0.0.1 と同じ。品質ハーネスは Phase 構成を変えない。

## v0.0.2 追加依存(差分)

### 新規 event: EvaluationCompleted

```
Unit-02 -.emit EvaluationCompleted.-> Unit-03
```

- **内容**: `{ verdict: 'pass' | 'fail' | 'gap', gaps: ReqGap[], proposesDescope?: DescopeProposal }`
- **消費側**: Unit-03 が verdict に応じて分岐
  - pass → visual_review カードを人間に提示
  - fail → gen 再起動(bounded retry)
  - gap + proposesDescope → descope Question 起票

### 新規 event: EvaluationCompleted → Unit-05 (間接)

- evaluator の Review (ReviewBlock[] を含む) も通常の Artifact と同様に Unit-05 経由で永続化
- 既存の `Unit-02 -.emit ReviewBlock.-> Unit-05` 経路をそのまま使用

### 新規 strong 依存: Unit-04 → Unit-07 (Profile 参照)

```
Unit-04 --> Unit-07  (Profile レジストリ read)
```

- Review レンダラ(Unit-04)が描画時に Profile レジストリ(§5)を参照して必須 block の充足を確認
- ただし **Phase 1 に両方いる** ため Phase 構成は変わらない(同 Phase 内の依存)

### 変更なしの依存

- Unit-02 → Unit-01: evaluator Run の create もこの依存に含まれる(既存)
- Unit-03 → Unit-04: descope card 描画もこの依存に含まれる(既存)
- Unit-03 → Unit-02: `deferScope` 命令も command 経路(既存)

## 実装順(P1→P6 は Phase レイアウトとは別軸)

Phase レイアウト = ビルド時の着手順。実装フェーズ(P1→P6) = 機能の段階的完成。

| 実装PF | 対象 Phase | 内容 |
|--------|-----------|------|
| P1(型拡張) | Phase 1 | Unit-01(role) + Unit-07(StepDef 契約) + Unit-04(Profile) |
| P2(Engine) | Phase 2 | Unit-02(BriefIn-Out + deterministic gate + eval launch) |
| P3(Gate) | Phase 2-3 | Unit-02(completeness gate) + Unit-03(descope) + Unit-02(prompt) |
| P4(Profile) | Phase 1 | Unit-04(bugfix dossier block 型) |
| P5(Step UI) | Phase 1 | Unit-07(SCR-06) |
| P6(描画) | Phase 1 | Unit-04(新 block renderer) |

P1 がクリティカルパスであることは v0.0.1 から変わらない。

## 次工程 (S5) への引き継ぎ
- **最優先ドメインモデリング**: Unit-01 の Run.role 追加 + Unit-07 の StepDef 契約型
- **新イベント DTO**: EvaluationCompleted / DescopeProposal の型定義
- **Profile レジストリ**: Unit-04 内のデータ構造(task種別 → 必須block[])

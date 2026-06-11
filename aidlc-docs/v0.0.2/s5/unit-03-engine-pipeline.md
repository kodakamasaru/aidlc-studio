# Unit-03: Engine 実行パイプライン(gen→gate→eval)

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-02](../s1/us-02-engine-pipeline.md)(B + C + D)
- Phase: Phase 3(クリティカルパス)
- レイヤ: `domain/`(型・Run.role)+ `app/`(launchEval ポート・Deterministic gate サービス)
- ステータス: 確定

## 責務 (1〜2 行)
generator が成果物(BriefOut)を出し、**AI 非依存の Deterministic gate**を通過した場合のみ evaluator を起動する **gen→gate→eval の往復実行フロー**。BriefIn/Out/CompletenessBlock 型、`Run.role`、`OrchestratorPort.launchEval` を含む(S4 §3.4 / §4)。

## 外部依存
- **Unit-01**: Profile レジストリ + `CompletenessBlock` + block 型(gate の必須 block 検査に使う)。
- **Unit-02**: gen/eval 各 Run のプロンプトを `PromptComposer.compose` 経由で組み立てる。
- 既存: `OrchestratorPort`(`launch`/`resume`/`retry`/`cancel`)+ `DomainEventSink`(adapter は DB を書かず emit / S7 D-04)、`domain/cycle/` の `Run`/`RunState`、`sys` ポート(成果物パス存在検査)。

## I/F 定義 (この Unit が公開する契約)

### 1) BriefIn / BriefOut / CompletenessBlock(`domain/review/` 純粋型)— B
| 型 | 内容 |
|----|------|
| `BriefIn` | `{ context, requirements }`(Run の型付き入力) |
| `BriefOut` | `{ artifacts, decisions, handoff, completeness: CompletenessBlock }`(成果物 + 決定 + 申し送り) |
| `CompletenessBlock` | `{ requirements: readonly Req[]; addressed: readonly Ref[] }`(照合の元データ) |

### 2) Run.role(`domain/cycle/cycle.ts` 拡張)— C
| 操作/型 | 入力 | 出力 | エラー |
|--------|------|------|--------|
| `Run.role?` | `'generator' \| 'evaluator'`(optional discriminator) | gen/eval で I/O 型が異なる | 既存 Run(role なし)は従来動作 |

### 3) launchEval(`app/ports/orchestrator.ts` 拡張)— C
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| `OrchestratorPort.launchEval(cmd)` | `EvalLaunch { runId, ...RunContext, generatorOutputRef, verification }` | `Promise<void>`(emission は `DomainEventSink` 経由) | scripted/live 両方が実装 |

### 4) Deterministic gate(`app/services/` 決定的サービス)— D
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| `runDeterministicGate(profile, briefOut, sys)` | Profile + BriefOut + `sys`(FS 注入) | `GateResult { ok: true } \| { ok: false; missing }` | **AI を呼ばない**。fail なら evaluator を起動しない |

- 検査: ① 成果物パス存在(`sys` 経由 Read、判断は純粋)② 必須 block 存在(Profile × CompletenessBlock の純粋判定)。

## 主な AC(US 由来)
- BriefIn/BriefOut/CompletenessBlock 定義、`Run.role` 追加、`launchEval` 追加。
- Deterministic gate が evaluator 起動前にパス存在・必須 block を検査(AI 非依存)。
- gen→deterministic→eval の **E2E が pass**。既存テスト全 pass。

## この Unit 固有の 質疑応答ログ

### Q-01 — `launchEval` を `OrchestratorPort` のメソッド追加にするか、`launch` の role 分岐にするか
- 提案: メソッド追加(`EvalLaunch` が generator 成果物参照 + verification を運ぶため `RunLaunch` と型が異なる / S4 §3.4)。
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  >

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — Deterministic gate は app 層の in-process 決定的サービス(独立サブプロセス spawn しない)
- **理由**: S4 Q-02 / R-01。「Node.js スクリプト」(US-02 D-01)の意図 = AI 非依存・決定的。hexagonal 規律では app 層サービスがそれを最も自然に満たす。FS は `sys` で注入し純粋判定部を網羅 unit テスト。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

### D-02 — emission→persist は既存 `DomainEventSink` をそのまま使い、adapter は DB を書かない
- **理由**: S7 D-04 の規律を継承。gen/eval の成果物 emission も同じ sink を通す。新たな永続化経路を作らない。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — Deterministic gate を AI プロンプトで実装
- **棄却理由**: US-02 R-01。パス存在チェックに AI は過剰でコスト高 + nondeterministic。`sys` の存在検査で十分。

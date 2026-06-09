# S5 — ドメインモデル(集約定義) — v0.0.2

## メタ
- 工程: S5 (Domain Model)
- 役割: ドメインエンジニア
- ステータス: 確定
- 入力参照: [v0.0.2/s3](./s3/index.md) / [v0.0.2/s4](./s4-context-map.md) / [design/quality-harness.md](./design/quality-harness.md) / [v0.0.1/s5](../../v0.0.1/s5/index.md)
- 作成日: 2026-06-10
- 更新日: 2026-06-10

> v0.0.1 の 7 集約(cycle/project/question/review/task/facts/external-memory)を引き継ぎ、品質ハーネスに必要な拡張を定義する。
> 型定義の正本は design/quality-harness.md §2-§7。ここでは集約としての境界・不変条件を記載する。

## 既存集約の拡張

### 1. Cycle 集約(cycle.ts) — 拡張

**Run 型に role 追加**:
```ts
export type RunRole = 'generator' | 'evaluator';

export type Run = {
  readonly id: RunId;
  readonly attempt: number;
  readonly state: RunState;
  readonly startedAt: Instant;
  readonly endedAt?: Instant;
  readonly failureReason?: string;
  readonly role: RunRole;           // v0.0.2 追加
  readonly generatorRunId?: RunId;  // evaluator の場合: 照合先の gen Run
};
```

**不変条件(追加)**:
- INV-E1: role='evaluator' の Run は generatorRunId が必須
- INV-E2: 同 Phase 内の running な Run は高々 1(既存 INV-2 のまま)
- 後方互換: role が省略された旧データは 'generator' と扱う(engine 側でデフォルト)

### 2. Project 集約(project.ts) — 拡張

**StepDef 型に 4 契約 + execMode 追加**(§2):
```ts
type ProfileName = string;

type StepOutput = {
  readonly profile: ProfileName;
  readonly artifactPaths?: readonly string[];
};

type StepVerification = {
  readonly completenessGate: boolean;
};

type StepHumanGate = {
  readonly humanReview: 'visual' | 'real' | 'none';
};

type StepEscalation = {
  readonly onGap: 'fail-retry' | 'descope';
};

type StepExecMode = 'single' | { readonly fanOut: string };

export type StepDef = {
  readonly id: Step;
  readonly label: Text;
  readonly order: number;
  readonly skillRef: SkillRef;
  readonly output?: StepOutput;
  readonly verification?: StepVerification;
  readonly approval?: StepHumanGate;
  readonly escalation?: StepEscalation;
  readonly execMode?: StepExecMode;
};
```

**resolveStepDef 純粋関数**:
```ts
const STEP_CONTRACT_DEFAULTS = {
  output:       { profile: 'step-deliverable' },
  verification: { completenessGate: true },
  approval:     { humanReview: 'visual' },
  escalation:   { onGap: 'descope' },
  execMode:     'single',
} as const;
```

**不変条件(追加)**:
- 全 optional = 後方互換。既存 JSON がそのまま動く
- customizePipeline は既存 validatePipeline を流用(契約フィールドの検証は不要 = optional)

### 3. Question 集約(question.ts) — 拡張

**QuestionKind に descope 追加**(§7.1):
```ts
type DescopePayload = {
  readonly kind: 'descope';
  readonly target: string;
  readonly mode: 'defer' | 'limit';
  readonly reason: Text;
  readonly impact: Text;
  readonly alternatives: readonly Text[];
  readonly recommendation: Text;
};
```

**新コマンド: deferScope**(§7.3):
- approve → backlog Task 直接生成 + resume

### 4. Review 集約(review.ts) — 拡張

**新 ReviewBlock 型**(§5):
```ts
export type ReviewBlock =
  | /* 既存 9 種 */
  | { readonly type: 'completeness'; readonly addressed: readonly string[]; readonly gaps: readonly { readonly reqId: string; readonly reason: Text }[] }
  | { readonly type: 'impact'; readonly affected: readonly Text[]; readonly confirmed: readonly Text[]; readonly unchecked: readonly Text[] }
  | { readonly type: 'decision'; readonly id: string; readonly statement: Text; readonly rationale: Text }
  | { readonly type: 'scope'; readonly included: readonly Text[]; readonly excluded: readonly Text[] }
  | { readonly type: 'parity'; readonly description: Text; readonly passed: boolean }
  | { readonly type: 'handoff'; readonly content: Text }
  | { readonly type: 'pointer'; readonly path: string; readonly summary: Text }
  | { readonly type: 'cause'; readonly proximate: Text; readonly root: Text; readonly processLocus?: { readonly layer: 'skill' | 'harness' | 'gate'; readonly ref: string; readonly defect: Text } }
  | { readonly type: 'prevention'; readonly kind: 'test' | 'design' | 'process'; readonly description: Text; readonly addressesRoot: boolean; readonly link?: string }
  | { readonly type: 'fix'; readonly summary: Text; readonly kind: 'patch' | 'structural' };
```

**coerceBlocks**: KNOWN_BLOCK_TYPES に新 10 型を追加

## 新規 domain オブジェクト(集約ではない)

### BriefIn / BriefOut(§4 — エフェメラル)

永続不要。engine がメモリで保持。正本は aidlc-docs。

```ts
type BriefIn = {
  readonly prevBriefOut?: BriefOut;
  readonly contextRefs: readonly ContextRef[];
  readonly decisions: readonly DecisionSummary[];
  readonly openQuestions: readonly QuestionSummary[];
  readonly requirements: readonly RequirementItem[];
};

type BriefOut = {
  readonly artifacts: readonly ArtifactPointer[];
  readonly decisions: readonly DecisionSummary[];
  readonly openItems: readonly OpenItem[];
  readonly handoff: Text;
};
```

### Profile レジストリ(§5 — データ構造)

```ts
type ArtifactProfile = {
  readonly name: ProfileName;
  readonly requiredBlocks: readonly ReviewBlockType[];
};

const DEFAULT_PROFILES: readonly ArtifactProfile[] = [
  { name: 'step-deliverable', requiredBlocks: ['summary', 'decision', 'completeness', 'impact', 'pointer', 'handoff'] },
  { name: 'bugfix',           requiredBlocks: ['summary', 'decision', 'completeness', 'impact', 'cause', 'fix', 'prevention', 'video'] },
  { name: 'feature',          requiredBlocks: ['summary', 'decision', 'completeness', 'impact', 'ac-map', 'scope'] },
  { name: 'refactor',         requiredBlocks: ['summary', 'decision', 'completeness', 'impact', 'diff', 'parity', 'risk'] },
];
```

### EvaluationCompleted イベント(§8.3)

```ts
type EvaluationCompleted = {
  readonly type: 'EvaluationCompleted';
  readonly runId: RunId;
  readonly generatorRunId: RunId;
  readonly verdict: 'pass' | 'fail' | 'gap';
  readonly gaps: readonly { readonly reqId: string; readonly reason: Text }[];
  readonly proposesDescope?: DescopePayload;
};
```

## v0.0.1 で変更なしの集約

- Task 集約(task.ts): 変更なし
- Facts 集約(facts.ts): 変更なし
- ExternalMemory 集約(external-memory.ts): 変更なし

## 次工程 (S6) への引き継ぎ
- **P1 最優先**: StepDef 拡張(project.ts) + Run.role(cycle.ts) + 新 ReviewBlock(review.ts) + Profile レジストリ新規ファイル
- 既存 88 テストが壊れないこと(後方互換)を S6 の hard gate にする
- BriefIn/BriefOut は P2 で実装(engine 組立時)

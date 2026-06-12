/**
 * 共有ユビキタス語彙: Verdict(Question/Facts 共有) / Step(工程識別子)。
 * S5: 「Verdict は Question/Facts 共有」「Step の正本は共有 types 層」(S6 D-05)。
 */

import type { Text } from "./primitives";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/**
 * 回答の判定(Question の verdict / Facts の verdict が共有)。
 * v0.0.2(S6 descope-policy D-01)で descope の 4 択を追加:
 *   rework=つくる(差し戻し) / descope=見送る / defer=後回し / rewind=前のステップからやり直す。
 * 加法的(既存 kind の verdict 集合には影響しない)。
 */
export type Verdict =
  | "approve"
  | "reject"
  | "answer"
  | "confirm"
  | "rework"
  | "descope"
  | "defer"
  | "rewind";

export const VERDICTS: readonly Verdict[] = [
  "approve",
  "reject",
  "answer",
  "confirm",
  "rework",
  "descope",
  "defer",
  "rewind",
];

/**
 * 工程識別子。意味・数・対応スキルは Project の pipelineDef(StepDef[])で per-PJ 定義(S5 Project D-03)。
 * Step 自体は識別子(branded string)に留め、既定セットは下記。
 */
export type Step = Brand<string, "Step">;

export const Step = (s: string): Step => s as Step;

/**
 * スキル参照(実在する kit/skills の dir 名 / branded string)。
 * v0.0.3: skillRef は domain identity なので shared に置く。`StepDef.skillRef` の型は
 * ここを正本とし、project.ts は re-export する。平易ラベルも CANONICAL_STEPS に同居する
 * (US-02 / 下記)。S6 D-01「ラベルは web」は US-02 に合わせて是正済(S8 U02 backtrack)。
 */
export type SkillRef = Brand<string, "SkillRef">;

export const SkillRef = (s: string): SkillRef => s as SkillRef;

export const sameStep = (a: Step, b: Step): boolean => (a as string) === (b as string);

/**
 * step 正本セット(canonical step set / S6 step-canonical-set)。
 * 「どの工程が在るか + 平易ラベル + 各工程の実 skillRef(kit/skills の実在 dir 名)」の **単一正本**。
 * v2 12 工程(S2.5 退役 / S3 = UI デザインに統一)。
 *
 * ★ ラベルの所在(US-02 AC / Q-01 確定 = binding): 単一 constant が step×平易ラベル×skillRef を持つ
 *    機械可読正本で、`DEFAULT_STEPS` と web `step-label` は **ここから導出**(独自定義の重複を消す)。
 *    S6 step-canonical-set D-01「ラベルは web」は確定済 US-02 と矛盾していたため US-02 に合わせて是正
 *    (S8 U02 で発見・backtrack)。`StepDef.label` 死蔵は snapshot に平易ラベルが入って解消(US-02 D-02)。
 * INV-C1: DEFAULT_STEPS はこのセットの id 射影(集合の正本は 1 箇所)。
 */
export type CanonicalStep = {
  readonly id: Step;
  readonly label: Text;
  readonly skillRef: SkillRef;
};

export const CANONICAL_STEPS: readonly CanonicalStep[] = [
  { id: "S1", label: "要件", skillRef: "aidlc-s1-requirements" },
  { id: "S2", label: "画面", skillRef: "aidlc-s2-wireframe" },
  { id: "S3", label: "UIデザイン", skillRef: "aidlc-s3-ui-design" },
  { id: "S4", label: "技術仕様", skillRef: "aidlc-s4-tech-spec" },
  { id: "S5", label: "分割", skillRef: "aidlc-s5-work-units" },
  { id: "S6", label: "モデル", skillRef: "aidlc-s6-domain-model" },
  { id: "S7", label: "実装", skillRef: "aidlc-s7-domain-code" },
  { id: "S8", label: "統合", skillRef: "aidlc-s8-integration" },
  { id: "S9", label: "検証", skillRef: "aidlc-s9-scenario-validation" },
  { id: "S10", label: "受け入れ", skillRef: "aidlc-s10-human-acceptance" },
  { id: "S11", label: "振り返り", skillRef: "aidlc-s11-retrospective" },
  { id: "S12", label: "改善", skillRef: "aidlc-s12-workflow-improvement" },
].map((c) => ({ id: Step(c.id), label: c.label as Text, skillRef: SkillRef(c.skillRef) }));

/** 既定の工程列 = 正本セットの id 射影(v2 12・S2.5 退役 / INV-C1)。 */
export const DEFAULT_STEPS: readonly Step[] = CANONICAL_STEPS.map((c) => c.id);

/** skillRef(実 dir)を step id から正本セット経由で解決(純粋 / 未知 step は undefined)。 */
export const skillRefOf = (step: Step): SkillRef | undefined =>
  CANONICAL_STEPS.find((c) => sameStep(c.id, step))?.skillRef;

/** 平易ラベルを step id から正本セット経由で解決(純粋 / 未知 step は undefined)。 */
export const labelOf = (step: Step): Text | undefined =>
  CANONICAL_STEPS.find((c) => sameStep(c.id, step))?.label;

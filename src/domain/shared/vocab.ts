/**
 * 共有ユビキタス語彙: Verdict(Question/Facts 共有) / Step(工程識別子)。
 * S5: 「Verdict は Question/Facts 共有」「Step の正本は共有 types 層」(S6 D-05)。
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** 回答の判定(Question の verdict / Facts の verdict が共有)。 */
export type Verdict = "approve" | "reject" | "answer" | "confirm";

export const VERDICTS: readonly Verdict[] = [
  "approve",
  "reject",
  "answer",
  "confirm",
];

/**
 * 工程識別子。意味・数・対応スキルは Project の pipelineDef(StepDef[])で per-PJ 定義(S5 Project D-03)。
 * Step 自体は識別子(branded string)に留め、既定セットは下記。
 */
export type Step = Brand<string, "Step">;

export const Step = (s: string): Step => s as Step;

/** MVP 既定の工程列(kit/skills/aidlc-sN にマッピング)。 */
export const DEFAULT_STEPS: readonly Step[] = [
  "S1",
  "S2",
  "S2.5",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
].map(Step);

export const sameStep = (a: Step, b: Step): boolean => (a as string) === (b as string);

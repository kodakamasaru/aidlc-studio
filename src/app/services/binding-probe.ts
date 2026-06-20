// Binding-rule reach probe (S5 Unit-05 / US-05). Asserts that a kit/rules/*.md
// actually reaches the headless prompt BODY through the composer — not merely
// referenced by a link (a link does not reach a headless run / US-05 D-01).
//
// "Reached" = a distinctive verbatim chunk of the rule's body appears in the
// composed prompt. The probe composes a representative generator prompt for S1
// (the composer injects the binding rules at the prompt head via contractLayer /
// operatingModelLayer), then checks inclusion. A rule whose body is absent
// (only its path is mentioned) → reached:false.
import { PromptComposer } from "./prompt-composer";
import { Step } from "../../domain/shared/vocab";
import type { Fs } from "../ports/sys";

export interface ProbeResult {
  readonly reached: boolean;
  /** The prompt section header the rule body was found under (when reached). */
  readonly injectionPoint?: string;
}

/** Length of the leading body chunk used as the search needle. */
const NEEDLE_LEN = 300;

/**
 * Pure core: is `ruleBody` present (verbatim) in `composedPrompt`?
 * Reports the nearest preceding section header (── … ──) as the injection point.
 */
export function findRuleInPrompt(
  composedPrompt: string,
  ruleBody: string,
): ProbeResult {
  const trimmed = ruleBody.trim();
  if (trimmed.length === 0) return { reached: false };
  const needle = trimmed.slice(0, Math.min(trimmed.length, NEEDLE_LEN));
  const idx = composedPrompt.indexOf(needle);
  if (idx < 0) return { reached: false };
  const before = composedPrompt.slice(0, idx);
  const headers = [...before.matchAll(/──\s*(.+?)\s*──/g)];
  const header = headers.at(-1)?.[1];
  return header !== undefined
    ? { reached: true, injectionPoint: header }
    : { reached: true };
}

/**
 * Compose a representative S1 generator prompt over the given repo. Throws
 * (PromptComposerError) only if the S1 skill 本文 is missing — which is itself a
 * meaningful failure the caller should surface.
 */
export function composeProbePrompt(fs: Fs, repoPath: string): string {
  const composer = new PromptComposer(fs);
  return composer.compose({ role: "generator", step: Step("S1"), repoPath });
}

/**
 * probeRuleReach (US-05 I/F): read the rule at `rulePath` and assert its body
 * reaches a composed headless prompt. Missing/empty rule file → reached:false.
 */
export function probeRuleReach(
  fs: Fs,
  repoPath: string,
  rulePath: string,
): ProbeResult {
  const ruleBody = fs.read(rulePath);
  if (ruleBody === undefined || ruleBody.trim().length === 0) {
    return { reached: false };
  }
  const prompt = composeProbePrompt(fs, repoPath);
  return findRuleInPrompt(prompt, ruleBody);
}

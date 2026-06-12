// PromptComposer — composes a live-run prompt from the SINGLE canonical sources
// (v0.0.3 US-03 / S6 Unit-03). Replaces live.ts's one-sentence stub with a real
// 2-layer prompt:
//   Core   (always): role framing + AI-DLC step identity.
//   Payload(step)  : the skill 本文(kit/skills/{skillRef}/SKILL.md) + the step's
//                    VerificationContract observations (evaluator only).
//
// Source-of-truth boundary (US-01/02/03): the skill 本文 is read via the Fs PORT
// (no infra-direct read here — keeps the app hexagonal), and skillRef is resolved
// from the canonical step set (skillRefOf), so "which skill 本文 to read" comes
// from the same single source the UI/labels derive from. A missing skill dir is an
// EXPLICIT, loud error — never a silent fallback (原則④).
import { join } from "node:path";
import type { Fs } from "../ports/sys";
import type { Text } from "../../domain/shared/primitives";
import { type Step, type SkillRef, skillRefOf } from "../../domain/shared/vocab";

export type ComposeRole = "generator" | "evaluator";

export interface ComposeInput {
  readonly role: ComposeRole;
  readonly step: Step;
  /** Absolute repo path of the target project (its kit/skills holds the 本文). */
  readonly repoPath: string;
  /** Evaluator only: the step's VerificationContract observations (what to check). */
  readonly verification?: readonly Text[];
  /** Override skillRef (e.g. a per-cycle snapshot). Defaults to skillRefOf(step). */
  readonly skillRef?: SkillRef;
}

export class PromptComposerError extends Error {}

/** Where a step's skill 本文 lives, relative to a project repo root. */
export const skillBodyPath = (repoPath: string, skillRef: SkillRef): string =>
  join(repoPath, "kit", "skills", skillRef as string, "SKILL.md");

export class PromptComposer {
  constructor(private readonly fs: Fs) {}

  compose(input: ComposeInput): string {
    const skillRef = input.skillRef ?? skillRefOf(input.step);
    if (skillRef === undefined) {
      throw new PromptComposerError(
        `PromptComposer: no skillRef for step ${input.step as string} ` +
          `(not in the canonical step set).`,
      );
    }
    const path = skillBodyPath(input.repoPath, skillRef);
    const body = this.fs.read(path);
    if (body === undefined || body.trim().length === 0) {
      // Loud, explicit — never compose a prompt off a missing 本文 (原則④).
      throw new PromptComposerError(
        `PromptComposer: skill 本文 not found or empty at ${path} ` +
          `(step ${input.step as string} / skillRef ${skillRef as string}).`,
      );
    }
    return input.role === "evaluator"
      ? this.composeEvaluator(input, skillRef, body)
      : this.composeGenerator(input, skillRef, body);
  }

  private composeGenerator(input: ComposeInput, skillRef: SkillRef, body: string): string {
    return [
      core("generator", input.step, skillRef),
      payloadHeader("あなたが従う方法論(スキル本文)"),
      body.trim(),
      "",
      "上記スキル本文の役割・完了条件・成果物の形式に厳密に従って、この工程の成果物を生成せよ。",
    ].join("\n");
  }

  private composeEvaluator(input: ComposeInput, skillRef: SkillRef, body: string): string {
    const obs = (input.verification ?? []).map((o) => `- ${o as string}`).join("\n");
    return [
      core("evaluator", input.step, skillRef),
      payloadHeader("検証の基準(スキル本文)"),
      body.trim(),
      "",
      obs.length > 0
        ? `次の観点を 1 つずつ検証せよ:\n${obs}`
        : "スキル本文の完了条件に照らして成果物を検証せよ。",
      "",
      // US-04: the verdict must be machine-parseable so the SAME app completeness
      // gate (gap = requirements − addressed) runs on the real model output.
      "検証の最後に、次の形式の JSON を ```json コードブロックで 1 つだけ出力せよ",
      "(requirements = 満たすべき要件の {key, text}、addressed = 対応済みの key 配列。",
      "未充足は addressed に含めない = それが gap。黙って落とすな):",
      '```json',
      '{"requirements":[{"key":"r1","text":"…"}],"addressed":["r1"]}',
      '```',
    ].join("\n");
  }
}

/** Core layer: role + AI-DLC step identity (always present). */
const core = (role: ComposeRole, step: Step, skillRef: SkillRef): string =>
  [
    `あなたは AI-DLC の工程 ${step as string}(${skillRef as string})の` +
      `${role === "evaluator" ? "評価者(evaluator)" : "生成者(generator)"}です。`,
    "AI-DLC はサイクル制の自走開発手法。各工程はスキル本文が定める役割・完了条件に従う。",
    "",
  ].join("\n");

const payloadHeader = (label: string): string => `── ${label} ──`;

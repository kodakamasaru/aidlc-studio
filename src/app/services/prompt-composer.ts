// PromptComposer — composes a live-run prompt from the canonical sources.
// (v0.0.3 US-03 / S6 Unit-03 / BU-1 §C7.1-C7.4)
//
// TWO COMPOSE PATHS (both exported, both backward-compatible):
//
// [Legacy] compose(input: ComposeInput): string
//   ① Core   (always): role framing + AI-DLC step identity.
//   ② skill 本文(kit/skills/{skillRef}/SKILL.md) + ③ the step's VerificationContract
//      observations (evaluator only) = 方法論 + 契約。
//   ④ 前段の文脈(brief / 前段成果物 = aidlc-docs) — contextPaths で渡された
//      brief.md / 前段ステップ成果物。これが US-03 の "3rd source"。
//   Uses flat contextPaths list. Still works unchanged.
//
// [Structured] composeWithStructuredContext(input, ctx): string   ← BU-1 NEW
//   Renders sections 1+2 (role + skill body) PLUS the §C7.1 named sections 3-8
//   from a StructuredContext produced by composeStructuredContext(). Also appends
//   the §C7.4 aidlc-result output-contract instruction so every AI run is told
//   to emit a single ```aidlc-result``` envelope.
//
// Source-of-truth boundary (US-01/02/03): every file is read via the Fs PORT (no
// infra-direct read here — keeps the app hexagonal), and skillRef is resolved from
// the canonical step set (skillRefOf). A missing skill dir is an EXPLICIT, loud
// error; missing 前段文脈 is surfaced as a visible marker (never silently dropped /
// 原則④).
import { join, basename } from "node:path";
import type { Fs } from "../ports/sys";
import type { Text } from "../../domain/shared/primitives";
import { type Step, type SkillRef, skillRefOf } from "../../domain/shared/vocab";
import {
  type StructuredContext,
  renderStructuredContext,
} from "./context-resolver";

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
  /**
   * US-03 3rd source: paths to 前段の文脈(brief / 前段成果物). Read via Fs and
   * injected as a context layer. Defaults to [briefBodyPath(repoPath)] when omitted.
   * Pass [] to opt out explicitly.
   */
  readonly contextPaths?: readonly string[];
}

export class PromptComposerError extends Error {}

/** Where a step's skill 本文 lives, relative to a project repo root. */
export const skillBodyPath = (repoPath: string, skillRef: SkillRef): string =>
  join(repoPath, "kit", "skills", skillRef as string, "SKILL.md");

/** Where the cycle's brief (3rd source の主) lives, relative to a project repo root. */
export const briefBodyPath = (repoPath: string): string =>
  join(repoPath, "aidlc-docs", "brief.md");

/**
 * §C7.4 output-contract instruction appended to ALL structured prompts.
 * AI must emit a single ```aidlc-result``` minified-JSON envelope as its final output.
 * Schema: {artifacts[], questions[], decisions[], completeness{requirements,addressed}, status}.
 */
export const OUTPUT_CONTRACT_INSTRUCTION = [
  "── 出力契約(§C7.4 aidlc-result 必須) ──",
  "この工程の最後に、以下の形式の minified JSON を ```aidlc-result``` フェンスブロックで",
  "1 つだけ出力せよ(複数不可 / 末尾に必ず出力 / 本文テキストのみでは不可):",
  "",
  "```aidlc-result",
  '{"artifacts":["aidlc-docs/{version}/sN/index.md"],"questions":[],"decisions":[],"completeness":{"requirements":[{"key":"r1","text":"要件の説明"}],"addressed":["r1"]},"status":"needs_human"}',
  "```",
  "",
  "フィールド定義:",
  "- artifacts[]: 生成・更新した成果物の aidlc-docs パス(本文はファイルに書く / エンベロープに載せない)",
  "- questions[]: 人間への質問(aidlc-question schema: id/prompt/background/options[{id,label,hint,recommended}]/answerKind)",
  "  - ★おすすめは options の中にちょうど 1 つ(recommended:true が厳密に 1 件)",
  "  - 質問がない場合は空配列 []",
  "- decisions[]: AI が独自に決めた事項({id,decision,reason} — 理由必須)",
  "- completeness: {requirements:[{key,text}], addressed:[key]} — 未充足は addressed に含めない",
  "- status: \"done\" | \"needs_human\" | \"stalled\"",
  "  - done: 人間ゲート不要で前進可(完了条件を完全に充足)",
  "  - needs_human: 人間のレビュー / 承認が必要",
  "  - stalled: 続行不能(理由は decisions に書く)",
  "  - questions[] が空でない場合は status=\"needs_human\" にすること",
].join("\n");

export class PromptComposer {
  constructor(private readonly fs: Fs) {}

  /**
   * [Legacy] Compose a prompt using flat contextPaths (backward compat).
   * Sections 1+2+context layer only. No aidlc-result instruction added.
   * All existing tests use this path unchanged.
   */
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
    const context = this.contextLayer(input);
    return input.role === "evaluator"
      ? this.composeEvaluator(input, skillRef, body, context)
      : this.composeGenerator(input, skillRef, body, context);
  }

  /**
   * [Structured / BU-1] Compose a prompt using a pre-built StructuredContext (§C7.1-C7.4).
   *
   * Renders:
   *   • Section 1: role/identity (core header)
   *   • Section 2: skill 本文 (methodology)
   *   • Sections 3-8: rendered from ctx (productInvariant / requirements /
   *     priorArtifacts / decisionsLedger / dialogState / outputContract)
   *   • Output-contract instruction (§C7.4 aidlc-result)
   *
   * Invariant: section 3 (brief) is always present because composeStructuredContext
   * always populates productInvariant (even as a missing-marker). Evaluator mode
   * adds verification observations before the output-contract instruction.
   */
  composeWithStructuredContext(
    input: Omit<ComposeInput, "contextPaths">,
    ctx: StructuredContext,
  ): string {
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
      throw new PromptComposerError(
        `PromptComposer: skill 本文 not found or empty at ${path} ` +
          `(step ${input.step as string} / skillRef ${skillRef as string}).`,
      );
    }

    const contextRendered = renderStructuredContext(ctx);

    if (input.role === "evaluator") {
      const obs = (input.verification ?? []).map((o) => `- ${o as string}`).join("\n");
      return [
        core("evaluator", input.step, skillRef),
        payloadHeader("検証の基準(スキル本文)"),
        body.trim(),
        "",
        contextRendered,
        "",
        obs.length > 0
          ? `次の観点を 1 つずつ検証せよ:\n${obs}`
          : "スキル本文の完了条件に照らして成果物を検証せよ。",
        "",
        OUTPUT_CONTRACT_INSTRUCTION,
      ].join("\n");
    }

    return [
      core("generator", input.step, skillRef),
      payloadHeader("あなたが従う方法論(スキル本文)"),
      body.trim(),
      "",
      contextRendered,
      "",
      "上記スキル本文の役割・完了条件・成果物の形式に厳密に従い、前段の文脈(brief / 前段成果物)を踏まえて、この工程の成果物を生成せよ。",
      "",
      OUTPUT_CONTRACT_INSTRUCTION,
    ].join("\n");
  }

  /**
   * US-03 3rd source: read 前段の文脈(brief / 前段成果物) via Fs and render a layer.
   * Defaults to the cycle brief when no contextPaths are given. Unreadable paths are
   * surfaced as a visible marker (never silently dropped / 原則④). Returns "" when
   * the caller opts out with an empty list.
   */
  private contextLayer(input: ComposeInput): string {
    const paths = input.contextPaths ?? [briefBodyPath(input.repoPath)];
    if (paths.length === 0) return "";
    const parts = paths.map((p) => {
      const content = this.fs.read(p);
      const name = basename(p);
      return content !== undefined && content.trim().length > 0
        ? `【${name}】\n${content.trim()}`
        : `【${name}】※ 前段文脈が見つかりません(${p})`;
    });
    return [payloadHeader("前段の文脈(brief / 前段成果物)"), parts.join("\n\n"), ""].join("\n");
  }

  private composeGenerator(
    input: ComposeInput,
    skillRef: SkillRef,
    body: string,
    context: string,
  ): string {
    return [
      core("generator", input.step, skillRef),
      payloadHeader("あなたが従う方法論(スキル本文)"),
      body.trim(),
      "",
      context,
      "上記スキル本文の役割・完了条件・成果物の形式に厳密に従い、前段の文脈(brief / 前段成果物)を踏まえて、この工程の成果物を生成せよ。",
    ].join("\n");
  }

  private composeEvaluator(
    input: ComposeInput,
    skillRef: SkillRef,
    body: string,
    context: string,
  ): string {
    const obs = (input.verification ?? []).map((o) => `- ${o as string}`).join("\n");
    return [
      core("evaluator", input.step, skillRef),
      payloadHeader("検証の基準(スキル本文)"),
      body.trim(),
      "",
      context,
      obs.length > 0
        ? `次の観点を 1 つずつ検証せよ:\n${obs}`
        : "スキル本文の完了条件に照らして成果物を検証せよ。",
      "",
      // US-04: the verdict must be machine-parseable so the SAME app completeness
      // gate (gap = requirements − addressed) runs on the real model output.
      "検証の最後に、次の形式の JSON を ```json コードブロックで 1 つだけ出力せよ",
      "(requirements = 満たすべき要件の {key, text}、addressed = 対応済みの key 配列。",
      "未充足は addressed に含めない = それが gap。黙って落とすな):",
      "```json",
      '{"requirements":[{"key":"r1","text":"…"}],"addressed":["r1"]}',
      "```",
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

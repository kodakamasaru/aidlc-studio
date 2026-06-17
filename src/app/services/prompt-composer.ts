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
 * 最上位 binding contract (責務契約). Canonical single source — injected verbatim
 * into EVERY live prompt's head so the 4 gates (①内部コード非前提 ②human-gateのみ停止
 * ③done=納品 ④US+mock最上位) actually reach the headless AI. The file itself declares
 * "将来の live prompt 組立はここを指すだけ" — referencing it by link does not reach a
 * headless run, so the composer reads the one canonical file and renders it (NOT a
 * duplicate of the text — same source-of-truth file rendered at runtime).
 */
export const responsibilityContractPath = (repoPath: string): string =>
  join(repoPath, "kit", "rules", "responsibility-contract.md");

/**
 * 運用モデル(AI-DLC v2 の実行規範)。PhaseGroup 構造 / S3↔S7 境界 / mock 突合の完全性
 * ゲート / Rule A・B / AC 起点レビュー pipeline / 視覚証拠ゲート など、全工程に binding な
 * 実行規範の正本。責務契約と同じ doctrine(リンクでは headless run に届かない → 正本ファイル
 * を runtime 描画)で、責務契約の直後(= 契約に次ぐ上位層)に注入する。これが無いと headless
 * worker には固めた運用ゲートが一切届かない(従来 0 参照の孤児ファイルだった)。
 */
export const operatingModelPath = (repoPath: string): string =>
  join(repoPath, "kit", "rules", "aidlc-operating-model.md");

/**
 * §C7.4 output-contract instruction appended to ALL structured prompts.
 * AI must emit a single ```aidlc-result``` minified-JSON envelope as its final output.
 * Schema: {artifacts[], questions[], decisions[], completeness{requirements,addressed}, status}.
 */
export const OUTPUT_CONTRACT_INSTRUCTION = [
  "── 対人契約(最上位・必須) ──",
  "人間は aidlc-docs の md を開かない・編集しない。md の唯一の書き手は AI(=あなた)。",
  "人間への質問・確認・選択・レビュー・承認は、すべて下記 questions[](= 人間が見るカード)で求めよ。",
  "**禁止**: 「md を IDE で開いて回答/判断行に記入してください」「各 md を確認して直接書き込んでください」",
  "のように人間に md 編集を求める誘導。人間はボード/受信箱しか見ない。回答が要るものは必ず questions[] に入れ、",
  "人間の回答が返ったら AI 自身が md の該当箇所(回答/確定/判断 等)に代筆する。",
  "人間は web のカード/受信箱しか見ず **ファイルを開けない**。質問・レビューの中身は questions[] の",
  "prompt/background に**全文インラインで**載せよ。「○○.md を参照」「aidlc-docs/… を見て」のような",
  "ファイル名/パス参照で代用するな(人間はそのファイルを開けない)。成果物はプラットフォームが描画するので、",
  "指すなら『要件一覧』等の事業語で指す。",
  "**サーバ内部情報は秘匿**: ファイルパス・内部 ID・関数/型名・Run/worktree/Phase・DB フィールド・",
  "aidlc-docs のディレクトリ構造などを、人間が読む文(prompt/background/options/decisions 等)に出すな",
  "(判断に必要なら事業語へ翻訳する)。",
  "",
  "── 言語(必須) ──",
  "成果物・質問(prompt/background/options のラベル等)・decisions・説明など、人間が読む文章は",
  "**すべて日本語**で書け。コード・識別子・ファイルパス・固有名詞はそのままでよいが、地の文は日本語。",
  "英語で回答しない。",
  "",
  "── 出力契約(§C7.4 aidlc-result 必須) ──",
  "この工程の最後に、以下の形式の minified JSON を ```aidlc-result``` フェンスブロックで",
  "1 つだけ出力せよ(複数不可 / 末尾に必ず出力 / 本文テキストのみでは不可):",
  "",
  "```aidlc-result",
  '{"artifacts":["aidlc-docs/{version}/sN/index.md"],"questions":[],"decisions":[],"completeness":{"requirements":[{"key":"r1","text":"要件の説明"}],"addressed":["r1"]},"status":"needs_human"}',
  "```",
  "",
  "フィールド定義:",
  "- artifacts[]: 生成・更新した成果物の aidlc-docs パス(本文はファイルに書く / エンベロープに載せない)。",
  "  パスは必ず上記『成果物の書き込み先』で指定された版数ディレクトリ配下の実パスにせよ。",
  "  上記例の {version} / sN はプレースホルダ — そのまま書くな / 版数を自分で創作するな(指定された版数を使う)。",
  "- questions[]: 人間への質問(aidlc-question schema: id/prompt/background/options[{id,label,hint,recommended}]/answerKind)",
  "  - answerKind は必ず \"single\"(単一選択) / \"multi\"(複数選択) / \"free\"(自由記述)のいずれか。",
  "    \"single_select\" 等の別表記は不正でブロック全体が破棄される。この 3 値以外を使うな。",
  "  - **人間に確認・質問・選択・不足情報を求めたいことが少しでもあれば、必ず questions[] に入れよ**。",
  "    質問を成果物本文や status で代用するな。questions[] に入れたものだけが「回答できる質問カード」になる。",
  "  - questions[] を空にしてよいのは、成果物が完成して人間に**レビュー / 承認**だけを求めるときのみ",
  "    (空 = レビューカードになる)。聞きたいことがあるのにレビューにするな。",
  "  - answerKind=\"single\"/\"multi\": options は非空。★おすすめは options の中にちょうど 1 つ(recommended:true が厳密に 1 件)",
  "  - answerKind=\"free\"(自由記述): options は空配列 [] にせよ(recommended も不要)。選択肢を作るな。",
  "  - 質問がない場合は questions[] 自体を空配列 []",
  "- decisions[]: AI が独自に決めた事項({id,decision,reason} — 理由必須)",
  "- completeness: {requirements:[{key,text}], addressed:[key]} — 未充足は addressed に含めない",
  "- status: \"done\" | \"needs_human\" | \"stalled\"",
  "  - done: 人間ゲート不要で前進可(完了条件を完全に充足)",
  "  - needs_human: 人間のレビュー / 承認が必要、または questions[] に質問がある",
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
   * US-08 / O5: bespoke prompt for the reconstruction-proposal run. Reconstruction
   * is a meta-step (no kit/skills 本文), fired once right after S1 確定. The live run
   * reads THIS cycle's S1 output (US群) + brief from aidlc-docs/ with its own tools,
   * then proposes the PENDING pipeline (S1 is already fixed — AC-5). Output is a
   * single ```aidlc-reconstruction``` block (scope:"cycle"), all human text 日本語.
   */
  composeReconstruction(repoPath: string): string {
    const docsDir = join(repoPath, "aidlc-docs");
    return [
      "あなたは AI-DLC の工程再構成器です。S1(要件)が確定した直後に、このサイクルの工程を US に合わせて1回だけ組み直します(US-08)。",
      "",
      this.contractLayer(repoPath),
      this.operatingModelLayer(repoPath),
      "",
      "── 入力(自分のツールで読め) ──",
      `- ${docsDir} 配下の最新バージョンの s1/(index + US 群)を Glob/Read で読む。brief(${docsDir}/ 直下の brief)も読む。`,
      "- 既定工程は S1〜S12(Discovery/Design/Build/Validation/Improvement)。skillRef は aidlc-sN-* 形式。",
      "",
      "── やること ──",
      "US と brief から、この案件に本当に必要な工程列へ組み直す。工程の keep/delete/並べ替え/独自工程の新設、各工程のルール本文(instruction)の作り直しを含む。変化なし(既定のまま keep)もありうる。",
      "**S1 は着手済み(確定)なので steps に含めない**。残り(pending)の工程のみを提案する(AC-5)。",
      "",
      "── 出力(必須) ──",
      "最後に下記スキーマの minified JSON を ```aidlc-reconstruction``` フェンスで1つだけ出力せよ(散文だけは不可 / 末尾に必ず出力):",
      "```aidlc-reconstruction",
      '{"scope":"cycle","steps":[{"id":"S2","label":"画面","order":0,"skillRef":"aidlc-s2-wireframe","instruction":"この工程のルール本文(日本語・何をどう作るか)","diff":"keep","reason":"根拠(任意)"}]}',
      "```",
      "フィールド: scope=\"cycle\"。steps[] は非空・各要素に id / label / order(0始まり連番) / skillRef / instruction(ルール本文・日本語) / diff(\"keep\"|\"add\"|\"delete\"|\"current\")。diff=\"delete\" のときは reason 必須。",
      "label・instruction・reason など人間が読む文字列はすべて日本語。",
    ].join("\n");
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
        this.contractLayer(input.repoPath),
        this.operatingModelLayer(input.repoPath),
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
      this.contractLayer(input.repoPath),
      this.operatingModelLayer(input.repoPath),
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
  /**
   * 最上位 binding contract layer — read the canonical responsibility-contract.md via
   * Fs and render it at the HEAD of every prompt (it wins on conflict with skills, so
   * it must be seen first). Missing = loud visible marker (原則④): the supreme contract
   * silently absent would let the AI run un-gated, so we surface it rather than drop it.
   */
  private contractLayer(repoPath: string): string {
    const path = responsibilityContractPath(repoPath);
    const body = this.fs.read(path);
    const header = payloadHeader(
      "最上位契約 — AI 開発部 ⇄ 事業部(全工程 binding / 他ルールと衝突したらこれが勝つ)",
    );
    if (body !== undefined && body.trim().length > 0) {
      return [header, body.trim(), ""].join("\n");
    }
    return [header, `※ 最上位契約が見つかりません(${path})— 出力前に 4 ゲートを自問せよ`, ""].join(
      "\n",
    );
  }

  /**
   * 運用モデル layer — canonical aidlc-operating-model.md を Fs 経由で読み、責務契約の直後に
   * 描画する(契約に次ぐ binding な実行規範)。headless run はリンクを辿れない前提なので、
   * contractLayer と同じく正本ファイルを runtime 注入する(複製ではない)。不在は loud な可視
   * マーカー(原則④): 運用ゲートが黙って抜けると mock 突合・S3/S7 境界等が効かなくなるため。
   */
  private operatingModelLayer(repoPath: string): string {
    const path = operatingModelPath(repoPath);
    const body = this.fs.read(path);
    const header = payloadHeader(
      "運用モデル — AI-DLC v2 実行規範(全工程 binding / 責務契約に次ぐ上位 / 運用ゲートの正本)",
    );
    if (body !== undefined && body.trim().length > 0) {
      return [header, body.trim(), ""].join("\n");
    }
    return [header, `※ 運用モデルが見つかりません(${path})— 運用ゲート不在のまま進めるな`, ""].join(
      "\n",
    );
  }

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
      this.contractLayer(input.repoPath),
      this.operatingModelLayer(input.repoPath),
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
      this.contractLayer(input.repoPath),
      this.operatingModelLayer(input.repoPath),
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

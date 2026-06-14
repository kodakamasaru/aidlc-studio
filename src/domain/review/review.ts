/**
 * 集約: Result(レビュー成果 / block-stream)(S5 result.md)。
 *
 * 命名(S6 D-07): S5 のユビキタス語「Result」は本コードの `Result<T,E>` モナドと衝突するため、
 * 型名は `Review` とする(= レビュー成果 dossier)。ReviewBlock はその内部 VO。
 *
 * 純粋(D-03): 生成後不変のスナップショット(INV-1)。ReviewBlock は identity を持たない VO。
 */

import type { Instant, Text } from "../shared/primitives";
import type { Step } from "../shared/vocab";
import type { CycleId, RunId, TaskId } from "../shared/ids";
import type { CompletenessBlock } from "./brief";
import type { ResultDecision } from "../events/events";

// ── ReviewBlock(判別可能ユニオン / 共有 types 層の正本。S3 Unit-04) ──
export type ReviewBlock =
  | { readonly type: "summary"; readonly title: Text; readonly body: Text }
  | { readonly type: "ac-map"; readonly items: readonly { readonly ac: Text; readonly status: Text }[] }
  | { readonly type: "mermaid"; readonly src: Text }
  | { readonly type: "screenshot"; readonly src: Text; readonly caption: Text }
  | { readonly type: "test"; readonly passed: number; readonly total: number; readonly detail?: Text }
  | { readonly type: "coverage"; readonly pct: number; readonly byFile?: readonly { readonly path: Text; readonly pct: number }[] }
  | { readonly type: "risk"; readonly level: "low" | "med" | "high"; readonly note: Text }
  | { readonly type: "diff"; readonly summary: Text; readonly files: readonly { readonly path: Text; readonly add: number; readonly del: number }[] }
  | { readonly type: "video"; readonly src: Text; readonly poster: Text };

export type ReviewBlockType = ReviewBlock["type"];

/** MVP で描画する軽量 4 種(残りは型予約・レンダラ後追い)。 */
export const MVP_BLOCK_TYPES: ReadonlySet<ReviewBlockType> = new Set([
  "summary",
  "ac-map",
  "mermaid",
  "screenshot",
]);

/**
 * 既知 block 型の正本(S6 artifact-profile: 「block 型の正本は review.ts」)。
 * Profile はこれを参照する側(逆流させない)。export して profile.ts が missing 算出に使う。
 */
export const KNOWN_BLOCK_TYPES: ReadonlySet<ReviewBlockType> = new Set([
  "summary",
  "ac-map",
  "mermaid",
  "screenshot",
  "test",
  "coverage",
  "risk",
  "diff",
  "video",
]);

export const isKnownBlockType = (type: string): boolean =>
  (KNOWN_BLOCK_TYPES as ReadonlySet<string>).has(type);

// ── 集約ルート Review(= S5 Result。生成後不変のスナップショット) ──
export type Review = {
  readonly runId: RunId;
  readonly cycleId: CycleId;
  readonly step: Step;
  /** この成果が対応する Task。null = Cycle 単位(S4/S5 等のアーキ成果)。INV-6。 */
  readonly taskId: TaskId | null;
  readonly blocks: readonly ReviewBlock[];
  readonly producedAt: Instant;
  /**
   * S8 手戻り追補(加法 optional): evaluator 成果の完全性ブロック(requirements ↔
   * addressed)。これがあると web が completeness table を描画できる(scope K / 原則#3:
   * コードを読まず承認)。欠落=従来動作(generator や role 無し Run)。
   */
  readonly completeness?: CompletenessBlock;
  /**
   * BU-2 (v0.0.4 / 加法 optional): aidlc-result エンベロープから搬送する
   * 成果物パス一覧(aidlc-docs 相対パス)。欠落=従来動作。
   */
  readonly artifacts?: readonly string[];
  /**
   * BU-2 (v0.0.4 / 加法 optional): aidlc-result エンベロープから搬送する
   * AI が独自に決めた事項(D-NN)一覧。欠落=従来動作。
   */
  readonly decisions?: readonly ResultDecision[];
};

export type BuildReviewCmd = {
  readonly runId: RunId;
  readonly cycleId: CycleId;
  readonly step: Step;
  readonly taskId?: TaskId;
  readonly blocks: readonly ReviewBlock[];
  readonly producedAt: Instant;
  readonly completeness?: CompletenessBlock;
  readonly artifacts?: readonly string[];
  readonly decisions?: readonly ResultDecision[];
};

/** buildResult: `ResultEmitted` 受信で Review を構築(Task 単位 or Cycle 単位)。INV-1。 */
export const buildReview = (cmd: BuildReviewCmd): Review => ({
  runId: cmd.runId,
  cycleId: cmd.cycleId,
  step: cmd.step,
  taskId: cmd.taskId ?? null,
  blocks: cmd.blocks,
  producedAt: cmd.producedAt,
  ...(cmd.completeness !== undefined ? { completeness: cmd.completeness } : {}),
  ...(cmd.artifacts !== undefined ? { artifacts: cmd.artifacts } : {}),
  ...(cmd.decisions !== undefined ? { decisions: cmd.decisions } : {}),
});

/** この Review が Task 単位か(taskId あり)。 */
export const isTaskScoped = (review: Review): boolean => review.taskId !== null;

/**
 * 前方互換(INV-2): 永続/受信した生 block 列から、既知 type だけを Review 用に採用し、
 * 未知 type は skipped に分離して返す(エラーにしない / warn はレンダラ側)。純粋。
 *
 * 命名(S7 D-01): 旧名 `coerceBlocks`。Profile 照合版 `coerceBlocks(profile, raw)`(profile.ts)が
 * この型レベル前方互換を前段で内部再利用するため、型フィルタ側は `filterKnownBlocks` に改名した。
 */
export const filterKnownBlocks = (
  raw: readonly { readonly type: string }[],
): { readonly blocks: readonly ReviewBlock[]; readonly skipped: readonly string[] } => {
  const blocks: ReviewBlock[] = [];
  const skipped: string[] = [];
  for (const b of raw) {
    if (isKnownBlockType(b.type)) blocks.push(b as ReviewBlock);
    else skipped.push(b.type);
  }
  return { blocks, skipped };
};

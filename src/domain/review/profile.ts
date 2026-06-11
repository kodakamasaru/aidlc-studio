/**
 * 成果物プロファイル(S6 artifact-profile)。Review 域の純粋データ + 純粋関数。
 *
 * Profile = `taskKind → 必須 block 集合`。「この種別の成果物はこの block が揃って初めて完全」の宣言。
 * coerceBlocks = 成果物の block 列を Profile に照らして矯正(未知捨て + 不足を warn)。throw しない(前方互換)。
 *
 * 純粋(S6 D-01/D-02): block 型の正本は review.ts(`KNOWN_BLOCK_TYPES`)。Profile は参照する側。
 * block の意味的妥当性は evaluator(AI)の領域。ここは「必須 block 型が揃っているか」の機械判定のみ。
 */

import type { TaskKind } from "../task/task";
import {
  type ReviewBlock,
  type ReviewBlockType,
  KNOWN_BLOCK_TYPES,
  filterKnownBlocks,
} from "./review";

/** taskKind → 必須 block 型集合(既存 ReviewBlockType の部分集合。二重定義しない)。 */
export type Profile = {
  readonly taskKind: TaskKind;
  readonly requiredBlocks: readonly ReviewBlockType[];
};

/**
 * bugfix dossier(S6 / US-05): cause(2層)/ impact / fix / prevention / video。
 * 新 block 型を増やさず既存型の構造化メタで表現(S5 Unit-01 D-02)。
 * requiredBlocks は「揃うべき block 型」: 振る舞い説明=summary / 影響=risk / 修正差分=diff /
 * 証拠=screenshot・video / 検証=test。cause 2層 等の意味構造は block 内メタが持つ(型は増やさない)。
 */
const BUGFIX_DOSSIER_PROFILE: Profile = {
  taskKind: "bugfix",
  requiredBlocks: ["summary", "risk", "diff", "screenshot", "test", "video"],
};

/** profileRegistry: taskKind から Profile を引く純粋データ。未知種別は緩い既定(必須なし)。 */
const REGISTRY: Readonly<Record<TaskKind, Profile>> = {
  bugfix: BUGFIX_DOSSIER_PROFILE,
};

/** 未知 taskKind の既定 Profile(必須 block なし = 緩い)。 */
export const emptyProfile = (taskKind: TaskKind): Profile => ({
  taskKind,
  requiredBlocks: [],
});

/** lookupProfile: taskKind から Profile を引く。未知は緩い既定。 */
export const lookupProfile = (taskKind: TaskKind): Profile =>
  REGISTRY[taskKind] ?? emptyProfile(taskKind);

export type CoerceResult = {
  readonly kept: readonly ReviewBlock[]; // 既知 type の block(未知は捨てる)
  readonly missing: readonly ReviewBlockType[]; // Profile 必須のうち未充足(warn)
};

/**
 * coerceBlocks(S6 artifact-profile / S7 D-01): 成果物 block 列を Profile に照らして矯正(全域・副作用なし)。
 * (1) 未知 type を捨てる(`filterKnownBlocks` を内部再利用 = 型レベル前方互換)。
 * (2) Profile 必須 block のうち kept に存在しない type を `missing` として返す(throw しない = warn のみ)。
 * Profile に block 型を足しても古い成果物は missing を返すだけで壊れない(前方互換 / S6 D-02)。
 */
export const coerceBlocks = (
  profile: Profile,
  raw: readonly { readonly type: string }[],
): CoerceResult => {
  const { blocks: kept } = filterKnownBlocks(raw);
  const present = new Set<ReviewBlockType>(kept.map((b) => b.type));
  const missing = profile.requiredBlocks.filter(
    (t) => KNOWN_BLOCK_TYPES.has(t) && !present.has(t),
  );
  return { kept, missing };
};

/** isComplete: Profile 必須 block が全て揃っているか(missing が空)。 */
export const isComplete = (result: CoerceResult): boolean =>
  result.missing.length === 0;

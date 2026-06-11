/**
 * Step 契約(S6 step-contracts)。Project 集約内 StepDef の VO 拡張。
 *
 * Step が「何を出す / 何で検証 / いつ人間へ / 詰まったら」を宣言する 4 契約 + 実行モード。
 * 全 optional(欠落 = 従来動作 / 後方互換 155→182 tests 回帰)。`validatePipeline` の検証対象外。
 *
 * 純粋(S6 D-01): 契約の正本(既定)はコードの `DEFAULT_STEP_CONTRACTS`、上書きは
 * StepDef.contracts(Project の pipelineDef JSON に同居)。新テーブル/新集約は作らない(S4 D-01)。
 * 各サブ契約のフィールドは最小から(S7 D-05 / S6 Q-01)。
 */

import type { Text } from "../shared/primitives";
import type { Step } from "../shared/vocab";
import type { TaskKind } from "../task/task";

/** 何を出すか。必須 block 集合は Profile(taskKind)を参照し二重定義しない(S6)。 */
export type OutputContract = {
  readonly profileKind?: TaskKind; // artifact-profile の profileRegistry を引くキー
  readonly artifactGlob?: Text; // 成果物パス(例: "aidlc-docs/{version}/s7-*.md")
};

/** 何で検証するか。evaluator が見る観点(平易文の列)。 */
export type VerificationContract = {
  readonly observations: readonly Text[];
};

/** いつ人間に渡すか。視覚レビュー / 実機確認 / なし。 */
export type HumanGateContract = {
  readonly mode: "visual_review" | "device_check" | "none";
  readonly note?: Text;
};

/** 詰まったときの戻り先・retry 方針。 */
export type EscalationContract = {
  readonly onStall: "retry" | "backtrack" | "human";
  readonly backtrackTo?: Step;
  readonly maxRetry?: number;
};

/** Step の振る舞い宣言(4 契約を内包する VO)。全フィールド optional。 */
export type StepContracts = {
  readonly output?: OutputContract;
  readonly verification?: VerificationContract;
  readonly humanGate?: HumanGateContract;
  readonly escalation?: EscalationContract;
};

/** 実行モード(VO / enum)。 */
export type ExecMode = "sequential" | "parallel";

/** Step id → 既定契約のレジストリ(正本)。既定は空(YAGNI / S7 D-05)。上書きは pipelineDef。 */
export const DEFAULT_STEP_CONTRACTS: Readonly<Record<string, StepContracts>> = {};

/** resolveContracts: pipelineDef の上書きを既定レジストリより優先して解決(純粋)。 */
export const resolveContracts = (
  stepDef: { readonly id: Step; readonly contracts?: StepContracts },
  registry: Readonly<Record<string, StepContracts>> = DEFAULT_STEP_CONTRACTS,
): StepContracts | undefined =>
  stepDef.contracts ?? registry[stepDef.id as string];

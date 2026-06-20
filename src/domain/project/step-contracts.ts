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

/**
 * 技術 step(S7/S8/S9)共通の検証観点(STANCE: ユーザー目線の証拠)。
 * evaluator(= 成果物を作っていない独立レビュア run)はこの観点で証拠を監査し、
 * 「非コードのレビュアが見て安全にリリースできると確信できるか」を判定する(Rule C-3)。
 * generic + 再利用可能に保ち、各 step は同一観点を共有する。
 */
export const LIVE_EVIDENCE_OBSERVATIONS: readonly Text[] = [
  "各 US の受け入れ条件がユーザー目線の動作(実機 screenshot/動画/実行ログ)で示されている" as Text,
  "内部語(関数名/JSON/ok=true/test 緑)でなく非コードのレビュアーが見て分かる証拠である" as Text,
  "到達不可/不要扱いで省略された US が無い" as Text,
];

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

/** Step の振る舞い宣言(契約を内包する VO)。全フィールド optional。 */
export type StepContracts = {
  readonly output?: OutputContract;
  readonly verification?: VerificationContract;
  readonly humanGate?: HumanGateContract;
  readonly escalation?: EscalationContract;
  /**
   * US-01: この step の done を live 証拠(縦経路ログ + 視覚/動作証拠)の存在で機械検証するか。
   * true の技術 step は、role-less(直接 done)/ gen→eval(evaluator allow-done)いずれの経路でも
   * 証拠ゲートを通る。欠落 = 不要(従来の hearing/設計 step は false)。
   */
  readonly requiresLiveEvidence?: boolean;
};

/** 実行モード(VO / enum)。 */
export type ExecMode = "sequential" | "parallel";

/**
 * Step id → 既定契約のレジストリ(正本)。このリポジトリ(aidlc-studio)の実設定。
 *
 * 設計判断(S10 F-2):
 * - profileKind: profileRegistry の実在キーは "bugfix" のみ(profile.ts REGISTRY 参照)。
 *   S1〜S12 の成果物は bugfix ではないため profileKind は設定しない。artifactGlob のみで成果物を示す。
 * - humanGate: 責務契約「人間はコードを見ない / 視覚+シナリオのみ」に従う。
 *   S8=実装統合 → device_check。S9=シナリオ+視覚 → visual_review。S10=受け入れ → device_check。
 *   S7=純粋ドメインコード・人間はコードを見ない方針 → none。S11/S12=内部振り返り → none。
 *   その他 S1〜S6 = 出力物の視覚確認 → visual_review。
 * - escalation: 基本は retry × 3。S10(受け入れ)は human(人間がゲートを持つ)。
 * - artifactGlob: kit/skills/aidlc-sN の SKILL.md「出力」記載パスを参考に設定。
 *
 * 上書きは pipelineDef の StepDef.contracts が優先(resolveContracts 参照)。
 */
export const DEFAULT_STEP_CONTRACTS: Readonly<Record<string, StepContracts>> = {
  S1: {
    output: { artifactGlob: "aidlc-docs/{version}/s1/**" as Text },
    humanGate: { mode: "visual_review" },
    escalation: { onStall: "retry", maxRetry: 3 },
  },
  S2: {
    output: { artifactGlob: "aidlc-docs/{version}/s2/**" as Text },
    humanGate: { mode: "visual_review" },
    escalation: { onStall: "retry", maxRetry: 3 },
  },
  S3: {
    output: { artifactGlob: "aidlc-docs/{version}/s3/**" as Text },
    humanGate: { mode: "visual_review" },
    escalation: { onStall: "retry", maxRetry: 3 },
  },
  S4: {
    output: { artifactGlob: "aidlc-docs/{version}/s4-*.md" as Text },
    humanGate: { mode: "visual_review" },
    escalation: { onStall: "retry", maxRetry: 3 },
  },
  S5: {
    output: { artifactGlob: "aidlc-docs/{version}/s5/**" as Text },
    humanGate: { mode: "visual_review" },
    escalation: { onStall: "retry", maxRetry: 3 },
  },
  S6: {
    output: { artifactGlob: "aidlc-docs/{version}/s6/**" as Text },
    humanGate: { mode: "visual_review" },
    escalation: { onStall: "retry", maxRetry: 3 },
  },
  S7: {
    // 純粋ドメインコード — 人間はコードを見ない方針(責務契約)。技術 step ゆえ live 証拠必須(test-report 等)。
    // verification: 生成者と別の独立レビュア run が証拠を STANCE(ユーザー目線)で監査してから人間へ。
    output: { artifactGlob: "src/domain/**" as Text },
    verification: { observations: LIVE_EVIDENCE_OBSERVATIONS },
    humanGate: { mode: "none" },
    escalation: { onStall: "retry", maxRetry: 3 },
    requiresLiveEvidence: true,
  },
  S8: {
    // 実装統合 — 実機+視覚レビュー必須(CLAUDE.md human-gate 強調)。live 証拠ハードゲート対象(US-01)。
    output: { artifactGlob: "src/**" as Text },
    verification: { observations: LIVE_EVIDENCE_OBSERVATIONS },
    humanGate: { mode: "device_check" },
    escalation: { onStall: "retry", maxRetry: 3 },
    requiresLiveEvidence: true,
  },
  S9: {
    // シナリオ検証 — シナリオ+視覚証拠(CLAUDE.md)。live 証拠ハードゲート対象(US-01)。
    output: { artifactGlob: "tests/e2e/**" as Text },
    verification: { observations: LIVE_EVIDENCE_OBSERVATIONS },
    humanGate: { mode: "visual_review" },
    escalation: { onStall: "retry", maxRetry: 3 },
    requiresLiveEvidence: true,
  },
  S10: {
    // 受け入れ — 人間による最終受け入れ(onStall=human でゲートを人間が持つ)
    output: { artifactGlob: "aidlc-docs/{version}/s10-acceptance.md" as Text },
    humanGate: { mode: "device_check" },
    escalation: { onStall: "human" },
  },
  S11: {
    // 振り返り — 内部のみ、人間は読む(視覚確認不要)
    output: { artifactGlob: "aidlc-docs/{version}/s11-retrospective.md" as Text },
    humanGate: { mode: "none" },
    escalation: { onStall: "retry", maxRetry: 3 },
  },
  S12: {
    // 改善提案 — 内部のみ
    output: { artifactGlob: "aidlc-docs/{version}/s12-*.md" as Text },
    humanGate: { mode: "none" },
    escalation: { onStall: "retry", maxRetry: 3 },
  },
};

/** resolveContracts: pipelineDef の上書きを既定レジストリより優先して解決(純粋)。 */
export const resolveContracts = (
  stepDef: { readonly id: Step; readonly contracts?: StepContracts },
  registry: Readonly<Record<string, StepContracts>> = DEFAULT_STEP_CONTRACTS,
): StepContracts | undefined =>
  stepDef.contracts ?? registry[stepDef.id as string];

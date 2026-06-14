/**
 * ドメインイベント契約(S5 index「ドメインイベント契約」/ S4 引き継ぎ最優先)。
 *
 * Unit-02(技術アダプタ)が Agent 実行中に emit するイベントを、技術非依存(ドメインの意味)で定義する。
 * 受け手の集約がこれを受けて状態遷移する。S7 で Agent SDK の stdout JSON にこの形へマッピングする。
 * これは「契約(型)」であり副作用を持たない。
 */

import type { RunState } from "../cycle/cycle";
import type { QuestionKind, QuestionPayload, QuestionTarget } from "../question/question";
import type { ReviewBlock } from "../review/review";
import type { CompletenessBlock } from "../review/brief";
import type {
  ArtifactKind,
  WikiSection,
  DocPath,
} from "../external-memory/external-memory";
import type { RunId, TaskId } from "../shared/ids";

/**
 * BU-2: A decision carried from the aidlc-result envelope (§C7.4).
 * Additive optional type — absent on pre-BU-2 emissions (backward-compatible).
 */
export type ResultDecision = {
  readonly id: string;
  readonly decision: string;
  readonly reason: string;
};

/** Run の進捗・終了・stall 検知 → Cycle.advanceRun。 */
export type RunStateChanged = {
  readonly type: "RunStateChanged";
  readonly runId: RunId;
  readonly to: RunState;
  /** Human-readable cause for failed/stalled transitions. Empty for done. */
  readonly reason?: string;
};

/** AI が人間判断を要求した(S3 名: HumanTaskEmitted)→ Question を 1 枚 open。 */
export type QuestionRaised = {
  readonly type: "QuestionRaised";
  readonly runId: RunId;
  readonly taskId?: TaskId;
  readonly kind: QuestionKind;
  readonly payload: QuestionPayload;
  /**
   * BU-3 config-hearing: optional write target. When present on a "question"
   * event, the EventApplier threads it onto the raised Question so the
   * inbox-service can apply the answer to StepContracts (§C7.6).
   * Absent on all other question kinds and normal hearing questions.
   */
  readonly target?: QuestionTarget;
};

/** レビュー成果の描画データ(Task 単位。S3 名: ReviewBlocksEmitted)→ Review を構築。 */
export type ResultEmitted = {
  readonly type: "ResultEmitted";
  readonly runId: RunId;
  readonly taskId?: TaskId;
  readonly blocks: readonly ReviewBlock[];
  /**
   * S8 手戻り追補(v0.0.2 / 後方互換 optional): evaluator(AI)が書いた完全性判断
   * (requirements ↔ addressed)を app の決定的 completeness gate へ搬送する。generator は
   * requirements のみ(addressed 空)、evaluator が addressed を埋める。欠落 = 従来動作。
   */
  readonly completeness?: CompletenessBlock;
  /**
   * BU-2 (v0.0.4 / 後方互換 optional): aidlc-result エンベロープから搬送する
   * 成果物パス一覧(aidlc-docs 相対パス)。欠落 = 従来動作(non-envelope 実行路)。
   */
  readonly artifacts?: readonly string[];
  /**
   * BU-2 (v0.0.4 / 後方互換 optional): aidlc-result エンベロープから搬送する
   * AI が独自に決めた事項(D-NN)一覧。欠落 = 従来動作。
   */
  readonly decisions?: readonly ResultDecision[];
};

/** aidlc-docs に成果物が書かれた → ArtifactRef を索引化(v0.0.x)。 */
export type ArtifactEmitted = {
  readonly type: "ArtifactEmitted";
  readonly runId: RunId;
  readonly path: DocPath;
  readonly kind: ArtifactKind;
};

/** Wiki の再生成が要る → WikiDoc を再生成(v0.0.x)。 */
export type WikiUpdated = {
  readonly type: "WikiUpdated";
  readonly runId: RunId;
  readonly section: WikiSection;
};

export type DomainEvent =
  | RunStateChanged
  | QuestionRaised
  | ResultEmitted
  | ArtifactEmitted
  | WikiUpdated;

export type DomainEventType = DomainEvent["type"];

/** MVP の最小契約(US-07/08/12/13 を貫通させる 3 本)。 */
export const MVP_EVENT_TYPES: ReadonlySet<DomainEventType> = new Set([
  "RunStateChanged",
  "QuestionRaised",
  "ResultEmitted",
]);

export const isMvpEvent = (e: DomainEvent): boolean => MVP_EVENT_TYPES.has(e.type);

/**
 * ドメインイベント契約(S5 index「ドメインイベント契約」/ S4 引き継ぎ最優先)。
 *
 * Unit-02(技術アダプタ)が Agent 実行中に emit するイベントを、技術非依存(ドメインの意味)で定義する。
 * 受け手の集約がこれを受けて状態遷移する。S7 で Agent SDK の stdout JSON にこの形へマッピングする。
 * これは「契約(型)」であり副作用を持たない。
 */

import type { RunState } from "../cycle/cycle";
import type { QuestionKind, QuestionPayload } from "../question/question";
import type { ReviewBlock } from "../review/review";
import type {
  ArtifactKind,
  WikiSection,
  DocPath,
} from "../external-memory/external-memory";
import type { RunId, TaskId } from "../shared/ids";

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
};

/** レビュー成果の描画データ(Task 単位。S3 名: ReviewBlocksEmitted)→ Review を構築。 */
export type ResultEmitted = {
  readonly type: "ResultEmitted";
  readonly runId: RunId;
  readonly taskId?: TaskId;
  readonly blocks: readonly ReviewBlock[];
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

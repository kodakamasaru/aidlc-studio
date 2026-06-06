/**
 * 集約: Facts(確定事項)(S5 facts.md)。
 *
 * AI は append のみ・人間は版付きで編集可(INV-2)。版は append-only で過去版を破壊しない(INV-1, US-17)。
 * 純粋(D-03): 全コマンドは新しい Fact を返す。id・時刻は外から注入(D-04)。
 */

import { type Result, ok, err } from "../shared/result";
import type { Instant, Text } from "../shared/primitives";
import type { Verdict } from "../shared/vocab";
import type { FactId, QuestionId, CycleId } from "../shared/ids";

export type Author = "ai" | "human";

export type FactRevision = {
  readonly version: number; // 1 始まり
  readonly verdict: Verdict;
  readonly statement: Text; // 何が確定したか
  readonly reason?: Text; // なぜ(reject/backtrack は必須)
  readonly editedBy: Author;
  readonly at: Instant;
};

export type Fact = {
  readonly id: FactId;
  readonly questionId: QuestionId;
  readonly cycleId: CycleId;
  readonly source: Author; // 起票元(AI 回答記録 か 人間起票か)
  readonly confirmedAt: Instant; // 初版の確定時刻(順序の基準)
  readonly currentVersion: number; // 有効な版(= revisions の最新)
  readonly revisions: readonly FactRevision[]; // append-only
};

export type FactError = "EmptyReasonOnReject" | "NotHumanEditor";

/** reject(手戻り含む)のとき reason 必須(INV-4)。 */
const reasonOkFor = (verdict: Verdict, reason: Text | undefined): boolean =>
  verdict !== "reject" || (reason !== undefined && reason.trim().length > 0);

export type AppendFactCmd = {
  readonly id: FactId;
  readonly questionId: QuestionId;
  readonly cycleId: CycleId;
  readonly by: Author; // 回答経路(初版の source / editedBy)
  readonly verdict: Verdict;
  readonly statement: Text;
  readonly reason?: Text;
  readonly at: Instant;
};

/**
 * append: 初版(version 1)の Fact を生成。`answerQuestion` / `requestBacktrack` からのみ呼ばれる。
 * AI 経路でも append は可(不変なのは「上書き/削除」であって append ではない)。
 */
export const append = (cmd: AppendFactCmd): Result<Fact, FactError> => {
  if (!reasonOkFor(cmd.verdict, cmd.reason)) return err("EmptyReasonOnReject");
  const revision: FactRevision = {
    version: 1,
    verdict: cmd.verdict,
    statement: cmd.statement,
    ...(cmd.reason !== undefined ? { reason: cmd.reason } : {}),
    editedBy: cmd.by,
    at: cmd.at,
  };
  return ok({
    id: cmd.id,
    questionId: cmd.questionId,
    cycleId: cmd.cycleId,
    source: cmd.by,
    confirmedAt: cmd.at,
    currentVersion: 1,
    revisions: [revision],
  });
};

export type EditFactCmd = {
  readonly editor: Author; // 人間専用(INV-2)
  readonly statement?: Text;
  readonly reason?: Text;
  readonly verdict?: Verdict;
  readonly at: Instant;
};

/**
 * editFact: 人間のみ。新しい FactRevision(version+1, editedBy=human)を積む。旧版は不変保持(INV-1)。
 * 指定しないフィールドは有効版から引き継ぐ。
 */
export const editFact = (fact: Fact, cmd: EditFactCmd): Result<Fact, FactError> => {
  if (cmd.editor !== "human") return err("NotHumanEditor");
  const current = fact.revisions[fact.currentVersion - 1];
  if (!current) return err("NotHumanEditor"); // 不正な状態(到達しない)

  const verdict = cmd.verdict ?? current.verdict;
  const reason = cmd.reason ?? current.reason;
  if (!reasonOkFor(verdict, reason)) return err("EmptyReasonOnReject");

  const nextVersion = fact.currentVersion + 1;
  const revision: FactRevision = {
    version: nextVersion,
    verdict,
    statement: cmd.statement ?? current.statement,
    ...(reason !== undefined ? { reason } : {}),
    editedBy: "human",
    at: cmd.at,
  };
  return ok({
    ...fact,
    currentVersion: nextVersion,
    revisions: [...fact.revisions, revision],
  });
};

/** 有効な確定 = revisions[currentVersion]。 */
export const effectiveRevision = (fact: Fact): FactRevision => {
  const r = fact.revisions[fact.currentVersion - 1];
  if (!r) throw new Error("Fact has no current revision (invariant broken)");
  return r;
};

/** 全版を時系列(version 昇順)で返す。getHistory の純粋部。 */
export const history = (fact: Fact): readonly FactRevision[] => fact.revisions;

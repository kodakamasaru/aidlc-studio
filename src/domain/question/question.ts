/**
 * 集約: Question(Inbox)(S5 question.md)。製品の魂 = AI→人間の全依頼を kind で吸収する単一型。
 *
 * 純粋(D-03)。回答(answerQuestion)は「Question close + Fact append + Unit-02 命令」の調停を
 * 純粋データとして返す `applyAnswer`(D-06)で表す。実際の保存・SDK 呼び出しは S7。
 */

import { type Result, ok, err } from "../shared/result";
import type { Instant, Text } from "../shared/primitives";
import type { Verdict, Step } from "../shared/vocab";
import type { QuestionId, RunId, CycleId, TaskId, FactId } from "../shared/ids";
import type { Review } from "../review/review";
import { type Fact, append as appendFact } from "../facts/facts";

export type QuestionKind =
  | "question"
  | "visual_review"
  | "device_check"
  | "decision"
  | "backtrack"
  | "stall_retry"
  | "descope";

export type QuestionState = "open" | "answered" | "dismissed";

/** kind 依存の中身(payload)。判別子は kind。 */
export type QuestionPayload =
  | { readonly kind: "question"; readonly prompt: Text }
  | { readonly kind: "visual_review"; readonly review: Review }
  | { readonly kind: "device_check"; readonly instructions: Text }
  | { readonly kind: "decision"; readonly statement: Text }
  | { readonly kind: "backtrack"; readonly toStep: Step; readonly proposal: Text }
  | { readonly kind: "stall_retry"; readonly runId: RunId; readonly stalledAt: Instant }
  // S6 descope-policy: AI が理由付きで起こす見送り申請(1 申請 = 1 カード)。
  | {
      readonly kind: "descope";
      readonly requirement: Text; // 見送りたい要件の平易文
      readonly aiReason: Text; // 必須(理由なき見送りは発生しない / 原則#6)
      readonly recommendedStep?: Step; // 「前のステップからやり直す」候補
    };

export type Question = {
  readonly id: QuestionId;
  readonly runId: RunId;
  readonly cycleId: CycleId;
  /** 対象 Task。visual_review は Task 単位(INV-7)。null = Cycle 単位(S4/S5 等)。 */
  readonly taskId: TaskId | null;
  readonly kind: QuestionKind;
  readonly state: QuestionState;
  readonly payload: QuestionPayload;
  readonly createdAt: Instant;
};

/** 人間の応答(値オブジェクト)。 */
export type Answer = {
  readonly verdict: Verdict;
  readonly body?: Text; // answer 時の回答本文
  readonly backtrackTo?: Step; // reject(手戻り)時の戻り先
  readonly reason?: Text; // reject / backtrack の理由
};

export type QuestionError =
  | "QuestionClosed"
  | "InvalidVerdict"
  | "EmptyReason"
  | "MissingBacktrackTarget";

/** kind × verdict 整合(INV-2)。 */
const ALLOWED_VERDICTS: Record<QuestionKind, ReadonlySet<Verdict>> = {
  question: new Set(["answer"]),
  visual_review: new Set(["approve", "reject"]),
  device_check: new Set(["confirm", "reject"]),
  decision: new Set(["approve", "reject"]),
  backtrack: new Set(["approve", "reject"]),
  stall_retry: new Set(["approve", "reject"]),
  // descope 4 択(S6 descope-policy D-01): つくる/見送る/後回し/前のステップからやり直す。
  descope: new Set(["rework", "descope", "defer", "rewind"]),
};

// ── Unit-02 へ渡す命令(回答の効果。S5 kind×verdict 効果表) ──────
export type Unit02Command =
  | { readonly type: "resumeRun"; readonly runId: RunId; readonly body?: Text }
  | { readonly type: "approveTaskReview"; readonly runId: RunId; readonly taskId: TaskId | null }
  | { readonly type: "backtrack"; readonly toStep: Step; readonly reason: Text }
  | { readonly type: "retryLaunch"; readonly runId: RunId }
  | { readonly type: "cancelRun"; readonly runId: RunId }
  // S6 descope-policy D-01/D-03: 見送り承認→backlog 化の橋渡し。app 層が proposeTask→acceptProposal
  // (INV-5 = 人間判断ゲート)に繋ぐ。deferred=後回し(既存 backlog + 優先度/種別で表現 / Q-02)。
  | {
      readonly type: "descopeToBacklog";
      readonly runId: RunId;
      readonly requirement: Text;
      readonly aiReason: Text;
      readonly deferred: boolean;
    };

export type RaiseQuestionCmd = {
  readonly id: QuestionId;
  readonly runId: RunId;
  readonly cycleId: CycleId;
  readonly taskId?: TaskId;
  readonly payload: QuestionPayload;
  readonly createdAt: Instant;
};

/** raiseQuestion: open な Question を 1 枚生成(`QuestionRaised` 受信)。kind は payload から導く。 */
export const raiseQuestion = (cmd: RaiseQuestionCmd): Question => ({
  id: cmd.id,
  runId: cmd.runId,
  cycleId: cmd.cycleId,
  taskId: cmd.taskId ?? null,
  kind: cmd.payload.kind,
  state: "open",
  payload: cmd.payload,
  createdAt: cmd.createdAt,
});

const nonEmpty = (t: Text | undefined): t is Text =>
  t !== undefined && t.trim().length > 0;

/**
 * deriveCommand: kind×verdict から Unit-02 命令を導出(純粋)。
 * backtrack を生む経路では戻り先(MissingBacktrackTarget)と理由(EmptyReason)を要求する。
 */
const deriveCommand = (
  q: Question,
  answer: Answer,
): Result<Unit02Command, QuestionError> => {
  const backtrack = (toStep: Step | undefined): Result<Unit02Command, QuestionError> => {
    if (toStep === undefined) return err("MissingBacktrackTarget");
    if (!nonEmpty(answer.reason)) return err("EmptyReason");
    return ok({ type: "backtrack", toStep, reason: answer.reason });
  };

  switch (q.kind) {
    case "question":
      return ok({
        type: "resumeRun",
        runId: q.runId,
        ...(answer.body !== undefined ? { body: answer.body } : {}),
      });
    case "visual_review":
      return answer.verdict === "approve"
        ? ok({ type: "approveTaskReview", runId: q.runId, taskId: q.taskId })
        : backtrack(answer.backtrackTo);
    case "device_check":
      return answer.verdict === "confirm"
        ? ok({ type: "resumeRun", runId: q.runId })
        : backtrack(answer.backtrackTo);
    case "decision":
      return answer.verdict === "approve"
        ? ok({ type: "resumeRun", runId: q.runId })
        : backtrack(answer.backtrackTo);
    case "backtrack":
      // AI 起点の手戻り提案: approve→提案 step へ手戻り / reject→継続(提案棄却)
      return answer.verdict === "approve"
        ? backtrack(q.payload.kind === "backtrack" ? q.payload.toStep : undefined)
        : ok({ type: "resumeRun", runId: q.runId });
    case "stall_retry":
      return answer.verdict === "approve"
        ? ok({ type: "retryLaunch", runId: q.runId })
        : ok({ type: "cancelRun", runId: q.runId });
    case "descope": {
      // payload は kind=descope のとき必ず descope(raiseQuestion が kind を payload から導く)。
      const p = q.payload.kind === "descope" ? q.payload : undefined;
      if (!p) return err("InvalidVerdict");
      switch (answer.verdict) {
        case "rework": // つくる: 差し戻して再 generate
          return ok({ type: "retryLaunch", runId: q.runId });
        case "descope": // 見送る: backlog 化(app 層が acceptProposal ゲートを通す)
          return ok({
            type: "descopeToBacklog",
            runId: q.runId,
            requirement: p.requirement,
            aiReason: p.aiReason,
            deferred: false,
          });
        case "defer": // 後回し: backlog 化(deferred)
          return ok({
            type: "descopeToBacklog",
            runId: q.runId,
            requirement: p.requirement,
            aiReason: p.aiReason,
            deferred: true,
          });
        case "rewind": // 前のステップからやり直す: 既存 backtrack 経路へ合流
          return backtrack(answer.backtrackTo ?? p.recommendedStep);
        default:
          return err("InvalidVerdict");
      }
    }
  }
};

/** 回答内容から Fact の statement(何が確定したか)を組む。 */
const statementOf = (q: Question, answer: Answer): Text => {
  const base = `${q.kind}:${answer.verdict}`;
  if (q.kind === "question" && nonEmpty(answer.body)) return `${base} — ${answer.body}`;
  // descope は要件 + AI 理由を Fact に残す(原則#6: 見送りの証跡が backlog/台帳に残る)。
  if (q.kind === "descope" && q.payload.kind === "descope") {
    const { requirement, aiReason } = q.payload;
    return `${base} — ${requirement}(理由: ${aiReason})`;
  }
  if (nonEmpty(answer.reason)) return `${base} — ${answer.reason}`;
  return base;
};

export type AnswerContext = {
  readonly factId: FactId;
  readonly at: Instant;
  /** 回答経路。Inbox からの人間回答は "human"。 */
  readonly by: "ai" | "human";
};

export type AnswerOutcome = {
  readonly question: Question; // answered
  readonly fact: Fact; // append される確定事項(INV-4)
  readonly command: Unit02Command; // Unit-02 へ渡す効果
};

/**
 * applyAnswer(D-06): open な Question を検証し、(1)answered な Question、(2)append する Fact、
 * (3)Unit-02 命令 の純粋データを返す。実 I/O(保存・SDK)は S7 のインタラクタが行う。
 * INV-1(open のみ応答可)/ INV-2(verdict×kind)/ INV-3,4(reject は戻り先+理由→Fact append)。
 */
export const applyAnswer = (
  q: Question,
  answer: Answer,
  ctx: AnswerContext,
): Result<AnswerOutcome, QuestionError> => {
  if (q.state !== "open") return err("QuestionClosed");
  if (!ALLOWED_VERDICTS[q.kind].has(answer.verdict)) return err("InvalidVerdict");

  const cmd = deriveCommand(q, answer);
  if (!cmd.ok) return cmd;

  const factResult = appendFact({
    id: ctx.factId,
    questionId: q.id,
    cycleId: q.cycleId,
    by: ctx.by,
    verdict: answer.verdict,
    statement: statementOf(q, answer),
    ...(nonEmpty(answer.reason) ? { reason: answer.reason } : {}),
    at: ctx.at,
  });
  // Fact 側の reject-reason 要件は deriveCommand 後なので backtrack 系では reason 充足済み。
  if (!factResult.ok) return err("EmptyReason");

  return ok({
    question: { ...q, state: "answered" },
    fact: factResult.value,
    command: cmd.value,
  });
};

/** dismissQuestion: 応答不要で閉じる(open のみ)。 */
export const dismissQuestion = (q: Question): Result<Question, QuestionError> =>
  q.state !== "open"
    ? err("QuestionClosed")
    : ok({ ...q, state: "dismissed" });

// ── Inbox 導出(状態を複製しない) ───────────────────────────────
/** その Run を指す open な Question があれば「人間待ち」(index D-01 / INV-6)。 */
export const isAwaitingHuman = (
  questions: readonly Question[],
  runId: RunId,
): boolean => questions.some((q) => q.runId === runId && q.state === "open");

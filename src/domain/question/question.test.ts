import { test, expect, describe } from "bun:test";
import { unwrap } from "../shared/result";
import { instant } from "../shared/primitives";
import { Step } from "../shared/vocab";
import {
  QuestionId,
  RunId,
  CycleId,
  TaskId,
  FactId,
} from "../shared/ids";
import { buildReview } from "../review/review";
import { effectiveRevision } from "../facts/facts";
import {
  type Question,
  type QuestionPayload,
  raiseQuestion,
  applyAnswer,
  dismissQuestion,
  isAwaitingHuman,
} from "./question";

const at = (h: number) => unwrap(instant(`2026-06-06T0${h}:00:00Z`));
const ctx = { factId: FactId("f1"), at: at(2), by: "human" as const };

const raise = (payload: QuestionPayload, taskId?: TaskId): Question =>
  raiseQuestion({
    id: QuestionId("q1"),
    runId: RunId("r1"),
    cycleId: CycleId("c1"),
    ...(taskId ? { taskId } : {}),
    payload,
    createdAt: at(1),
  });

const review = buildReview({
  runId: RunId("r1"),
  cycleId: CycleId("c1"),
  step: Step("S6"),
  taskId: TaskId("t1"),
  blocks: [{ type: "summary", title: "x", body: "y" }],
  producedAt: at(1),
});

describe("raiseQuestion", () => {
  test("opens a card and derives kind from payload", () => {
    const q = raise({ kind: "question", prompt: "which test runner?" });
    expect(q.state).toBe("open");
    expect(q.kind).toBe("question");
    expect(q.taskId).toBeNull();
  });

  test("visual_review carries a Task id and embeds its Review", () => {
    const q = raise({ kind: "visual_review", review }, TaskId("t1"));
    expect(q.kind).toBe("visual_review");
    expect(q.taskId as string).toBe("t1");
  });
});

describe("applyAnswer (INV-1/2/4 + Unit-02 effect)", () => {
  test("question/answer -> answered + Fact appended + resumeRun with body", () => {
    const out = unwrap(
      applyAnswer(
        raise({ kind: "question", prompt: "?" }),
        { verdict: "answer", body: "bun test" },
        ctx,
      ),
    );
    expect(out.question.state).toBe("answered");
    expect(out.command).toEqual({ type: "resumeRun", runId: RunId("r1"), body: "bun test" });
    expect(effectiveRevision(out.fact)).toMatchObject({ verdict: "answer" });
  });

  test("visual_review/approve -> approveTaskReview for the task", () => {
    const out = unwrap(
      applyAnswer(raise({ kind: "visual_review", review }, TaskId("t1")), { verdict: "approve" }, ctx),
    );
    expect(out.command).toEqual({
      type: "approveTaskReview",
      runId: RunId("r1"),
      taskId: TaskId("t1"),
    });
  });

  test("visual_review/reject -> backtrack (requires target + reason)", () => {
    const q = raise({ kind: "visual_review", review }, TaskId("t1"));
    expect(applyAnswer(q, { verdict: "reject" }, ctx)).toEqual({
      ok: false,
      error: "MissingBacktrackTarget",
    });
    expect(
      applyAnswer(q, { verdict: "reject", backtrackTo: Step("S5") }, ctx),
    ).toEqual({ ok: false, error: "EmptyReason" });
    const out = unwrap(
      applyAnswer(q, { verdict: "reject", backtrackTo: Step("S5"), reason: "wrong model" }, ctx),
    );
    expect(out.command).toEqual({ type: "backtrack", toStep: Step("S5"), reason: "wrong model" });
  });

  test("stall_retry approve -> retryLaunch, reject -> cancelRun", () => {
    const q = raise({ kind: "stall_retry", runId: RunId("r1"), stalledAt: at(1) });
    expect(unwrap(applyAnswer(q, { verdict: "approve" }, ctx)).command).toEqual({
      type: "retryLaunch",
      runId: RunId("r1"),
    });
    // reject records a Fact, and Fact INV-4 requires a reason for any reject verdict
    expect(applyAnswer(q, { verdict: "reject" }, ctx)).toEqual({
      ok: false,
      error: "EmptyReason",
    });
    expect(
      unwrap(applyAnswer(q, { verdict: "reject", reason: "give up this run" }, ctx)).command,
    ).toEqual({ type: "cancelRun", runId: RunId("r1") });
  });

  test("backtrack-kind approve uses the proposed step", () => {
    const q = raise({ kind: "backtrack", toStep: Step("S3"), proposal: "unit boundary off" });
    const out = unwrap(applyAnswer(q, { verdict: "approve", reason: "agreed" }, ctx));
    expect(out.command).toEqual({ type: "backtrack", toStep: Step("S3"), reason: "agreed" });
  });

  test("wrong verdict for a kind is InvalidVerdict", () => {
    const q = raise({ kind: "question", prompt: "?" });
    expect(applyAnswer(q, { verdict: "approve" }, ctx)).toEqual({
      ok: false,
      error: "InvalidVerdict",
    });
  });

  test("answering a closed question is QuestionClosed", () => {
    const q = raise({ kind: "question", prompt: "?" });
    const answered = unwrap(applyAnswer(q, { verdict: "answer", body: "x" }, ctx)).question;
    expect(applyAnswer(answered, { verdict: "answer", body: "y" }, ctx)).toEqual({
      ok: false,
      error: "QuestionClosed",
    });
  });
});

describe("dismissQuestion", () => {
  test("open -> dismissed; closed cannot be dismissed", () => {
    const q = raise({ kind: "decision", statement: "auto" });
    const d = unwrap(dismissQuestion(q));
    expect(d.state).toBe("dismissed");
    expect(dismissQuestion(d)).toEqual({ ok: false, error: "QuestionClosed" });
  });
});

describe("isAwaitingHuman (INV-6: waiting is derived, not stored)", () => {
  test("a run is awaiting iff an open question points at it", () => {
    const open = raise({ kind: "question", prompt: "?" });
    expect(isAwaitingHuman([open], RunId("r1"))).toBe(true);
    expect(isAwaitingHuman([open], RunId("r2"))).toBe(false);
    const answered = unwrap(applyAnswer(open, { verdict: "answer", body: "x" }, ctx)).question;
    expect(isAwaitingHuman([answered], RunId("r1"))).toBe(false);
  });
});

describe("descope kind (S6 descope-policy: 4 択 verdict → Unit02Command)", () => {
  const descope = (recommendedStep?: Step): Question =>
    raise({
      kind: "descope",
      requirement: "オフライン同期",
      aiReason: "v0.0.3 のスコープ。今期は縦ループ優先",
      ...(recommendedStep ? { recommendedStep } : {}),
    });

  test("raiseQuestion derives kind=descope from payload", () => {
    expect(descope().kind).toBe("descope");
  });

  test("つくる(rework) → retryLaunch(差し戻して再 generate)", () => {
    const out = unwrap(applyAnswer(descope(), { verdict: "rework" }, ctx));
    expect(out.command).toEqual({ type: "retryLaunch", runId: RunId("r1") });
  });

  test("見送る(descope) → descopeToBacklog(deferred=false) + 証跡 Fact", () => {
    const out = unwrap(applyAnswer(descope(), { verdict: "descope" }, ctx));
    expect(out.command).toEqual({
      type: "descopeToBacklog",
      runId: RunId("r1"),
      requirement: "オフライン同期",
      aiReason: "v0.0.3 のスコープ。今期は縦ループ優先",
      deferred: false,
    });
    // 原則#6: 見送りの証跡(要件 + AI 理由)が Fact に残る
    expect(effectiveRevision(out.fact).statement).toContain("オフライン同期");
    expect(effectiveRevision(out.fact).statement).toContain("v0.0.3");
  });

  test("後回し(defer) → descopeToBacklog(deferred=true)", () => {
    const out = unwrap(applyAnswer(descope(), { verdict: "defer" }, ctx));
    expect(out.command).toMatchObject({ type: "descopeToBacklog", deferred: true });
  });

  test("前のステップからやり直す(rewind) → 既存 backtrack 経路(推奨ステップ + 理由)", () => {
    const out = unwrap(
      applyAnswer(descope(Step("S5")), { verdict: "rewind", reason: "Unit 境界を見直す" }, ctx),
    );
    expect(out.command).toEqual({ type: "backtrack", toStep: Step("S5"), reason: "Unit 境界を見直す" });
  });

  test("rewind without a target (no recommendedStep / no backtrackTo) → MissingBacktrackTarget", () => {
    const res = applyAnswer(descope(), { verdict: "rewind", reason: "理由あり" }, ctx);
    expect(res).toEqual({ ok: false, error: "MissingBacktrackTarget" });
  });

  test("rewind without a reason → EmptyReason", () => {
    const res = applyAnswer(descope(Step("S5")), { verdict: "rewind" }, ctx);
    expect(res).toEqual({ ok: false, error: "EmptyReason" });
  });

  test("a verdict outside the descope 4-set is InvalidVerdict", () => {
    const res = applyAnswer(descope(), { verdict: "approve" }, ctx);
    expect(res).toEqual({ ok: false, error: "InvalidVerdict" });
  });
});

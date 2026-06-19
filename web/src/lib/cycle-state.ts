// Derive list/detail display state from a Cycle's phases+runs. The board's
// visual vocabulary is running/stalled/done/idle (failed surfaces attention via
// retry); this maps the domain phase/run model onto it.
import type { Cycle, Phase, Run, RunState, Question } from "./api";

/** Coarse run-state badge a Cycle shows in the list / topbar. */
export type DisplayState = "running" | "stalled" | "failed" | "done" | "review" | "idle";

const latestRun = (phase: Phase): Run | undefined =>
  phase.runs.length > 0 ? phase.runs[phase.runs.length - 1] : undefined;

/** The latest run of a single phase (the run the human acts on for THAT phase). */
export function latestRunOfPhase(phase: Phase): Run | undefined {
  return latestRun(phase);
}

/** The phase the human acts on: first not-done, else the last phase. */
export function activePhase(cycle: Cycle): Phase | undefined {
  const pending = cycle.phases.find((p) => p.state !== "done");
  return pending ?? cycle.phases[cycle.phases.length - 1];
}

/**
 * SCR-01 ステップ構成 — どの案内文/導線を出すか (F-14)。
 *
 * per-cycle の工程調整は「要件(S1)が固まった直後に AI が組み直しを提案する」US-08 の流れで
 * 行う。この画面は閲覧専用なので、旧文言『始める前にだけ調整できる』は実態(要件確定後に提案)
 * と真逆で矛盾していた。実際の調整点へ正しく導くため、状態を 3 分岐で表す:
 *   - "pre-requirements"        要件(S1)未確定 → 工程は既定のまま動く。確定後に組み直し提案が出る。
 *   - "reconstruction-available" 組み直し提案が存在 → その提案画面へ導く(本来の調整点)。
 *   - "locked-running"          要件確定済み・提案なし・進行中 → 構成変更は不可(組み直しは確定直後のみ)。
 * Pure: cycle + 提案有無 だけに依存。決定論テスト用に export。
 */
export type StepsGuidance =
  | "pre-requirements"
  | "reconstruction-available"
  | "locked-running";

export function stepsGuidance(
  cycle: Cycle,
  hasReconstructionProposal: boolean,
): StepsGuidance {
  if (hasReconstructionProposal) return "reconstruction-available";
  const requirementsDone =
    cycle.phases.find((p) => p.step === "S1")?.state === "done";
  return requirementsDone ? "locked-running" : "pre-requirements";
}

/** Latest run across the whole cycle (drives detail header + retry target). */
export function latestRunOfCycle(
  cycle: Cycle,
): { readonly phase: Phase; readonly run: Run } | undefined {
  for (let i = cycle.phases.length - 1; i >= 0; i--) {
    const phase = cycle.phases[i];
    if (!phase) continue;
    const run = latestRun(phase);
    if (run) return { phase, run };
  }
  return undefined;
}

const RUN_TO_DISPLAY: Record<RunState, DisplayState> = {
  running: "running",
  stalled: "stalled",
  failed: "failed",
  done: "done",
};

/** Cycle-level badge state. */
export function cycleDisplayState(cycle: Cycle): DisplayState {
  if (cycle.state === "done") return "done";
  const latest = latestRunOfCycle(cycle);
  // No run anywhere → genuinely not started.
  if (!latest) return "idle";
  // A run is still active (running/stalled/failed) → surface that.
  if (latest.run.state !== "done") return RUN_TO_DISPLAY[latest.run.state];
  // The latest run is DONE but the cycle is not → the active phase is awaiting the
  // human (review) or sits between phases. This is a STARTED cycle, never "idle"
  // (未起動). When the active phase is in review, say 確認待ち; otherwise 進行中.
  const active = activePhase(cycle);
  return active?.state === "review" ? "review" : "running";
}

/**
 * Whether the ACTIVE run is blocked on the human, derived from the cycle's open
 * questions. A run is "human-waiting" when it is still `running` AND an open
 * Question targets it. `stall_retry` is excluded here: a stalled run already has
 * its own retry surface (it isn't a "running" run), so we don't double-signal it.
 */
export interface HumanWait {
  /** "回答待ち" (answer/decide) vs "レビュー待ち" (visual review). */
  readonly mode: "answer" | "review";
  readonly question: Question;
}

const REVIEW_KINDS = new Set(["visual_review", "backtrack"]);

export function humanWaitingForRun(
  run: Run | undefined,
  openQuestions: readonly Question[],
): HumanWait | undefined {
  if (!run || run.state !== "running") return undefined;
  const q = openQuestions.find(
    (oq) => oq.runId === run.id && oq.kind !== "stall_retry",
  );
  if (!q) return undefined;
  return { mode: REVIEW_KINDS.has(q.kind) ? "review" : "answer", question: q };
}

/** "Sn / 7" progress: last done step over total phases. */
export function progressLabel(cycle: Cycle): string {
  const done = cycle.phases.filter((p) => p.state === "done");
  const last = done[done.length - 1];
  const total = cycle.phases.length;
  if (!last) return `– / ${total}`;
  return `${last.step} / ${total}`;
}

/** Current step identifier (e.g. "S3") for list meta. */
export function currentStep(cycle: Cycle): string | undefined {
  return activePhase(cycle)?.step;
}

// 平易な状態語(S3 scr-02 用語方針: 内部語でなく「進行中 / 停止 …」)。
export const STATE_LABEL: Record<DisplayState, string> = {
  running: "進行中",
  stalled: "停止",
  failed: "失敗",
  done: "完了",
  review: "確認待ち",
  idle: "未起動",
};

export const STATE_BADGE_CLASS: Record<DisplayState, string> = {
  running: "badge--running",
  stalled: "badge--stalled",
  failed: "badge--failed",
  done: "badge--done",
  // 確認待ち = 人間のアクション待ち。視覚的には running と同系(active)を流用。
  review: "badge--running",
  idle: "badge--idle",
};

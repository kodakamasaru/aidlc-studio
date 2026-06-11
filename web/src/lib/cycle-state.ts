// Derive list/detail display state from a Cycle's phases+runs. The board's
// visual vocabulary is running/stalled/done/idle (failed surfaces attention via
// retry); this maps the domain phase/run model onto it.
import type { Cycle, Phase, Run, RunState, Question } from "./api";

/** Coarse run-state badge a Cycle shows in the list / topbar. */
export type DisplayState = "running" | "stalled" | "failed" | "done" | "idle";

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
  if (latest && latest.run.state !== "done") {
    return RUN_TO_DISPLAY[latest.run.state];
  }
  return "idle";
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
  idle: "未起動",
};

export const STATE_BADGE_CLASS: Record<DisplayState, string> = {
  running: "badge--running",
  stalled: "badge--stalled",
  failed: "badge--failed",
  done: "badge--done",
  idle: "badge--idle",
};

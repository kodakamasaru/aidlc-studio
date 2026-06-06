/**
 * 集約: Cycle ライフサイクル(S5 cycle.md / S6 主対象)。
 *
 * 整合性境界 = Cycle 単位。Phase / Run を子エンティティとして内包する状態機械。
 * 純粋(D-03): 全コマンドは新しい Cycle を返す。id・時刻は外から注入(D-04)。
 * 失敗は Result<Cycle, CycleError> で返す(D-02)。Cycle は store/SDK/HTTP を知らない(INV-9)。
 */

import { type Result, ok, err } from "../shared/result";
import {
  type Instant,
  type NonEmptyText,
  type Text,
  nonEmptyText,
} from "../shared/primitives";
import { type Step, sameStep } from "../shared/vocab";
import type { CycleId, ProjectId, PhaseId, RunId, TaskId } from "../shared/ids";

// ── 状態列挙(S5 状態遷移のみ許可) ───────────────────────────────
export type CycleState = "planned" | "active" | "paused" | "done";
export type PhaseState = "pending" | "running" | "review" | "done";
export type RunState = "running" | "stalled" | "done" | "failed";

// ── 値オブジェクト Version(vX.Y.Z) ──────────────────────────────
declare const versionBrand: unique symbol;
export type Version = string & { readonly [versionBrand]: "Version" };
const VERSION_RE = /^v\d+\.\d+\.\d+$/;
export const version = (s: string): Result<Version, "InvalidVersion"> =>
  VERSION_RE.test(s) ? ok(s as Version) : err("InvalidVersion");

// ── エンティティ ────────────────────────────────────────────────
export type Run = {
  readonly id: RunId;
  readonly attempt: number;
  readonly state: RunState;
  readonly startedAt: Instant;
  readonly endedAt?: Instant;
};

export type Phase = {
  readonly id: PhaseId;
  readonly step: Step;
  readonly order: number;
  readonly state: PhaseState;
  readonly runs: readonly Run[];
};

export type Cycle = {
  readonly id: CycleId;
  readonly projectId: ProjectId;
  readonly version: Version;
  readonly title: NonEmptyText;
  readonly taskIds: readonly TaskId[];
  readonly state: CycleState;
  readonly createdAt: Instant;
  readonly phases: readonly Phase[];
};

export type CycleError =
  | "EmptyTitle"
  | "EmptyPipeline"
  | "CyclePaused"
  | "PrevPhaseNotDone"
  | "PhaseAlreadyRunning"
  | "StepNotInPipeline"
  | "PhaseNotFound"
  | "RunNotFound"
  | "IllegalTransition"
  | "RunNotResumable"
  | "RunNotFailedOrStalled"
  | "MaxAttemptExceeded"
  | "PhaseNotInReview"
  | "TaskReviewsPending"
  | "AlreadyInState"
  | "PhasesNotAllDone";

const RUN_TERMINAL: ReadonlySet<RunState> = new Set(["done", "failed"]);
const RUN_FROM_RUNNING: ReadonlySet<RunState> = new Set([
  "stalled",
  "done",
  "failed",
]);

// ── 不変更新ヘルパー(純粋) ─────────────────────────────────────
const replacePhase = (cycle: Cycle, phaseId: PhaseId, f: (p: Phase) => Phase): Cycle => ({
  ...cycle,
  phases: cycle.phases.map((p) => (p.id === phaseId ? f(p) : p)),
});

const replaceRun = (phase: Phase, runId: RunId, f: (r: Run) => Run): Phase => ({
  ...phase,
  runs: phase.runs.map((r) => (r.id === runId ? f(r) : r)),
});

const findPhaseByStep = (cycle: Cycle, step: Step): Phase | undefined =>
  cycle.phases.find((p) => sameStep(p.step, step));

type RunLocation = { readonly phase: Phase; readonly run: Run };
const locateRun = (cycle: Cycle, runId: RunId): RunLocation | undefined => {
  for (const phase of cycle.phases) {
    const run = phase.runs.find((r) => r.id === runId);
    if (run) return { phase, run };
  }
  return undefined;
};

// ── コマンド ────────────────────────────────────────────────────

export type CreateCycleCmd = {
  readonly id: CycleId;
  readonly projectId: ProjectId;
  readonly version: Version;
  readonly title: string;
  readonly taskIds: readonly TaskId[];
  readonly createdAt: Instant;
  /** Project の pipelineDef から渡される工程列(順序順)。phase は pending で instantiate。 */
  readonly pipeline: readonly { readonly phaseId: PhaseId; readonly step: Step }[];
};

/**
 * createCycle: planned な Cycle を作り、pipeline から phases(pending)を instantiate。
 * 注: version の Project 内一意(DuplicateVersion)は単一集約では検証できず、
 *     アプリ層(リポジトリの一意制約)が担保する(S7 引き継ぎ)。
 */
export const createCycle = (cmd: CreateCycleCmd): Result<Cycle, CycleError> => {
  const title = nonEmptyText(cmd.title);
  if (!title.ok) return err("EmptyTitle");
  if (cmd.pipeline.length === 0) return err("EmptyPipeline");

  const phases: Phase[] = cmd.pipeline.map((s, index) => ({
    id: s.phaseId,
    step: s.step,
    order: index,
    state: "pending",
    runs: [],
  }));

  return ok({
    id: cmd.id,
    projectId: cmd.projectId,
    version: cmd.version,
    title: title.value,
    taskIds: cmd.taskIds,
    state: "planned",
    createdAt: cmd.createdAt,
    phases,
  });
};

export type StartPhaseCmd = {
  readonly step: Step;
  readonly runId: RunId;
  readonly startedAt: Instant;
};

/**
 * startPhase: 対象 Phase を running にし attempt=1 の Run を生成。Cycle を active 化。
 * INV-4: ① Cycle が paused でない ② 直前 order の Phase が done ③ 当該 Phase が pending。
 */
export const startPhase = (
  cycle: Cycle,
  cmd: StartPhaseCmd,
): Result<Cycle, CycleError> => {
  if (cycle.state === "paused") return err("CyclePaused");
  const target = findPhaseByStep(cycle, cmd.step);
  if (!target) return err("StepNotInPipeline");
  if (target.state !== "pending") return err("PhaseAlreadyRunning");

  const prev = cycle.phases.find((p) => p.order === target.order - 1);
  if (prev && prev.state !== "done") return err("PrevPhaseNotDone");

  const run: Run = {
    id: cmd.runId,
    attempt: 1,
    state: "running",
    startedAt: cmd.startedAt,
  };
  const started = replacePhase(cycle, target.id, (p) => ({
    ...p,
    state: "running",
    runs: [...p.runs, run],
  }));
  return ok({ ...started, state: "active" });
};

export type AdvanceRunCmd = {
  readonly runId: RunId;
  readonly to: Exclude<RunState, "running">;
  readonly at: Instant;
};

/**
 * advanceRun: running な Run を stalled|done|failed に進める。
 * done のときは Phase を review へ(視覚レビュー待ち)。INV-5。
 */
export const advanceRun = (
  cycle: Cycle,
  cmd: AdvanceRunCmd,
): Result<Cycle, CycleError> => {
  const loc = locateRun(cycle, cmd.runId);
  if (!loc) return err("RunNotFound");
  if (loc.run.state !== "running" || !RUN_FROM_RUNNING.has(cmd.to)) {
    return err("IllegalTransition");
  }

  const endedAt = RUN_TERMINAL.has(cmd.to) ? { endedAt: cmd.at } : {};
  return ok(
    replacePhase(cycle, loc.phase.id, (p) => {
      const withRun = replaceRun(p, cmd.runId, (r) => ({
        ...r,
        state: cmd.to,
        ...endedAt,
      }));
      return cmd.to === "done" ? { ...withRun, state: "review" } : withRun;
    }),
  );
};

/** resumeRun: stalled な Run を同 Run のまま running に戻す(プロセス再開は Unit-02)。 */
export const resumeRun = (cycle: Cycle, runId: RunId): Result<Cycle, CycleError> => {
  const loc = locateRun(cycle, runId);
  if (!loc) return err("RunNotFound");
  if (loc.run.state !== "stalled") return err("RunNotResumable");
  return ok(
    replacePhase(cycle, loc.phase.id, (p) =>
      replaceRun(p, runId, (r) => ({ ...r, state: "running" })),
    ),
  );
};

export type RetryRunCmd = {
  readonly runId: RunId;
  readonly newRunId: RunId;
  readonly startedAt: Instant;
  /** EnvConfig.maxAttempt(既定 3)。アプリ層が Project から渡す。 */
  readonly maxAttempt: number;
};

/**
 * retryRun: failed|stalled な Run から attempt+1 の新 Run を生成(元 Run は終端のまま履歴に残す)。
 * INV-6: 自動 retry なし(手動)。attempt は maxAttempt を超えない。
 */
export const retryRun = (
  cycle: Cycle,
  cmd: RetryRunCmd,
): Result<Cycle, CycleError> => {
  const loc = locateRun(cycle, cmd.runId);
  if (!loc) return err("RunNotFound");
  if (loc.run.state !== "failed" && loc.run.state !== "stalled") {
    return err("RunNotFailedOrStalled");
  }
  const nextAttempt = loc.run.attempt + 1;
  if (nextAttempt > cmd.maxAttempt) return err("MaxAttemptExceeded");

  const newRun: Run = {
    id: cmd.newRunId,
    attempt: nextAttempt,
    state: "running",
    startedAt: cmd.startedAt,
  };
  return ok(
    replacePhase(cycle, loc.phase.id, (p) => ({
      ...p,
      state: "running",
      runs: [...p.runs, newRun],
    })),
  );
};

export type ApprovePhaseCmd = {
  readonly phaseId: PhaseId;
  /** その Run の全 Task レビュー Question が承認済みか(Question 集約からアプリ層が計算)。INV-10。 */
  readonly allTaskReviewsApproved: boolean;
};

/**
 * approvePhase: Phase を review→done。視覚レビューが全 Task 承認済みのときのみ(TaskReviewsPending)。
 * Cycle は Question を直接見ない(INV-5/9) → 承認集計値を引数で受ける(D-06 と同方針)。
 */
export const approvePhase = (
  cycle: Cycle,
  cmd: ApprovePhaseCmd,
): Result<Cycle, CycleError> => {
  const phase = cycle.phases.find((p) => p.id === cmd.phaseId);
  if (!phase) return err("PhaseNotFound");
  if (phase.state !== "review") return err("PhaseNotInReview");
  if (!cmd.allTaskReviewsApproved) return err("TaskReviewsPending");
  return ok(replacePhase(cycle, cmd.phaseId, (p) => ({ ...p, state: "done" })));
};

export type BacktrackCmd = {
  readonly step: Step;
  readonly reason: Text;
};

/**
 * backtrackTo: 戻り先 step の Phase を running、後続 Phase を pending に巻き戻す。
 * INV-7: 過去の Run 履歴は破棄しない(Fact 履歴は Facts 集約が保持)。再起動の Run 生成は Unit-02。
 */
export const backtrackTo = (
  cycle: Cycle,
  cmd: BacktrackCmd,
): Result<Cycle, CycleError> => {
  const target = findPhaseByStep(cycle, cmd.step);
  if (!target) return err("StepNotInPipeline");

  const phases = cycle.phases.map((p) => {
    if (p.order < target.order) return p;
    if (p.order === target.order) return { ...p, state: "running" as PhaseState };
    return { ...p, state: "pending" as PhaseState };
  });
  return ok({ ...cycle, state: "active", phases });
};

/** pauseCycle: active → paused。 */
export const pauseCycle = (cycle: Cycle): Result<Cycle, CycleError> =>
  cycle.state === "paused"
    ? err("AlreadyInState")
    : ok({ ...cycle, state: "paused" });

/** resumeCycle: paused → active。 */
export const resumeCycle = (cycle: Cycle): Result<Cycle, CycleError> =>
  cycle.state === "active"
    ? err("AlreadyInState")
    : ok({ ...cycle, state: "active" });

/** completeCycle: 全 Phase done のとき Cycle を done に(PhasesNotAllDone)。 */
export const completeCycle = (cycle: Cycle): Result<Cycle, CycleError> =>
  cycle.phases.every((p) => p.state === "done")
    ? ok({ ...cycle, state: "done" })
    : err("PhasesNotAllDone");

// ── 導出値(状態を複製せず計算する) ──────────────────────────────
/** その Phase の最新 attempt の Run(なければ undefined)。 */
export const latestRun = (phase: Phase): Run | undefined =>
  phase.runs.length === 0
    ? undefined
    : phase.runs.reduce((a, b) => (b.attempt > a.attempt ? b : a));

/** 現在 running な Phase(高々 1。INV-2)。 */
export const runningPhase = (cycle: Cycle): Phase | undefined =>
  cycle.phases.find((p) => p.state === "running");

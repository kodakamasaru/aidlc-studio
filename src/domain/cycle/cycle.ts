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
import type { StepDef, StepDefSnapshot } from "../project/project";
import type { CycleId, ProjectId, PhaseId, RunId, TaskId } from "../shared/ids";

// ── 状態列挙(S5 状態遷移のみ許可) ───────────────────────────────
export type CycleState = "planned" | "active" | "paused" | "done";
export type PhaseState = "pending" | "running" | "review" | "done";
export type RunState = "running" | "stalled" | "done" | "failed";

/**
 * Run の役割(S6 run-role)。generator = 成果物(BriefOut)を出す / evaluator = verification 契約で検証。
 * optional な discriminator(別集約にしない / RunState には入れない = role と二重の真実を避ける / S6 D-01,D-02)。
 * gen→gate→eval の進行は RunState ではなく app 層の明示的オーケストレーション状態が持つ。
 */
export type RunRole = "generator" | "evaluator";

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
  /** Human-readable reason when the run reached failed/stalled. Empty for done. */
  readonly failureReason?: string;
  /**
   * S6 run-role: generator / evaluator の判別子。optional(欠落 = 従来動作 / 後方互換)。
   * evaluator は generator 成果物が Deterministic gate を pass した後に `launchEval` で起こす(app 層)。
   */
  readonly role?: RunRole;
};

export type Phase = {
  readonly id: PhaseId;
  readonly step: Step;
  readonly order: number;
  readonly state: PhaseState;
  readonly runs: readonly Run[];
  /**
   * S6 phase-step-snapshot: 作成時にピン留めした step 定義の写し(label/skillRef/contracts)。
   * optional = snapshot 導入前に作られた既存 Phase の後方互換(INV-S3)。作成後不変(INV-S2)。
   */
  readonly stepDef?: StepDefSnapshot;
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
  | "PhaseNotRewound"
  | "PhaseNotFound"
  | "RunNotFound"
  | "IllegalTransition"
  | "RunNotResumable"
  | "RunNotFailedOrStalled"
  | "MaxAttemptExceeded"
  | "PhaseNotInReview"
  | "TaskReviewsPending"
  | "AlreadyInState"
  | "PhasesNotAllDone"
  /** US-08 reconstructPipeline: 新 pending steps に保持 phase の step id と重複がある。 */
  | "DuplicateStep";

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
  /**
   * Project の pipelineDef から渡される工程列(順序順)。phase は pending で instantiate。
   * `stepDef` は S6 phase-step-snapshot: app(cycle-service)が正本 + per-cycle 上書きを
   * 解決した写しを詰める。optional = 未指定なら従来動作(後方互換)。ドメインは写すだけ(S6 D-02)。
   */
  readonly pipeline: readonly {
    readonly phaseId: PhaseId;
    readonly step: Step;
    readonly stepDef?: StepDefSnapshot;
  }[];
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
    // S6 INV-S1: 受領した snapshot をそのまま写す(解決は app / ドメインは判断しない)。
    ...(s.stepDef ? { stepDef: s.stepDef } : {}),
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
  /** S6 run-role: 起動する Run の役割(既定なし = 従来動作 / 後方互換)。generator 起動で渡す。 */
  readonly role?: RunRole;
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
    ...(cmd.role !== undefined ? { role: cmd.role } : {}),
  };
  const started = replacePhase(cycle, target.id, (p) => ({
    ...p,
    state: "running",
    runs: [...p.runs, run],
  }));
  return ok({ ...started, state: "active" });
};

export type LaunchEvalCmd = {
  readonly step: Step;
  readonly runId: RunId;
  readonly startedAt: Instant;
};

/**
 * launchEval(S6 run-role): generator 成果物が Deterministic gate を pass した後に、
 * evaluator(role="evaluator")の Run を当該 Phase に新規追加する。gen と eval は別 Run で runs[] に並ぶ。
 *
 * gate 判定そのものは AI 非依存の app 層チェック(D-02)であり、本コマンドの呼び出し前提。ドメインは
 * 「先行 Run が存在し running な Run が無い Phase に evaluator Run を 1 つ append」する純粋更新のみ行う。
 * 進行(gen→gate→eval)は RunState に入れず app 層が明示状態で持つ(D-02)。Phase は running を維持/復帰。
 * INV-2(running は高々 1)を守る: 既に running Run があれば PhaseAlreadyRunning。先行 Run 無しは RunNotFound。
 */
export const launchEval = (
  cycle: Cycle,
  cmd: LaunchEvalCmd,
): Result<Cycle, CycleError> => {
  if (cycle.state === "paused") return err("CyclePaused");
  const target = findPhaseByStep(cycle, cmd.step);
  if (!target) return err("StepNotInPipeline");
  if (target.runs.length === 0) return err("RunNotFound"); // 評価対象(generator)が無い
  if (target.runs.some((r) => r.state === "running")) {
    return err("PhaseAlreadyRunning");
  }

  const nextAttempt = (latestRun(target)?.attempt ?? 0) + 1;
  const evalRun: Run = {
    id: cmd.runId,
    attempt: nextAttempt,
    state: "running",
    startedAt: cmd.startedAt,
    role: "evaluator",
  };
  const launched = replacePhase(cycle, target.id, (p) => ({
    ...p,
    state: "running",
    runs: [...p.runs, evalRun],
  }));
  return ok({ ...launched, state: "active" });
};

export type RelaunchPhaseCmd = {
  readonly step: Step;
  readonly runId: RunId;
  readonly startedAt: Instant;
};

/**
 * relaunchPhase: re-execute a phase that a backtrack rewound to "running" but
 * left WITHOUT a live run (only terminal runs in history — see backtrackTo). It
 * appends a fresh run (attempt = last + 1) so the rewound phase actually re-runs.
 * Distinct from startPhase (begins a PENDING phase at attempt 1) and retryRun
 * (needs a failed/stalled run). INV-2: at most one running run per phase, so a
 * phase that still has a live run is rejected (PhaseAlreadyRunning); a phase that
 * is not a rewound "running" phase is rejected (PhaseNotRewound).
 */
export const relaunchPhase = (
  cycle: Cycle,
  cmd: RelaunchPhaseCmd,
): Result<Cycle, CycleError> => {
  if (cycle.state === "paused") return err("CyclePaused");
  const target = findPhaseByStep(cycle, cmd.step);
  if (!target) return err("StepNotInPipeline");
  if (target.state !== "running") return err("PhaseNotRewound");
  if (target.runs.some((r) => r.state === "running")) {
    return err("PhaseAlreadyRunning");
  }

  const nextAttempt = (latestRun(target)?.attempt ?? 0) + 1;
  const run: Run = {
    id: cmd.runId,
    attempt: nextAttempt,
    state: "running",
    startedAt: cmd.startedAt,
  };
  const relaunched = replacePhase(cycle, target.id, (p) => ({
    ...p,
    state: "running",
    runs: [...p.runs, run],
  }));
  return ok({ ...relaunched, state: "active" });
};

export type AdvanceRunCmd = {
  readonly runId: RunId;
  readonly to: Exclude<RunState, "running">;
  readonly at: Instant;
  /** Why the run transitioned — surfaced in the UI so the human can act on the real cause. */
  readonly reason?: string;
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
  // Only attach failureReason for failed/stalled AND only when a reason was
  // actually supplied — under exactOptionalPropertyTypes an explicit `undefined`
  // is not assignable to the optional `failureReason?: string`.
  const failureReason =
    (cmd.to === "failed" || cmd.to === "stalled") && cmd.reason !== undefined
      ? { failureReason: cmd.reason }
      : {};
  return ok(
    replacePhase(cycle, loc.phase.id, (p) => {
      const withRun = replaceRun(p, cmd.runId, (r) => ({
        ...r,
        state: cmd.to,
        ...endedAt,
        ...failureReason,
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
  /**
   * F-21: maxAttempt は AUTOMATIC retry の暴走止め。`manual:true`(人間が「再試行」を
   * 明示的に押した)はこの cap を免除する — 人間の意図的な操作を上限で dead-end させない
   * (ユーザー方針: 自動 retry には上限が要るが、人間からの retry は常に効くべき)。欠落=従来
   * 動作(cap 適用)。
   */
  readonly manual?: boolean;
};

/**
 * retryRun: failed|stalled な Run から attempt+1 の新 Run を生成(元 Run は終端のまま履歴に残す)。
 * INV-6: 自動 retry なし(手動)。attempt は maxAttempt を超えない(ただし manual は cap 免除 / F-21)。
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
  // F-21: a human-initiated retry is never blocked by the auto-retry cap.
  if (!cmd.manual && nextAttempt > cmd.maxAttempt) return err("MaxAttemptExceeded");

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

// ── US-08: reconstructPipeline ────────────────────────────────────

/**
 * 「着手済み(started)は固定、未着手(pending)だけを組み直す」操作(US-08 D-01)。
 *
 * 意味論:
 * - started phase(state が pending 以外 = running/review/done)は一切変更しない。
 * - pending phase は全て破棄し、newPendingSteps から新しい pending Phase 列を生成する。
 *   各 Phase の order は「最後の started phase の order + 1」から連番。
 *   stepDef snapshot は StepDef から写す(label/order/skillRef/contracts/instruction)。
 * - newPendingSteps には 追加・削除・並べ替え・独自工程新設を表現できる(任意 id・任意順)。
 *
 * エラー:
 * - newPendingSteps が空 → EmptyPipeline (全工程消し禁止)
 * - 結果の step id に重複(started phase 分を含む全体で) → DuplicateStep
 *
 * INV-S2「phase 作成後不変」との関係:
 *   INV-S2 は started(running/review/done)phase の凍結として解釈する。
 *   pending phase の再構成は US-08 が導入する明示的例外であり、pending は
 *   まだ実行されていないため不変原則の保護対象外と判断する(US-08 D-02)。
 */
export const reconstructPipeline = (
  cycle: Cycle,
  newPendingSteps: readonly StepDef[],
): Result<Cycle, CycleError> => {
  if (newPendingSteps.length === 0) return err("EmptyPipeline");

  // 保持 phase: pending 以外 (running / review / done)
  const startedPhases = cycle.phases.filter((p) => p.state !== "pending");

  // 重複チェック: started の step id + newPendingSteps の id が全体で一意
  const seenIds = new Set<string>(startedPhases.map((p) => p.step as string));
  for (const s of newPendingSteps) {
    const key = s.id as string;
    if (seenIds.has(key)) return err("DuplicateStep");
    seenIds.add(key);
  }

  // 新 pending phase の order ベース: 最後の started phase の order + 1(started が無ければ 0)
  const baseOrder =
    startedPhases.length === 0
      ? 0
      : Math.max(...startedPhases.map((p) => p.order)) + 1;

  const newPendingPhases: Phase[] = newPendingSteps.map((s, i) => {
    // StepDef → StepDefSnapshot(US-08: instruction を含む全フィールドを写す)
    const snapshot: StepDefSnapshot = {
      label: s.label,
      order: baseOrder + i,
      skillRef: s.skillRef,
      ...(s.contracts !== undefined ? { contracts: s.contracts } : {}),
      ...(s.instruction !== undefined ? { instruction: s.instruction } : {}),
    };
    return {
      // Phase id の採番は app の責務(S6 D-04)。
      // 再構成では stable な id を付与できないため、step id をベースにした仮 id を生成する。
      // アプリ層が reconstructPipeline を呼ぶ前に phaseId を採番して渡す設計への拡張余地は残すが、
      // ドメイン関数シグネチャは最小公倍数(US-08 スコープ)として step id 由来の id を使う。
      // D-03: 既存の Phase.id はアプリ層が管理するため、新 pending は "new-<step>" と明示する。
      id: `new-${s.id as string}` as PhaseId,
      step: s.id,
      order: baseOrder + i,
      state: "pending" as PhaseState,
      runs: [],
      stepDef: snapshot,
    };
  });

  return ok({ ...cycle, phases: [...startedPhases, ...newPendingPhases] });
};

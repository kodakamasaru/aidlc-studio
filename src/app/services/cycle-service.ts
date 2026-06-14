// cycle-service — create cycles, list/get them, and drive Phase execution
// (startPhase / retryRun). Side-effecting orchestrator calls happen AFTER the
// DB commit (S7 D-04): persist the new cycle state first, then launch/retry the
// headless run against the now-running phase.
import type { Ports } from "../ports/composition";
import { fail, messageOf, type ServiceError } from "./errors";
import { compensateRun } from "./compensate";
import { locatePhaseOfRun } from "./cycle-helpers";
import { nextVersion } from "./cycle-version";
import {
  createCycle as domainCreateCycle,
  startPhase as domainStartPhase,
  relaunchPhase as domainRelaunchPhase,
  retryRun as domainRetryRun,
  reconstructPipeline as domainReconstructPipeline,
  version as parseVersion,
  type Cycle,
  type CycleError,
} from "../../domain/cycle/cycle";
import { assignToCycle } from "../../domain/task/task";
import { readPipeline, type Project, type StepDef } from "../../domain/project/project";
import { resolveContracts } from "../../domain/project/step-contracts";
import type { RunRole } from "../../domain/cycle/cycle";
import { Step, sameStep } from "../../domain/shared/vocab";
import { ProjectId, CycleId, TaskId, RunId } from "../../domain/shared/ids";
import { isErr } from "../../domain/shared/result";
import { resolveContextPaths, composeStructuredContext } from "./context-resolver";

export interface CreateCycleInput {
  readonly title: string;
  /**
   * Optional: when a non-empty string, it is validated + used (DuplicateVersion
   * if it collides). When omitted, the service auto-assigns nextVersion() — the
   * project's semver-max with patch +1 (or v0.0.1 for the first cycle).
   */
  readonly version?: string;
  readonly taskIds?: readonly string[];
}

/** Map a CycleError to its HTTP status (single mapping point per service). */
export const cycleErrorStatus = (error: CycleError): ServiceError => {
  switch (error) {
    case "CyclePaused":
    case "PrevPhaseNotDone":
    case "PhaseAlreadyRunning":
    case "PhaseNotRewound":
    case "RunNotFailedOrStalled":
    case "MaxAttemptExceeded":
      return fail(409, error);
    case "RunNotFound":
    case "PhaseNotFound":
      // Lookup failures (the addressed run/phase does not exist) → 404, like any
      // not-found, rather than the 400 default for malformed/illegal commands.
      return fail(404, error);
    default:
      return fail(400, error);
  }
};

/**
 * True when an error is a bun:sqlite UNIQUE-constraint violation. The
 * findByProjectVersion pre-check in createCycle is not atomic with the insert,
 * so a concurrent create can still hit the UNIQUE(projectId, version) index;
 * detecting it lets us return 409 DuplicateVersion instead of a generic 500.
 */
const isUniqueConstraintError = (err: unknown): boolean => {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT")) {
    return code.includes("UNIQUE") || code === "SQLITE_CONSTRAINT";
  }
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && message.includes("UNIQUE constraint failed");
};

/** Result returned from a successful hearing launch. */
export interface HearingLaunchResult {
  readonly cycleId: string;
  readonly runId: string;
  readonly step: string;
}

/**
 * BU-3: Reserved id for the hidden "system" cycle that hosts the global
 * config-hearing. This cycle is never shown in cycle listings (filtered at
 * the listCycles boundary). Direct access via getCycle / thread still works
 * so the web can navigate to the conversation thread by id.
 */
export const SYSTEM_CYCLE_ID = "__global_settings__" as const;

/** True when a cycle id refers to the system (global-hearing) cycle. */
export const isSystemCycle = (id: string): boolean => id === SYSTEM_CYCLE_ID;

export class CycleService {
  constructor(private readonly ports: Ports) {}

  private loadProject(projectId: ProjectId): Project {
    const project = this.ports.repos.projects.findById(projectId);
    if (!project) throw fail(404, "ProjectNotFound");
    return project;
  }

  private loadCycle(cycleId: CycleId): Cycle {
    const cycle = this.ports.repos.cycles.findById(cycleId);
    if (!cycle) throw fail(404, "CycleNotFound");
    return cycle;
  }

  createCycle(projectIdRaw: string, input: CreateCycleInput): Cycle {
    const projectId = ProjectId(projectIdRaw);
    const project = this.loadProject(projectId);

    // Resolve the version: an explicit (non-blank) one is validated + checked for
    // collision; an omitted one is auto-assigned as the project's semver-max + a
    // patch bump (or v0.0.1 for the first cycle). The derived value is unique by
    // construction (max+1); the UNIQUE index in the insert path is the backstop.
    const explicit =
      typeof input.version === "string" && input.version.trim().length > 0
        ? input.version.trim()
        : undefined;

    let versionStr: string;
    if (explicit !== undefined) {
      const parsed = parseVersion(explicit);
      if (isErr(parsed)) throw fail(400, parsed.error);
      const existing = this.ports.repos.cycles.findByProjectVersion(
        projectId,
        explicit,
      );
      if (existing) throw fail(409, "DuplicateVersion");
      versionStr = explicit;
    } else {
      const existingVersions = this.ports.repos.cycles
        .listByProject(projectId)
        .map((c) => c.version as string);
      versionStr = nextVersion(existingVersions);
    }

    const ver = parseVersion(versionStr);
    if (isErr(ver)) throw fail(400, ver.error);

    // US-02 / S6 phase-step-snapshot: pin the project's StepDef (label/skillRef/
    // contracts/order) onto each phase at creation time. The project pipelineDef IS
    // the resolved per-project default (+ any per-cycle override once that lands); the
    // domain just copies the snapshot through. file の後変更は既存サイクルに波及しない。
    const pipeline = project.pipelineDef.map((sd) => ({
      phaseId: this.ports.ids.phaseId(),
      step: sd.id,
      stepDef: {
        label: sd.label,
        order: sd.order,
        skillRef: sd.skillRef,
        ...(sd.contracts ? { contracts: sd.contracts } : {}),
      },
    }));

    const taskIds = (input.taskIds ?? []).map(TaskId);
    const created = domainCreateCycle({
      id: this.ports.ids.cycleId(),
      projectId,
      version: ver.value,
      title: input.title,
      taskIds,
      createdAt: this.ports.clock.now(),
      pipeline,
    });
    if (isErr(created)) throw cycleErrorStatus(created.error);
    const cycle = created.value;

    try {
      this.ports.uow.run(() => {
        this.ports.repos.cycles.save(cycle);
        if (taskIds.length > 0) {
          const tasks = taskIds.map((taskId) => {
            const task = this.ports.repos.tasks.findById(taskId);
            if (!task) throw fail(404, "TaskNotFound");
            const assigned = assignToCycle(task, cycle.id);
            if (isErr(assigned)) throw fail(409, assigned.error);
            return assigned.value;
          });
          this.ports.repos.tasks.saveMany(tasks);
        }
      });
    } catch (err) {
      // The findByProjectVersion pre-check above is not atomic with this insert;
      // a concurrent create can still trip UNIQUE(projectId, version). Map that
      // race to the same 409 DuplicateVersion rather than leaking a 500.
      if (isUniqueConstraintError(err)) throw fail(409, "DuplicateVersion");
      throw err;
    }

    return cycle;
  }

  listCycles(projectIdRaw: string): readonly Cycle[] {
    // Filter out the system (global-hearing) cycle — it must never appear in
    // the user-visible cycle list (sidebar / CycleListPage).
    return this.ports.repos.cycles
      .listByProject(ProjectId(projectIdRaw))
      .filter((c) => !isSystemCycle(c.id as string));
  }

  getCycle(cycleIdRaw: string): Cycle {
    return this.loadCycle(CycleId(cycleIdRaw));
  }

  async startPhase(cycleIdRaw: string, stepRaw: string): Promise<Cycle> {
    const cycleId = CycleId(cycleIdRaw);
    const cycle = this.loadCycle(cycleId);
    const project = this.loadProject(cycle.projectId);
    const step = Step(stepRaw);
    const runId = this.ports.ids.runId();
    // gen→gate→eval opt-in (S5 Unit-03 / S8): a step that declares a verification
    // contract runs as a "generator" whose BriefOut is gated then verified by an
    // evaluator. Steps without a verification contract stay role-less (the v0.0.1
    // single-run flow), so existing pipelines are unaffected.
    const role = this.generatorRoleFor(project, step);

    const started = domainStartPhase(cycle, {
      step,
      runId,
      startedAt: this.ports.clock.now(),
      ...(role !== undefined ? { role } : {}),
    });
    if (isErr(started)) throw cycleErrorStatus(started.error);

    return this.persistThenLaunch(
      started.value,
      project,
      cycleId,
      step,
      runId,
      "AI 実行の起動に失敗しました",
      role,
    );
  }

  /** "generator" when the step declares a VerificationContract; else undefined. */
  private generatorRoleFor(project: Project, step: Step): RunRole | undefined {
    const stepDef = readPipeline(project).find((sd) => sameStep(sd.id, step));
    const contracts = stepDef ? resolveContracts(stepDef) : undefined;
    return contracts?.verification ? "generator" : undefined;
  }

  /**
   * Re-execute a phase a backtrack rewound to "running" (US-13). startPhase only
   * accepts a PENDING phase, so the rewound phase needs its own command: append a
   * fresh attempt and launch, reusing the same post-commit launch+compensate path.
   */
  async relaunchPhase(cycleIdRaw: string, stepRaw: string): Promise<Cycle> {
    const cycleId = CycleId(cycleIdRaw);
    const cycle = this.loadCycle(cycleId);
    const project = this.loadProject(cycle.projectId);
    const step = Step(stepRaw);
    const runId = this.ports.ids.runId();

    const relaunched = domainRelaunchPhase(cycle, {
      step,
      runId,
      startedAt: this.ports.clock.now(),
    });
    if (isErr(relaunched)) throw cycleErrorStatus(relaunched.error);

    return this.persistThenLaunch(
      relaunched.value,
      project,
      cycleId,
      step,
      runId,
      "AI 実行の再起動に失敗しました",
    );
  }

  /**
   * Persist the advanced cycle, then launch the orchestrator post-commit (S7
   * D-04). Shared by startPhase/relaunchPhase. If launch throws, the run is
   * already persisted "running" with no live process — compensate it to "failed".
   */
  private async persistThenLaunch(
    next: Cycle,
    project: Project,
    cycleId: CycleId,
    step: Step,
    runId: RunId,
    failMsg: string,
    role?: RunRole,
  ): Promise<Cycle> {
    this.ports.uow.run(() => this.ports.repos.cycles.save(next));

    const phase = next.phases.find((p) => sameStep(p.step, step));
    if (!phase) throw fail(400, "StepNotInPipeline");

    // Unit-02 前段文脈注入: resolve prior-step artifact paths for the prompt composer.
    // The resolved paths are passed as contextPaths so the composer injects the current
    // cycle's done-step artifacts instead of defaulting to brief.md only (US-01 AC).
    const contextPaths = resolveContextPaths({
      cycle: next,
      step,
      repoPath: project.repoPath,
    });

    // BU-1 構造化コンテキスト: build §C7.1 named sections (3-9) from 3 sources
    // (docs via Fs / ledger file / DB repos). Live.ts uses composeWithStructuredContext()
    // when this is present. Scripted/legacy adapters ignore it (backward compat).
    // Section 7 (dialog Q&A): uses the current runId — a fresh run has no answered
    // questions yet, so the section is empty at launch time (populated in resume turns).
    // Section 9 (backtrack feedback): uses facts repo to find the most recent
    // visual_review rejection reason in this cycle (F-5: AI が却下理由を知らない問題の修正).
    const structuredContext = composeStructuredContext(
      { cycle: next, step, repoPath: project.repoPath },
      {
        fs: this.ports.fs,
        questions: this.ports.repos.questions,
        cycles: this.ports.repos.cycles,
        facts: this.ports.repos.facts,
        runId,
        cycleId,
      },
    );

    try {
      await this.ports.orchestrator.launch({
        runId,
        projectId: project.id,
        cycleId,
        phaseId: phase.id,
        step,
        repoPath: project.repoPath,
        ...(role !== undefined ? { role } : {}),
        ...(contextPaths.length > 0 ? { contextPaths } : {}),
        structuredContext,
      });
    } catch (err) {
      compensateRun(
        this.ports,
        cycleId,
        runId,
        "failed",
        `${failMsg}: ${messageOf(err)}`,
      );
      throw fail(502, "OrchestratorLaunchFailed");
    }

    return next;
  }

  /**
   * BU-3: lazily ensure the ONE reserved "system" cycle that hosts the global
   * config-hearing. Called on every global hearing launch so re-launches after
   * the cycle is exhausted recreate it cleanly.
   *
   * The system cycle:
   *   - id = SYSTEM_CYCLE_ID
   *   - version = "v0.0.0" (lowest semver so it does not conflict with real cycles;
   *     the domain createCycle accepts any Version-branded string)
   *   - belongs to the given projectId
   *   - pipeline = single S1 phase (enough to host config questions)
   *   - title = hidden internal label (users never see it)
   *
   * If the system cycle already exists in the DB AND still has a pending phase,
   * it is reused (idempotent). If all phases are already running/done, a fresh
   * system cycle replaces the old one (it is re-persisted with a new phaseId
   * so the old run history is abandoned).
   */
  private ensureSystemCycle(projectId: ProjectId): Cycle {
    const cycleId = CycleId(SYSTEM_CYCLE_ID);
    const existing = this.ports.repos.cycles.findById(cycleId);
    if (existing) {
      const hasPending = existing.phases.some((p) => p.state === "pending");
      if (hasPending) return existing;
    }

    // Create (or re-create) the system cycle with a fresh S1 phase.
    const project = this.loadProject(projectId);
    const s1Def = project.pipelineDef.find((sd) => (sd.id as string) === "S1");
    const pipeline = s1Def
      ? [
          {
            phaseId: this.ports.ids.phaseId(),
            step: Step("S1"),
            stepDef: {
              label: s1Def.label,
              order: s1Def.order,
              skillRef: s1Def.skillRef,
              ...(s1Def.contracts ? { contracts: s1Def.contracts } : {}),
            },
          },
        ]
      : [
          {
            phaseId: this.ports.ids.phaseId(),
            step: Step("S1"),
          },
        ];

    // Use the Version brand directly — "v0.0.0" matches VERSION_RE.
    const ver = parseVersion("v0.0.0");
    if (isErr(ver)) throw fail(500, "SystemCycleVersionInvalid");

    const created = domainCreateCycle({
      id: cycleId,
      projectId,
      version: ver.value,
      title: "(global-settings)",
      taskIds: [],
      createdAt: this.ports.clock.now(),
      pipeline,
    });
    if (isErr(created)) throw fail(500, `SystemCycleCreateFailed: ${created.error}`);

    const cycle = created.value;
    this.ports.uow.run(() => this.ports.repos.cycles.save(cycle));
    return cycle;
  }

  /**
   * BU-3 global hearing: ensure the system cycle for the given project, then
   * launch a config-hearing run on its first pending phase.
   * The launch carries hearingScope="global" so the orchestrator emits questions
   * with target.scope="global" → answers write to project.pipelineDef.
   * Returns cycleId=SYSTEM_CYCLE_ID + runId + step so the web can navigate to
   * the conversation thread by the system cycle id.
   */
  async launchGlobalConfigHearing(projectIdRaw: string): Promise<HearingLaunchResult> {
    const projectId = ProjectId(projectIdRaw);
    const systemCycle = this.ensureSystemCycle(projectId);

    const pendingPhase = systemCycle.phases
      .slice()
      .sort((a, b) => a.order - b.order)
      .find((p) => p.state === "pending");
    if (!pendingPhase) throw fail(409, "HearingNoPendingPhase");

    // Build the "started" cycle using the domain command.
    const runId = this.ports.ids.runId();
    const step = pendingPhase.step;

    const started = domainStartPhase(systemCycle, {
      step,
      runId,
      startedAt: this.ports.clock.now(),
    });
    if (isErr(started)) throw cycleErrorStatus(started.error);

    const project = this.loadProject(projectId);
    const next = started.value;
    this.ports.uow.run(() => this.ports.repos.cycles.save(next));

    const phase = next.phases.find((p) => sameStep(p.step, step));
    if (!phase) throw fail(400, "StepNotInPipeline");

    // Structured context is minimal for the global hearing cycle.
    const contextPaths: readonly string[] = [];
    const structuredContext = composeStructuredContext(
      { cycle: next, step, repoPath: project.repoPath },
      {
        fs: this.ports.fs,
        questions: this.ports.repos.questions,
        cycles: this.ports.repos.cycles,
        runId,
        cycleId: CycleId(SYSTEM_CYCLE_ID),
      },
    );

    try {
      await this.ports.orchestrator.launch({
        runId,
        projectId,
        cycleId: CycleId(SYSTEM_CYCLE_ID),
        phaseId: phase.id,
        step,
        repoPath: project.repoPath,
        // Signal the orchestrator that this is a global hearing so config
        // questions carry target.scope="global" instead of "cycle:{id}".
        hearingScope: "global",
        ...(contextPaths.length > 0 ? { contextPaths } : {}),
        structuredContext,
      });
    } catch (err) {
      compensateRun(
        this.ports,
        CycleId(SYSTEM_CYCLE_ID),
        runId,
        "failed",
        `グローバル設定ヒアリングの起動に失敗しました: ${messageOf(err)}`,
      );
      throw fail(502, "OrchestratorLaunchFailed");
    }

    return { cycleId: SYSTEM_CYCLE_ID, runId: runId as string, step: step as string };
  }

  /**
   * BU-3: launch a config-hearing run against a cycle.
   * Finds the first pending phase and starts it so the orchestrator (running in
   * config-hearing scenario) can emit config-hearing questions.
   * Returns the cycleId, the fresh runId, and the step so the web can navigate to
   * /cycles/:cycleId/thread?hearing=1.
   *
   * Restriction: there must be at least one PENDING phase in the cycle. If all
   * phases are already running or done, throws 409 HearingNoPendingPhase.
   */
  async launchConfigHearing(cycleIdRaw: string): Promise<HearingLaunchResult> {
    const cycle = this.loadCycle(CycleId(cycleIdRaw));
    const pendingPhase = cycle.phases
      .slice()
      .sort((a, b) => a.order - b.order)
      .find((p) => p.state === "pending");
    if (!pendingPhase) throw fail(409, "HearingNoPendingPhase");
    const updated = await this.startPhase(cycleIdRaw, pendingPhase.step as string);
    const started = updated.phases.find((p) => p.step === pendingPhase.step);
    const run = started?.runs.slice().sort((a, b) => b.attempt - a.attempt)[0];
    if (!run) throw fail(500, "HearingRunNotFound");
    return { cycleId: cycleIdRaw, runId: run.id, step: pendingPhase.step as string };
  }

  /**
   * US-08: サイクルの未着手 pending 工程列を newPendingSteps で全置換する(着手済は凍結)。
   *
   * 処理フロー:
   * 1. cycle を repo から load し `reconstructPipeline` を呼ぶ(ドメイン純粋関数)。
   * 2. ドメインが返した Cycle の pending Phase は id が "new-<stepId>" の仮 id 。
   *    app 層が `ports.ids.phaseId()` (UUID) で実 id に採番し直す(S6 D-04 遵守)。
   * 3. 採番済み Cycle を保存して返す。
   *
   * エラーマッピング:
   *   EmptyPipeline → 400  (全工程消し禁止)
   *   DuplicateStep → 409  (着手済み step id と新 step id が重複)
   */
  applyCycleReconstruction(
    cycleIdRaw: string,
    newPendingSteps: readonly StepDef[],
  ): Cycle {
    const cycleId = CycleId(cycleIdRaw);
    const cycle = this.loadCycle(cycleId);

    // ドメイン関数で pending 置換 — 仮 "new-<stepId>" id の Cycle が返る
    const reconstructed = domainReconstructPipeline(cycle, newPendingSteps);
    if (isErr(reconstructed)) throw cycleErrorStatus(reconstructed.error);

    // 仮 id を実 PhaseId(UUID)に採番し直す。
    // createCycle で pipeline.map(sd => ({ phaseId: ports.ids.phaseId(), ... })) しているのと同一方式。
    const next: Cycle = {
      ...reconstructed.value,
      phases: reconstructed.value.phases.map((p) =>
        (p.id as string).startsWith("new-")
          ? { ...p, id: this.ports.ids.phaseId() }
          : p,
      ),
    };

    this.ports.uow.run(() => this.ports.repos.cycles.save(next));
    return next;
  }

  /**
   * US-08: S1 確定後に scripted/live オーケストレータが emit した
   * ReconstructionProposal を取得する。
   * 提案が存在しない場合は undefined を返す(HTTP 層が 404 に変換)。
   */
  getReconstructionProposal(cycleIdRaw: string): object | undefined {
    // Verify the cycle exists — throws 404 if not.
    this.loadCycle(CycleId(cycleIdRaw));
    return this.ports.repos.reconstructionProposals.find(CycleId(cycleIdRaw));
  }

  async retryRun(cycleIdRaw: string, runIdRaw: string): Promise<Cycle> {
    const cycleId = CycleId(cycleIdRaw);
    const cycle = this.loadCycle(cycleId);
    const project = this.loadProject(cycle.projectId);
    const runId = RunId(runIdRaw);
    const newRunId = this.ports.ids.runId();

    const retried = domainRetryRun(cycle, {
      runId,
      newRunId,
      startedAt: this.ports.clock.now(),
      maxAttempt: project.env.maxAttempt,
    });
    if (isErr(retried)) throw cycleErrorStatus(retried.error);
    const next = retried.value;

    this.ports.uow.run(() => this.ports.repos.cycles.save(next));

    const phase = locatePhaseOfRun(next, runId);

    // Post-commit retry: if it throws, compensate the NEW attempt run to "failed".
    try {
      await this.ports.orchestrator.retry({
        runId,
        newRunId,
        projectId: project.id,
        cycleId,
        phaseId: phase.id,
        step: phase.step,
        repoPath: project.repoPath,
      });
    } catch (err) {
      compensateRun(
        this.ports,
        cycleId,
        newRunId,
        "failed",
        `AI 実行のリトライに失敗しました: ${messageOf(err)}`,
      );
      throw fail(502, "OrchestratorRetryFailed");
    }

    return next;
  }
}

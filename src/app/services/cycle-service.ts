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
  version as parseVersion,
  type Cycle,
  type CycleError,
} from "../../domain/cycle/cycle";
import { assignToCycle } from "../../domain/task/task";
import { readPipeline, type Project } from "../../domain/project/project";
import { resolveContracts } from "../../domain/project/step-contracts";
import type { RunRole } from "../../domain/cycle/cycle";
import { Step, sameStep } from "../../domain/shared/vocab";
import { ProjectId, CycleId, TaskId, RunId } from "../../domain/shared/ids";
import { isErr } from "../../domain/shared/result";

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
    return this.ports.repos.cycles.listByProject(ProjectId(projectIdRaw));
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

    try {
      await this.ports.orchestrator.launch({
        runId,
        projectId: project.id,
        cycleId,
        phaseId: phase.id,
        step,
        repoPath: project.repoPath,
        ...(role !== undefined ? { role } : {}),
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

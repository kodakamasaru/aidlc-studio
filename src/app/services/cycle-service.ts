// cycle-service — create cycles, list/get them, and drive Phase execution
// (startPhase / retryRun). Side-effecting orchestrator calls happen AFTER the
// DB commit (S7 D-04): persist the new cycle state first, then launch/retry the
// headless run against the now-running phase.
import type { Ports } from "../ports/composition";
import { fail, type ServiceError } from "./errors";
import { compensateRun } from "./compensate";
import { locatePhaseOfRun } from "./cycle-helpers";
import {
  createCycle as domainCreateCycle,
  startPhase as domainStartPhase,
  retryRun as domainRetryRun,
  version as parseVersion,
  type Cycle,
  type CycleError,
} from "../../domain/cycle/cycle";
import { assignToCycle } from "../../domain/task/task";
import type { Project } from "../../domain/project/project";
import { Step, sameStep } from "../../domain/shared/vocab";
import { ProjectId, CycleId, TaskId, RunId } from "../../domain/shared/ids";
import { isErr } from "../../domain/shared/result";

export interface CreateCycleInput {
  readonly title: string;
  readonly version: string;
  readonly taskIds?: readonly string[];
}

/** Map a CycleError to its HTTP status (single mapping point per service). */
export const cycleErrorStatus = (error: CycleError): ServiceError => {
  switch (error) {
    case "CyclePaused":
    case "PrevPhaseNotDone":
    case "PhaseAlreadyRunning":
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

    const ver = parseVersion(input.version);
    if (isErr(ver)) throw fail(400, ver.error);

    const existing = this.ports.repos.cycles.findByProjectVersion(
      projectId,
      input.version,
    );
    if (existing) throw fail(409, "DuplicateVersion");

    const pipeline = project.pipelineDef.map((sd) => ({
      phaseId: this.ports.ids.phaseId(),
      step: sd.id,
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

    const started = domainStartPhase(cycle, {
      step,
      runId,
      startedAt: this.ports.clock.now(),
    });
    if (isErr(started)) throw cycleErrorStatus(started.error);
    const next = started.value;

    this.ports.uow.run(() => this.ports.repos.cycles.save(next));

    const phase = next.phases.find((p) => sameStep(p.step, step));
    if (!phase) throw fail(400, "StepNotInPipeline");

    // Orchestrator runs post-commit: if launch throws, the run is already
    // persisted "running" with no live process — compensate it to "failed".
    try {
      await this.ports.orchestrator.launch({
        runId,
        projectId: project.id,
        cycleId,
        phaseId: phase.id,
        step,
        repoPath: project.repoPath,
      });
    } catch {
      compensateRun(this.ports, cycleId, runId, "failed");
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
    } catch {
      compensateRun(this.ports, cycleId, newRunId, "failed");
      throw fail(502, "OrchestratorRetryFailed");
    }

    return next;
  }
}

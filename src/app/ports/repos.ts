// Repository ports. One per aggregate root (+ external-memory sub-stores).
// Reads return undefined when absent (business "not found" stays in the
// service layer). Writes are idempotent upserts by id. All queries that span a
// workspace are scoped by ProjectId — v0 multi-tenant boundary (S7 D-07).
//
// Implementations (src/infra/db) share one bun:sqlite connection and run inside
// the ambient UnitOfWork transaction when one is active.
import type { Cycle } from "../../domain/cycle/cycle";
import type { Task, TaskProposal } from "../../domain/task/task";
import type { Question } from "../../domain/question/question";
import type { Fact } from "../../domain/facts/facts";
import type { Review } from "../../domain/review/review";
import type { Project } from "../../domain/project/project";
import type {
  ArtifactRef,
  WikiDoc,
  WikiSection,
} from "../../domain/external-memory/external-memory";
import type {
  ProjectId,
  CycleId,
  RunId,
  TaskId,
  QuestionId,
  FactId,
} from "../../domain/shared/ids";

export interface ProjectRepo {
  save(project: Project): void;
  findById(id: ProjectId): Project | undefined;
  list(): readonly Project[];
}

export interface CycleRepo {
  save(cycle: Cycle): void;
  findById(id: CycleId): Cycle | undefined;
  listByProject(projectId: ProjectId): readonly Cycle[];
  /** All cycles across every project — used by startup reconcile to find orphaned runs. */
  listAll(): readonly Cycle[];
  /** version is unique within a project; used to enforce DuplicateVersion. */
  findByProjectVersion(projectId: ProjectId, version: string): Cycle | undefined;
}

export interface TaskRepo {
  save(task: Task): void;
  saveMany(tasks: readonly Task[]): void;
  findById(id: TaskId): Task | undefined;
  listByProject(projectId: ProjectId): readonly Task[];
  listByCycle(cycleId: CycleId): readonly Task[];
}

export interface ProposalRepo {
  // projectId is a persistence-scope param (TaskProposal carries none), mirroring
  // WikiRepo. Lets the inbox/backlog scope proposals per project.
  save(projectId: ProjectId, proposal: TaskProposal): void;
  findById(id: TaskProposal["id"]): TaskProposal | undefined;
  listByProject(projectId: ProjectId): readonly TaskProposal[];
}

export interface QuestionRepo {
  save(question: Question): void;
  findById(id: QuestionId): Question | undefined;
  /** Inbox: all open questions in a project (join via cycle.projectId). */
  listOpenByProject(projectId: ProjectId): readonly Question[];
  listByRun(runId: RunId): readonly Question[];
  listByCycle(cycleId: CycleId): readonly Question[];
}

export interface FactRepo {
  save(fact: Fact): void;
  findById(id: FactId): Fact | undefined;
  listByCycle(cycleId: CycleId): readonly Fact[];
}

export interface ReviewRepo {
  save(review: Review): void;
  findByRun(runId: RunId): readonly Review[];
  findByRunTask(runId: RunId, taskId: TaskId | null): Review | undefined;
  listByCycle(cycleId: CycleId): readonly Review[];
}

export interface ArtifactRepo {
  save(ref: ArtifactRef): void;
  listByCycle(cycleId: CycleId): readonly ArtifactRef[];
  findByPath(path: string): ArtifactRef | undefined;
}

export interface WikiRepo {
  save(projectId: ProjectId, doc: WikiDoc): void;
  find(projectId: ProjectId, section: WikiSection): WikiDoc | undefined;
}

/**
 * Unit-04: persists the claude session_id (captured from the stream-json init
 * line) keyed to the RunId that produced it. Used to pass --resume <sessionId>
 * when re-spawning for the next turn. session_id never lives on the domain Run
 * (S6 D-02 / cycle-run-aggregate.md R-01).
 */
export interface SessionRepo {
  /** Upsert: later turns for the same runId overwrite (all turns in one hearing share one row). */
  save(runId: RunId, sessionId: string): void;
  /** Returns null when no session has been captured for this run yet. */
  find(runId: RunId): string | null;
}

/**
 * US-08: stores ReconstructionProposal keyed by cycleId.
 * The scripted/live orchestrator adapter parses an aidlc-reconstruction block
 * and calls save(). The web fetches it via GET /api/cycles/:id/reconstruction-proposal.
 * One proposal slot per cycle (latest write wins — scripted/live may re-emit on retry).
 */
export interface ReconstructionProposalRepo {
  /** Upsert by cycleId (one slot per cycle, latest write wins). */
  save(cycleId: CycleId, proposal: object): void;
  /** Returns undefined when no proposal has been stored for this cycle yet. */
  find(cycleId: CycleId): object | undefined;
}

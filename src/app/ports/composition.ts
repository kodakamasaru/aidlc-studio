// Ports bundle — the full set of injected dependencies an application service
// needs. The composition root (src/server.ts) builds this from concrete infra
// adapters; tests build it from in-memory / fake adapters. Services receive
// `Ports` and never import infra directly (dependency inversion).
import type { Clock, IdGen, Fs } from "./sys";
import type { UnitOfWork } from "./unit-of-work";
import type { OrchestratorPort } from "./orchestrator";
import type { NotifyPort } from "./notify";
import type {
  ProjectRepo,
  CycleRepo,
  TaskRepo,
  ProposalRepo,
  QuestionRepo,
  FactRepo,
  ReviewRepo,
  ArtifactRepo,
  WikiRepo,
  SessionRepo,
} from "./repos";

export interface Repos {
  readonly projects: ProjectRepo;
  readonly cycles: CycleRepo;
  readonly tasks: TaskRepo;
  readonly proposals: ProposalRepo;
  readonly questions: QuestionRepo;
  readonly facts: FactRepo;
  readonly reviews: ReviewRepo;
  readonly artifacts: ArtifactRepo;
  readonly wiki: WikiRepo;
  /** Unit-04: runId → claude session_id store (infra-only; not on domain Run). */
  readonly sessions: SessionRepo;
}

export interface Ports {
  readonly clock: Clock;
  readonly ids: IdGen;
  /** Filesystem existence probe for the Deterministic gate (S5 Unit-03 §4). */
  readonly fs: Fs;
  readonly uow: UnitOfWork;
  readonly repos: Repos;
  readonly orchestrator: OrchestratorPort;
  readonly notify: NotifyPort;
}

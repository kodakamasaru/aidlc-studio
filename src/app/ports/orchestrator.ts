// OrchestratorPort — the Agent-execution boundary (S3 Unit-02). The domain
// depends only on this interface; concrete adapters (scripted | live local
// Claude CLI) are bound at the composition root. S7 D-01 / D-06.
//
// The adapter never writes the DB. Instead it pushes raw run emissions to a
// DomainEventSink, which the app layer normalizes and persists in one
// transaction (S7 D-04).
import type { Text } from "../../domain/shared/primitives";
import type { Step } from "../../domain/shared/vocab";
import type { ProjectId, CycleId, PhaseId, RunId } from "../../domain/shared/ids";
import type { DomainEvent } from "../../domain/events/events";

/** Context needed to start a headless run for one Phase attempt. */
export interface RunLaunch {
  readonly runId: RunId;
  readonly projectId: ProjectId;
  readonly cycleId: CycleId;
  readonly phaseId: PhaseId;
  readonly step: Step;
  /** Absolute repo path of the target project (worktree base). */
  readonly repoPath: string;
  /** Optional git worktree ref for parallel-cycle isolation. */
  readonly worktreeRef?: string;
}

export interface ResumeRun {
  readonly runId: RunId;
  /** Human answer body injected to resume the waiting run. */
  readonly body?: Text;
}

export interface RetryLaunch {
  readonly runId: RunId;
  readonly newRunId: RunId;
  readonly projectId: ProjectId;
  readonly cycleId: CycleId;
  readonly phaseId: PhaseId;
  readonly step: Step;
  readonly repoPath: string;
  readonly worktreeRef?: string;
}

/**
 * Run context bound to every emission. Domain events (events.ts) only carry
 * runId, so the adapter attaches the cycle/phase/step/project it was launched
 * with — the sink needs these to build Question/Review aggregates (which require
 * cycleId) and to advance the right Cycle.
 */
export interface RunContext {
  readonly runId: RunId;
  readonly projectId: ProjectId;
  readonly cycleId: CycleId;
  readonly phaseId: PhaseId;
  readonly step: Step;
}

/** One normalized emission from a run: its context + the domain event. */
export interface RunEmission {
  readonly ctx: RunContext;
  readonly event: DomainEvent;
}

/**
 * Sink for run emissions. Adapters emit context-tagged DomainEvents; the
 * app-layer sink applies them (persist Question / Review, advance Run) in a
 * single transaction per emission (S7 D-04).
 */
export type DomainEventSink = (emission: RunEmission) => Promise<void>;

export interface OrchestratorPort {
  /** Launch a fresh headless run for a Phase. Resolves once the run is started. */
  launch(cmd: RunLaunch): Promise<void>;
  /** Inject a human answer and resume a waiting run. */
  resume(cmd: ResumeRun): Promise<void>;
  /** Start a new attempt for a failed/stalled run. */
  retry(cmd: RetryLaunch): Promise<void>;
  /** Abort a running run. */
  cancel(cmd: { readonly runId: RunId }): Promise<void>;
}

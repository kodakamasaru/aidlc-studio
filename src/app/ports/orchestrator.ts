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
import type { RunRole } from "../../domain/cycle/cycle";
import type { DomainEvent } from "../../domain/events/events";
import type { StructuredContext } from "../../app/services/context-resolver";

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
  /**
   * S8 / S5 Unit-03: when "generator", this run is the gen half of a gen→gate→eval
   * step — the adapter emits a typed BriefOut (ResultEmitted carrying completeness)
   * instead of the v0.0.1 single-run flow. Omitted = role-less (legacy single run).
   */
  readonly role?: RunRole;
  /**
   * Unit-02 前段文脈注入: resolved prior-step artifact paths to pass as contextPaths to
   * PromptComposer. When present, the composer uses these instead of its brief.md default.
   * Omitted = composer uses its own default (brief.md only). Computed by resolveContextPaths.
   */
  readonly contextPaths?: readonly string[];
  /**
   * BU-1 構造化コンテキスト: pre-built §C7.1 named sections (3-8) produced by
   * composeStructuredContext(). When present, live.ts uses composeWithStructuredContext()
   * instead of the legacy compose() path, injecting brief/requirements/prior-artifacts/
   * decisions/dialog-state/output-contract as named sections. Backward compat: when
   * absent (all scripted tests, legacy paths), the legacy compose() path is used unchanged.
   */
  readonly structuredContext?: StructuredContext;
  /**
   * BU-3 global hearing scope: "global" | "cycle:{id}". Passed through to the
   * config-hearing scenario so the emitted QuestionRaised target.scope reflects
   * whether answers should write to project.pipelineDef (global) or the cycle
   * phase snapshot (cycle). Omitted for non-hearing runs (backward compat).
   */
  readonly hearingScope?: string;
  /**
   * US-08 会話で修正: when re-launching a reconstruction (hearingScope="reconstruction")
   * because the human asked to revise the proposal, this carries their free-text
   * feedback. The composer injects it so the AI re-proposes taking the feedback into
   * account; the scripted adapter emits a revised proposal. Omitted on the first
   * (auto) reconstruction launch.
   */
  readonly reconstructionFeedback?: string;
}

/**
 * Context to launch the evaluator half of a gen→gate→eval step (S5 Unit-03 §3 / C).
 * Distinct from RunLaunch because it references the generator run it verifies and
 * carries the step's verification observations (what the evaluator must check).
 */
export interface EvalLaunch {
  readonly runId: RunId;
  readonly projectId: ProjectId;
  readonly cycleId: CycleId;
  readonly phaseId: PhaseId;
  readonly step: Step;
  readonly repoPath: string;
  /** The generator run whose BriefOut this evaluator verifies. */
  readonly generatorRunId: RunId;
  /** The step's VerificationContract observations (what to check). */
  readonly verification?: readonly Text[];
  readonly worktreeRef?: string;
}

export interface ResumeRun {
  readonly runId: RunId;
  /** Human answer body injected to resume the waiting run. */
  readonly body?: Text;
  /**
   * Unit-04: the claude session_id to pass to `--resume`. Fetched from the
   * SessionRepo by the inbox-service before calling port.resume. Absent when the
   * run has no captured session (body also absent → finalize path; body present
   * but sessionId absent → emit stalled so the failure is visible / 原則④).
   * Never on the domain command (S6 D-02 / cycle-run-aggregate.md R-01).
   */
  readonly sessionId?: string;
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
  /**
   * Launch the evaluator run for a gen→gate→eval step, after the deterministic gate
   * passed (S5 Unit-03 §3). Emits the evaluator's ResultEmitted (carrying its
   * completeness verdict) + any descope QuestionRaised through the same sink.
   */
  launchEval(cmd: EvalLaunch): Promise<void>;
  /** Inject a human answer and resume a waiting run. */
  resume(cmd: ResumeRun): Promise<void>;
  /** Start a new attempt for a failed/stalled run. */
  retry(cmd: RetryLaunch): Promise<void>;
  /** Abort a running run. */
  cancel(cmd: { readonly runId: RunId }): Promise<void>;
}

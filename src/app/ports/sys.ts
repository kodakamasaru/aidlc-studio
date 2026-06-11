// System ports: clock + id generation. Injected so tests can pin deterministic
// values while production uses wall-clock + random ids. S7 D-05.
import type { Instant } from "../../domain/shared/primitives";
import type {
  ProjectId,
  CycleId,
  PhaseId,
  RunId,
  TaskId,
  QuestionId,
  FactId,
  ProposalId,
  LedgerEntryId,
} from "../../domain/shared/ids";

/** Wall-clock abstraction. `now()` always returns a valid ISO-8601 Instant. */
export interface Clock {
  now(): Instant;
}

/**
 * Filesystem existence probe (S5 Unit-03 §4 `sys`). Injected so the Deterministic
 * gate stays AI-independent and deterministic: production checks the real disk,
 * tests pin a known set. Only `exists` is needed (gate reads no content / YAGNI).
 */
export interface Fs {
  exists(path: string): boolean;
}

/** Branded id factory. One method per aggregate id so call sites stay typed. */
export interface IdGen {
  projectId(): ProjectId;
  cycleId(): CycleId;
  phaseId(): PhaseId;
  runId(): RunId;
  taskId(): TaskId;
  questionId(): QuestionId;
  factId(): FactId;
  proposalId(): ProposalId;
  ledgerEntryId(): LedgerEntryId;
}

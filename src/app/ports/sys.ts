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
} from "../../domain/shared/ids";

/** Wall-clock abstraction. `now()` always returns a valid ISO-8601 Instant. */
export interface Clock {
  now(): Instant;
}

/**
 * Filesystem port (S5 Unit-03 §4 `sys`). Injected so consumers stay testable:
 * production checks/reads the real disk, tests pin known content.
 * - `exists`: the Deterministic gate's AI-independent path probe.
 * - `read`: v0.0.3 US-03 — the PromptComposer reads skill 本文(kit/skills/.../SKILL.md)
 *   through this port (no infra-direct read in app, keeps hexagonal). Returns the
 *   file content, or `undefined` when the path is missing/unreadable (the composer
 *   turns that into an explicit error — no silent fallback / 原則④).
 */
export interface Fs {
  exists(path: string): boolean;
  read(path: string): string | undefined;
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
}

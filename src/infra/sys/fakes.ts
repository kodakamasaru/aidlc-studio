// Deterministic Clock/IdGen fakes for tests. The full loop is verified
// deterministically in later phases, so these must be reproducible: FixedClock
// returns a fixed instant (or steps through a supplied sequence), SeqIdGen
// emits `${kind}-1`, `${kind}-2`, … per id kind.
import type { Clock, IdGen, Fs } from "../../app/ports/sys";
import type { Instant } from "../../domain/shared/primitives";
import { instant } from "../../domain/shared/primitives";
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
import {
  ProjectId as makeProjectId,
  CycleId as makeCycleId,
  PhaseId as makePhaseId,
  RunId as makeRunId,
  TaskId as makeTaskId,
  QuestionId as makeQuestionId,
  FactId as makeFactId,
  ProposalId as makeProposalId,
} from "../../domain/shared/ids";

const DEFAULT_INSTANT = "2026-01-01T00:00:00.000Z";

const toInstant = (iso: string): Instant => {
  const r = instant(iso);
  if (!r.ok) throw new Error(`FixedClock got invalid ISO instant: ${iso}`);
  return r.value;
};

/**
 * FixedClock — returns a single fixed instant, or steps through `seq` one
 * instant per `now()` call. When the sequence is exhausted, the last value is
 * returned indefinitely (so over-calling never throws in a test).
 */
export class FixedClock implements Clock {
  private index = 0;
  private readonly instants: readonly Instant[];

  constructor(seq?: readonly string[]) {
    const source = seq && seq.length > 0 ? seq : [DEFAULT_INSTANT];
    this.instants = source.map(toInstant);
  }

  now(): Instant {
    const i = Math.min(this.index, this.instants.length - 1);
    this.index += 1;
    const value = this.instants[i];
    // Guarded above: index is clamped into range and the array is non-empty.
    if (value === undefined) throw new Error("FixedClock sequence empty");
    return value;
  }
}

/**
 * FakeFs — deterministic Fs port for tests. Default `exists` returns true (every
 * artifact path is treated as present, so the Deterministic gate only exercises
 * its block check); pass a `present` set to pin which paths exist.
 */
export class FakeFs implements Fs {
  private readonly present: ReadonlySet<string> | undefined;
  private readonly contents: ReadonlyMap<string, string>;
  constructor(present?: readonly string[], contents?: Readonly<Record<string, string>>) {
    this.present = present ? new Set(present) : undefined;
    this.contents = new Map(Object.entries(contents ?? {}));
  }
  exists(path: string): boolean {
    return this.present === undefined ? true : this.present.has(path);
  }
  // US-03: returns pinned content for a path, or undefined (= missing/unreadable).
  read(path: string): string | undefined {
    return this.contents.get(path);
  }
}

/**
 * SeqIdGen — monotonically numbered ids per kind: `${prefix}${kind}-1`, `-2`, …
 * Each id kind has its own counter so ids stay stable and human-readable.
 */
export class SeqIdGen implements IdGen {
  private readonly counters = new Map<string, number>();

  constructor(private readonly prefix = "") {}

  private next(kind: string): string {
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    return `${this.prefix}${kind}-${n}`;
  }

  projectId(): ProjectId {
    return makeProjectId(this.next("project"));
  }
  cycleId(): CycleId {
    return makeCycleId(this.next("cycle"));
  }
  phaseId(): PhaseId {
    return makePhaseId(this.next("phase"));
  }
  runId(): RunId {
    return makeRunId(this.next("run"));
  }
  taskId(): TaskId {
    return makeTaskId(this.next("task"));
  }
  questionId(): QuestionId {
    return makeQuestionId(this.next("question"));
  }
  factId(): FactId {
    return makeFactId(this.next("fact"));
  }
  proposalId(): ProposalId {
    return makeProposalId(this.next("proposal"));
  }
}

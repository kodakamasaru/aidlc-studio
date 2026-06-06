// UnitOfWork — atomic boundary for multi-aggregate writes. Required by the
// answer flow: applyAnswer() returns {question, fact, command}; the question +
// fact must persist in ONE transaction before the command is dispatched to the
// orchestrator (S6 handoff / S7 D-04).
//
// bun:sqlite transactions are synchronous, so `run` is synchronous: all repo
// writes inside `work` commit together, or roll back if `work` throws.
export interface UnitOfWork {
  run<T>(work: () => T): T;
}

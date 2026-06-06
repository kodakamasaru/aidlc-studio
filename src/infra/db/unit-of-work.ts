// SqliteUnitOfWork — wraps `work` in a synchronous bun:sqlite transaction. All
// repo writes inside `work` commit together; if `work` throws, the transaction
// rolls back and the error propagates (S7 D-04).
import type { Database } from "bun:sqlite";
import type { UnitOfWork } from "../../app/ports/unit-of-work";

export class SqliteUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Database) {}

  run<T>(work: () => T): T {
    return this.db.transaction(work)();
  }
}

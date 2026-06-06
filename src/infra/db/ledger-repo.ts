// LedgerRepo (SQLite). Scalar cycleFrom for listByCycle. LedgerEntry has no
// projectId, so listByProject joins ledger→cycles on cycleFrom = cycles.id and
// filters cycles.projectId (the cycle owns the project scope, S7 D-07).
import type { Database } from "bun:sqlite";
import type { LedgerRepo } from "../../app/ports/repos";
import type { LedgerEntry } from "../../domain/external-memory/external-memory";
import type { CycleId, ProjectId } from "../../domain/shared/ids";
import { parseRows } from "./serde";

type Row = { readonly data: string };

export class SqliteLedgerRepo implements LedgerRepo {
  constructor(private readonly db: Database) {}

  save(entry: LedgerEntry): void {
    this.db.run(
      `INSERT INTO ledger (id, cycleFrom, data) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         cycleFrom = excluded.cycleFrom,
         data      = excluded.data`,
      [entry.id, entry.cycleFrom, JSON.stringify(entry)],
    );
  }

  listByCycle(cycleId: CycleId): readonly LedgerEntry[] {
    const rows = this.db
      .query("SELECT data FROM ledger WHERE cycleFrom = ? ORDER BY id")
      .all(cycleId) as Row[];
    return parseRows<LedgerEntry>(rows);
  }

  listByProject(projectId: ProjectId): readonly LedgerEntry[] {
    const rows = this.db
      .query(
        `SELECT l.data AS data
         FROM ledger l
         JOIN cycles c ON c.id = l.cycleFrom
         WHERE c.projectId = ?
         ORDER BY l.id`,
      )
      .all(projectId) as Row[];
    return parseRows<LedgerEntry>(rows);
  }
}

// FactRepo (SQLite). Scalar: cycleId for listByCycle. Revisions are nested in
// the JSON `data` blob (append-only history preserved).
import type { Database } from "bun:sqlite";
import type { FactRepo } from "../../app/ports/repos";
import type { Fact } from "../../domain/facts/facts";
import type { CycleId, FactId } from "../../domain/shared/ids";
import { parseRow, parseRows } from "./serde";

type Row = { readonly data: string };

export class SqliteFactRepo implements FactRepo {
  constructor(private readonly db: Database) {}

  save(fact: Fact): void {
    this.db.run(
      `INSERT INTO facts (id, cycleId, data) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         cycleId = excluded.cycleId,
         data    = excluded.data`,
      [fact.id, fact.cycleId, JSON.stringify(fact)],
    );
  }

  findById(id: FactId): Fact | undefined {
    const row = this.db
      .query("SELECT data FROM facts WHERE id = ?")
      .get(id) as Row | null;
    return parseRow<Fact>(row);
  }

  listByCycle(cycleId: CycleId): readonly Fact[] {
    const rows = this.db
      .query("SELECT data FROM facts WHERE cycleId = ? ORDER BY id")
      .all(cycleId) as Row[];
    return parseRows<Fact>(rows);
  }
}

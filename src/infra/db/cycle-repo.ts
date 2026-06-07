// CycleRepo (SQLite). JSON data + (projectId, version) scalars for project
// scoping and DuplicateVersion enforcement (UNIQUE(projectId, version)).
import type { Database } from "bun:sqlite";
import type { CycleRepo } from "../../app/ports/repos";
import type { Cycle } from "../../domain/cycle/cycle";
import type { CycleId, ProjectId } from "../../domain/shared/ids";
import { parseRow, parseRows } from "./serde";

type Row = { readonly data: string };

export class SqliteCycleRepo implements CycleRepo {
  constructor(private readonly db: Database) {}

  save(cycle: Cycle): void {
    this.db.run(
      `INSERT INTO cycles (id, projectId, version, data) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         projectId = excluded.projectId,
         version   = excluded.version,
         data      = excluded.data`,
      [cycle.id, cycle.projectId, cycle.version, JSON.stringify(cycle)],
    );
  }

  findById(id: CycleId): Cycle | undefined {
    const row = this.db
      .query("SELECT data FROM cycles WHERE id = ?")
      .get(id) as Row | null;
    return parseRow<Cycle>(row);
  }

  listByProject(projectId: ProjectId): readonly Cycle[] {
    const rows = this.db
      .query("SELECT data FROM cycles WHERE projectId = ? ORDER BY version")
      .all(projectId) as Row[];
    return parseRows<Cycle>(rows);
  }

  listAll(): readonly Cycle[] {
    const rows = this.db
      .query("SELECT data FROM cycles ORDER BY projectId, version")
      .all() as Row[];
    return parseRows<Cycle>(rows);
  }

  findByProjectVersion(
    projectId: ProjectId,
    version: string,
  ): Cycle | undefined {
    const row = this.db
      .query("SELECT data FROM cycles WHERE projectId = ? AND version = ?")
      .get(projectId, version) as Row | null;
    return parseRow<Cycle>(row);
  }
}

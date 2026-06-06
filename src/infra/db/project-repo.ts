// ProjectRepo (SQLite). Upsert by id; reads JSON.parse the `data` column and
// trust it (the row was serialized from a valid Project aggregate).
import type { Database } from "bun:sqlite";
import type { ProjectRepo } from "../../app/ports/repos";
import type { Project } from "../../domain/project/project";
import type { ProjectId } from "../../domain/shared/ids";
import { parseRow, parseRows } from "./serde";

type Row = { readonly data: string };

export class SqliteProjectRepo implements ProjectRepo {
  constructor(private readonly db: Database) {}

  save(project: Project): void {
    this.db.run(
      `INSERT INTO projects (id, data) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      [project.id, JSON.stringify(project)],
    );
  }

  findById(id: ProjectId): Project | undefined {
    const row = this.db
      .query("SELECT data FROM projects WHERE id = ?")
      .get(id) as Row | null;
    return parseRow<Project>(row);
  }

  list(): readonly Project[] {
    const rows = this.db
      .query("SELECT data FROM projects ORDER BY id")
      .all() as Row[];
    return parseRows<Project>(rows);
  }
}

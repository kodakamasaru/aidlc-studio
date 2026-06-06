// WikiRepo (SQLite). One doc per (projectId, section); projectId is supplied by
// the caller (WikiDoc itself carries only section + path). Upsert on that pair.
import type { Database } from "bun:sqlite";
import type { WikiRepo } from "../../app/ports/repos";
import type { WikiDoc, WikiSection } from "../../domain/external-memory/external-memory";
import type { ProjectId } from "../../domain/shared/ids";
import { parseRow } from "./serde";

type Row = { readonly data: string };

export class SqliteWikiRepo implements WikiRepo {
  constructor(private readonly db: Database) {}

  save(projectId: ProjectId, doc: WikiDoc): void {
    this.db.run(
      `INSERT INTO wiki (projectId, section, data) VALUES (?, ?, ?)
       ON CONFLICT(projectId, section) DO UPDATE SET data = excluded.data`,
      [projectId, doc.section, JSON.stringify(doc)],
    );
  }

  find(projectId: ProjectId, section: WikiSection): WikiDoc | undefined {
    const row = this.db
      .query("SELECT data FROM wiki WHERE projectId = ? AND section = ?")
      .get(projectId, section) as Row | null;
    return parseRow<WikiDoc>(row);
  }
}

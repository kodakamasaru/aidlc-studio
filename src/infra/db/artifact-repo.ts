// ArtifactRepo (SQLite). ArtifactRef has no id; its DocPath is the natural key
// (one index entry per aidlc-docs path). Scalar cycleId for listByCycle.
import type { Database } from "bun:sqlite";
import type { ArtifactRepo } from "../../app/ports/repos";
import type { ArtifactRef } from "../../domain/external-memory/external-memory";
import type { CycleId } from "../../domain/shared/ids";
import { parseRow, parseRows } from "./serde";

type Row = { readonly data: string };

export class SqliteArtifactRepo implements ArtifactRepo {
  constructor(private readonly db: Database) {}

  save(ref: ArtifactRef): void {
    this.db.run(
      `INSERT INTO artifacts (path, cycleId, data) VALUES (?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         cycleId = excluded.cycleId,
         data    = excluded.data`,
      [ref.path, ref.cycleId, JSON.stringify(ref)],
    );
  }

  listByCycle(cycleId: CycleId): readonly ArtifactRef[] {
    const rows = this.db
      .query("SELECT data FROM artifacts WHERE cycleId = ? ORDER BY path")
      .all(cycleId) as Row[];
    return parseRows<ArtifactRef>(rows);
  }

  findByPath(path: string): ArtifactRef | undefined {
    const row = this.db
      .query("SELECT data FROM artifacts WHERE path = ?")
      .get(path) as Row | null;
    return parseRow<ArtifactRef>(row);
  }
}

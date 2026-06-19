// SqliteReconstructionProposalRepo — US-08 pipeline-reconstruction proposal store.
// One row per cycleId (upsert); data column holds the JSON-serialised proposal object.
// Mirrors the pattern used by SqliteSessionRepo (single-row keyed by external id).
import type { Database } from "bun:sqlite";
import type { ReconstructionProposalRepo } from "../../app/ports/repos";
import type { CycleId } from "../../domain/shared/ids";

type Row = { readonly data: string };

export class SqliteReconstructionProposalRepo implements ReconstructionProposalRepo {
  constructor(private readonly db: Database) {}

  save(cycleId: CycleId, proposal: object): void {
    this.db.run(
      `INSERT INTO reconstruction_proposals (cycleId, data) VALUES (?, ?)
       ON CONFLICT(cycleId) DO UPDATE SET data = excluded.data`,
      [cycleId as string, JSON.stringify(proposal)],
    );
  }

  find(cycleId: CycleId): object | undefined {
    const row = this.db
      .query("SELECT data FROM reconstruction_proposals WHERE cycleId = ?")
      .get(cycleId as string) as Row | null;
    if (!row) return undefined;
    try {
      return JSON.parse(row.data) as object;
    } catch {
      return undefined;
    }
  }
}

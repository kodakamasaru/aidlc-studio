// ReviewRepo (SQLite). Review has no surface id; identity is (runId, taskId)
// where taskId may be null (cycle-scoped review). The scalar taskId column is
// NOT NULL DEFAULT '' so the UNIQUE(runId, taskId) upsert is deterministic even
// for cycle-scoped reviews — SQLite treats NULL as distinct in UNIQUE, which
// would let duplicate null-taskId rows pile up. We map null↔'' at the column
// boundary; the JSON `data` keeps the real null/value as the source of truth.
import type { Database } from "bun:sqlite";
import type { ReviewRepo } from "../../app/ports/repos";
import type { Review } from "../../domain/review/review";
import type { CycleId, RunId, TaskId } from "../../domain/shared/ids";
import { parseRow, parseRows } from "./serde";

type Row = { readonly data: string };

export class SqliteReviewRepo implements ReviewRepo {
  constructor(private readonly db: Database) {}

  save(review: Review): void {
    this.db.run(
      `INSERT INTO reviews (runId, taskId, cycleId, data) VALUES (?, ?, ?, ?)
       ON CONFLICT(runId, taskId) DO UPDATE SET
         cycleId = excluded.cycleId,
         data    = excluded.data`,
      // Scalar taskId: '' stands in for the cycle-scoped (null) case.
      [review.runId, review.taskId ?? "", review.cycleId, JSON.stringify(review)],
    );
  }

  findByRun(runId: RunId): readonly Review[] {
    const rows = this.db
      .query("SELECT data FROM reviews WHERE runId = ? ORDER BY rowid")
      .all(runId) as Row[];
    return parseRows<Review>(rows);
  }

  findByRunTask(runId: RunId, taskId: TaskId | null): Review | undefined {
    // The scalar taskId column stores '' for the cycle-scoped (null) case.
    const scalarTaskId = taskId === null ? "" : taskId;
    const row = this.db
      .query("SELECT data FROM reviews WHERE runId = ? AND taskId = ?")
      .get(runId, scalarTaskId) as Row | null;
    return parseRow<Review>(row);
  }

  listByCycle(cycleId: CycleId): readonly Review[] {
    const rows = this.db
      .query("SELECT data FROM reviews WHERE cycleId = ? ORDER BY rowid")
      .all(cycleId) as Row[];
    return parseRows<Review>(rows);
  }
}

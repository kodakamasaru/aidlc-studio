// SessionRepo (SQLite). Unit-04: stores runId → sessionId so that a later
// resume turn can pass `claude --resume <sessionId>`. The session_id is
// captured from the stream-json init line (extractSessionId in live.ts) and
// is infra-only — the domain Run aggregate never carries it (S6 D-02 /
// cycle-run-aggregate.md R-01).
//
// Identity: runId is the PK. All turns in one hearing overwrite the same row
// (turns share one session; the latest turn's session_id is authoritative).
import type { Database } from "bun:sqlite";
import type { SessionRepo } from "../../app/ports/repos";
import type { RunId } from "../../domain/shared/ids";

type Row = { readonly sessionId: string };

export class SqliteSessionRepo implements SessionRepo {
  constructor(private readonly db: Database) {}

  save(runId: RunId, sessionId: string): void {
    this.db.run(
      `INSERT INTO run_sessions (runId, sessionId)
       VALUES (?, ?)
       ON CONFLICT(runId) DO UPDATE SET sessionId = excluded.sessionId`,
      [runId, sessionId],
    );
  }

  find(runId: RunId): string | null {
    const row = this.db
      .query("SELECT sessionId FROM run_sessions WHERE runId = ?")
      .get(runId) as Row | null;
    return row ? row.sessionId : null;
  }
}

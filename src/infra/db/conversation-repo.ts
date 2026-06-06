// ConversationRepo (SQLite). One conversation per runId; projectId is supplied
// by the caller (Conversation carries only runId + turns).
import type { Database } from "bun:sqlite";
import type { ConversationRepo } from "../../app/ports/repos";
import type { Conversation } from "../../domain/external-memory/external-memory";
import type { ProjectId, RunId } from "../../domain/shared/ids";
import { parseRow } from "./serde";

type Row = { readonly data: string };

export class SqliteConversationRepo implements ConversationRepo {
  constructor(private readonly db: Database) {}

  save(projectId: ProjectId, conversation: Conversation): void {
    this.db.run(
      `INSERT INTO conversations (runId, projectId, data) VALUES (?, ?, ?)
       ON CONFLICT(runId) DO UPDATE SET
         projectId = excluded.projectId,
         data      = excluded.data`,
      [conversation.runId, projectId, JSON.stringify(conversation)],
    );
  }

  findByRun(runId: RunId): Conversation | undefined {
    const row = this.db
      .query("SELECT data FROM conversations WHERE runId = ?")
      .get(runId) as Row | null;
    return parseRow<Conversation>(row);
  }
}

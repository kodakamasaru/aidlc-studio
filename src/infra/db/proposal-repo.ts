// ProposalRepo (SQLite). TaskProposal carries no projectId, so projectId is a
// persistence-scope param on save (mirrors WikiRepo/ConversationRepo) stored in
// its own column to make listByProject genuinely project-scoped.
import type { Database } from "bun:sqlite";
import type { ProposalRepo } from "../../app/ports/repos";
import type { TaskProposal } from "../../domain/task/task";
import type { ProjectId } from "../../domain/shared/ids";
import { parseRow, parseRows } from "./serde";

type Row = { readonly data: string };

export class SqliteProposalRepo implements ProposalRepo {
  constructor(private readonly db: Database) {}

  save(projectId: ProjectId, proposal: TaskProposal): void {
    this.db.run(
      `INSERT INTO proposals (id, projectId, data) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET projectId = excluded.projectId, data = excluded.data`,
      [proposal.id, projectId, JSON.stringify(proposal)],
    );
  }

  findById(id: TaskProposal["id"]): TaskProposal | undefined {
    const row = this.db
      .query("SELECT data FROM proposals WHERE id = ?")
      .get(id) as Row | null;
    return parseRow<TaskProposal>(row);
  }

  listByProject(projectId: ProjectId): readonly TaskProposal[] {
    const rows = this.db
      .query("SELECT data FROM proposals WHERE projectId = ? ORDER BY id")
      .all(projectId) as Row[];
    return parseRows<TaskProposal>(rows);
  }
}

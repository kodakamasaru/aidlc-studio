// QuestionRepo (SQLite). Scalars: runId, cycleId, state. listOpenByProject
// joins questions→cycles on cycleId (projectId is NOT denormalized into
// questions — per S7 D-07 the cycle owns the project scope).
import type { Database } from "bun:sqlite";
import type { QuestionRepo } from "../../app/ports/repos";
import type { Question } from "../../domain/question/question";
import type { CycleId, ProjectId, QuestionId, RunId } from "../../domain/shared/ids";
import { parseRow, parseRows } from "./serde";

type Row = { readonly data: string };

export class SqliteQuestionRepo implements QuestionRepo {
  constructor(private readonly db: Database) {}

  save(question: Question): void {
    this.db.run(
      `INSERT INTO questions (id, runId, cycleId, state, data)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         runId   = excluded.runId,
         cycleId = excluded.cycleId,
         state   = excluded.state,
         data    = excluded.data`,
      [
        question.id,
        question.runId,
        question.cycleId,
        question.state,
        JSON.stringify(question),
      ],
    );
  }

  findById(id: QuestionId): Question | undefined {
    const row = this.db
      .query("SELECT data FROM questions WHERE id = ?")
      .get(id) as Row | null;
    return parseRow<Question>(row);
  }

  listOpenByProject(projectId: ProjectId): readonly Question[] {
    const rows = this.db
      .query(
        `SELECT q.data AS data
         FROM questions q
         JOIN cycles c ON c.id = q.cycleId
         WHERE c.projectId = ? AND q.state = 'open'
         ORDER BY q.id`,
      )
      .all(projectId) as Row[];
    return parseRows<Question>(rows);
  }

  listByRun(runId: RunId): readonly Question[] {
    const rows = this.db
      .query("SELECT data FROM questions WHERE runId = ? ORDER BY id")
      .all(runId) as Row[];
    return parseRows<Question>(rows);
  }

  listByCycle(cycleId: CycleId): readonly Question[] {
    const rows = this.db
      .query("SELECT data FROM questions WHERE cycleId = ? ORDER BY id")
      .all(cycleId) as Row[];
    return parseRows<Question>(rows);
  }
}

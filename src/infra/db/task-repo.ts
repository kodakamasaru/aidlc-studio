// TaskRepo (SQLite). Scalars: projectId (always) + cycleId (= assignedCycleId,
// null while in backlog) for listByCycle.
import type { Database } from "bun:sqlite";
import type { TaskRepo } from "../../app/ports/repos";
import type { Task } from "../../domain/task/task";
import type { CycleId, ProjectId, TaskId } from "../../domain/shared/ids";
import { parseRow, parseRows } from "./serde";

type Row = { readonly data: string };

export class SqliteTaskRepo implements TaskRepo {
  constructor(private readonly db: Database) {}

  private upsert(task: Task): void {
    this.db.run(
      `INSERT INTO tasks (id, projectId, cycleId, data) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         projectId = excluded.projectId,
         cycleId   = excluded.cycleId,
         data      = excluded.data`,
      [
        task.id,
        task.projectId,
        task.assignedCycleId ?? null,
        JSON.stringify(task),
      ],
    );
  }

  save(task: Task): void {
    this.upsert(task);
  }

  saveMany(tasks: readonly Task[]): void {
    // Wrap the batch in a transaction so it is all-or-nothing even when called
    // outside an outer UnitOfWork. bun:sqlite nests via SAVEPOINT, so this stays
    // safe when an enclosing uow.run transaction is already open.
    this.db.transaction(() => {
      for (const task of tasks) this.upsert(task);
    })();
  }

  findById(id: TaskId): Task | undefined {
    const row = this.db
      .query("SELECT data FROM tasks WHERE id = ?")
      .get(id) as Row | null;
    return parseRow<Task>(row);
  }

  listByProject(projectId: ProjectId): readonly Task[] {
    const rows = this.db
      .query("SELECT data FROM tasks WHERE projectId = ? ORDER BY id")
      .all(projectId) as Row[];
    return parseRows<Task>(rows);
  }

  listByCycle(cycleId: CycleId): readonly Task[] {
    const rows = this.db
      .query("SELECT data FROM tasks WHERE cycleId = ? ORDER BY id")
      .all(cycleId) as Row[];
    return parseRows<Task>(rows);
  }
}

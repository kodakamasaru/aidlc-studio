// openDb — open a bun:sqlite connection, set WAL + foreign-key pragmas, and run
// migrations. `path` may be ":memory:" (tests) or a file path (production).
import { Database } from "bun:sqlite";
import { migrate } from "./migrations";

export function openDb(path: string): Database {
  const db = new Database(path);
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

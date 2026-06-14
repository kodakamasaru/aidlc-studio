// SQLite schema. Strategy (S7 D-07): each aggregate row stores the full JSON in
// a `data` column PLUS the scalar columns the repo queries actually filter or
// join on. JSON is the source of truth on read; scalar columns exist only for
// indexing/scoping. Per-table scalar columns (beyond `data`):
//  - projects:      id (PK).
//  - cycles:        id (PK), projectId, version; UNIQUE(projectId, version).
//  - tasks:         id (PK), projectId, cycleId (nullable until assigned).
//  - proposals:     id (PK), projectId.
//  - questions:     id (PK), runId, cycleId, state.
//  - facts:         id (PK), cycleId.
//  - reviews:       NO surface id — identity is UNIQUE(runId, taskId); also
//                   carries cycleId. taskId is TEXT NOT NULL DEFAULT '' (NOT
//                   nullable) so cycle-scoped reviews upsert deterministically:
//                   SQLite treats NULL as distinct in UNIQUE, so a nullable
//                   taskId would let duplicate cycle-scoped rows accumulate. The
//                   JSON `data` stays authoritative for the real null/value.
//  - artifacts:     path (PK), cycleId.
//  - wiki:          PRIMARY KEY(projectId, section).
//
// migrate() is idempotent (CREATE TABLE IF NOT EXISTS) so openDb can call it on
// every boot.
//
// Note: questions.listOpenByProject joins questions→cycles on cycleId.
import type { Database } from "bun:sqlite";

export function migrate(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id   TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cycles (
      id        TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      version   TEXT NOT NULL,
      data      TEXT NOT NULL,
      UNIQUE (projectId, version)
    );
    CREATE INDEX IF NOT EXISTS idx_cycles_project ON cycles (projectId);

    CREATE TABLE IF NOT EXISTS tasks (
      id        TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      cycleId   TEXT,
      data      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks (projectId);
    CREATE INDEX IF NOT EXISTS idx_tasks_cycle   ON tasks (cycleId);

    CREATE TABLE IF NOT EXISTS proposals (
      id        TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      data      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals (projectId);

    CREATE TABLE IF NOT EXISTS questions (
      id      TEXT PRIMARY KEY,
      runId   TEXT NOT NULL,
      cycleId TEXT NOT NULL,
      state   TEXT NOT NULL,
      data    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_questions_run   ON questions (runId);
    CREATE INDEX IF NOT EXISTS idx_questions_cycle ON questions (cycleId);
    CREATE INDEX IF NOT EXISTS idx_questions_state ON questions (state);

    CREATE TABLE IF NOT EXISTS facts (
      id      TEXT PRIMARY KEY,
      cycleId TEXT NOT NULL,
      data    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_facts_cycle ON facts (cycleId);

    CREATE TABLE IF NOT EXISTS reviews (
      runId   TEXT NOT NULL,
      taskId  TEXT NOT NULL DEFAULT '',
      cycleId TEXT NOT NULL,
      data    TEXT NOT NULL,
      UNIQUE (runId, taskId)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_run   ON reviews (runId);
    CREATE INDEX IF NOT EXISTS idx_reviews_cycle ON reviews (cycleId);

    CREATE TABLE IF NOT EXISTS artifacts (
      path    TEXT PRIMARY KEY,
      cycleId TEXT NOT NULL,
      data    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_cycle ON artifacts (cycleId);

    CREATE TABLE IF NOT EXISTS wiki (
      projectId TEXT NOT NULL,
      section   TEXT NOT NULL,
      data      TEXT NOT NULL,
      PRIMARY KEY (projectId, section)
    );

    CREATE TABLE IF NOT EXISTS run_sessions (
      runId     TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reconstruction_proposals (
      cycleId TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );
  `);
}

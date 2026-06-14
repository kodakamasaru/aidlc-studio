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
//
// Versioned data migrations (PRAGMA user_version):
//  v1 (user_version = 1): backfill DEFAULT_STEP_CONTRACTS into existing
//     projects.pipelineDef and cycles.phases[].stepDef where contracts is
//     absent. Idempotent: re-running after v1 is already applied is a no-op
//     because user_version gate skips the block.
import type { Database } from "bun:sqlite";
import { DEFAULT_STEP_CONTRACTS } from "../../domain/project/step-contracts";
import type { StepContracts } from "../../domain/project/step-contracts";
import { logError } from "../log";

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

  // ── Versioned data migrations ────────────────────────────────────────────────
  // user_version is a SQLite integer pragma: 0 = never migrated, N = ran through
  // migration N. Each block is guarded by a version check so it is idempotent.
  const { user_version: userVersion } = db
    .query<{ user_version: number }, []>("PRAGMA user_version")
    .get()!;

  if (userVersion < 1) {
    migrateV1BackfillContracts(db);
    db.run("PRAGMA user_version = 1");
  }
}

// ── v1: backfill DEFAULT_STEP_CONTRACTS into existing rows ───────────────────
//
// For each project row: iterate pipelineDef; for any StepDef whose `contracts`
// is absent (undefined / null) and whose id has a DEFAULT entry, inject the
// default. Rows with explicit contracts keep them (override respected).
//
// For each cycle row: iterate phases[].stepDef; same rule — fill absent
// contracts from the default registry. The phase snapshot was frozen at cycle
// creation; "absent" means "not yet explicitly set", so the default is the
// correct display value.
//
// Error policy: a row that fails JSON parse or re-serialisation is skipped with
// a logged warning. The migration does NOT abort; partial success is preferable
// to blocking boot entirely on a corrupt row.
function migrateV1BackfillContracts(db: Database): void {
  backfillProjects(db);
  backfillCycles(db);
}

type RawRow = { id: string; data: string };

function backfillProjects(db: Database): void {
  const rows = db
    .query<RawRow, []>("SELECT id, data FROM projects")
    .all();

  const update = db.prepare(
    "UPDATE projects SET data = ? WHERE id = ?",
  );

  for (const row of rows) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const project: any = JSON.parse(row.data);
      if (!Array.isArray(project?.pipelineDef)) continue;

      let changed = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextPipeline = project.pipelineDef.map((stepDef: any) => {
        if (stepDef.contracts !== undefined && stepDef.contracts !== null) {
          return stepDef; // explicit override → do not touch
        }
        const stepId: string = stepDef.id as string;
        const defaults: StepContracts | undefined =
          DEFAULT_STEP_CONTRACTS[stepId];
        if (defaults === undefined) {
          return stepDef; // custom / unknown step — leave as-is
        }
        changed = true;
        return { ...stepDef, contracts: defaults };
      });

      if (changed) {
        update.run(
          JSON.stringify({ ...project, pipelineDef: nextPipeline }),
          row.id,
        );
      }
    } catch (err) {
      logError(
        `migrations v1: skipping corrupt projects row id=${row.id}`,
        err,
      );
    }
  }
}

function backfillCycles(db: Database): void {
  const rows = db
    .query<RawRow, []>("SELECT id, data FROM cycles")
    .all();

  const update = db.prepare(
    "UPDATE cycles SET data = ? WHERE id = ?",
  );

  for (const row of rows) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cycle: any = JSON.parse(row.data);
      if (!Array.isArray(cycle?.phases)) continue;

      let changed = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextPhases = cycle.phases.map((phase: any) => {
        // phase.stepDef is the StepDefSnapshot (optional, absent on old rows)
        if (phase.stepDef === undefined || phase.stepDef === null) {
          return phase; // no snapshot at all — cannot backfill
        }
        if (
          phase.stepDef.contracts !== undefined &&
          phase.stepDef.contracts !== null
        ) {
          return phase; // explicit override → do not touch
        }
        // step id lives on phase.step (the Phase.step discriminator)
        const stepId: string = phase.step as string;
        const defaults: StepContracts | undefined =
          DEFAULT_STEP_CONTRACTS[stepId];
        if (defaults === undefined) {
          return phase; // custom / unknown step — leave as-is
        }
        changed = true;
        return {
          ...phase,
          stepDef: { ...phase.stepDef, contracts: defaults },
        };
      });

      if (changed) {
        update.run(
          JSON.stringify({ ...cycle, phases: nextPhases }),
          row.id,
        );
      }
    } catch (err) {
      logError(
        `migrations v1: skipping corrupt cycles row id=${row.id}`,
        err,
      );
    }
  }
}

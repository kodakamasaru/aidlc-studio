// Migration v1 — backfill DEFAULT_STEP_CONTRACTS into existing rows.
//
// These tests simulate the "pre-migration" state by inserting raw JSON rows
// directly into an in-memory DB *before* migrate() applies user_version gating,
// then calling migrate() and verifying the expected transformations.
//
// Scenarios:
//   1. projects: absent contracts → filled with DEFAULT_STEP_CONTRACTS
//   2. projects: explicit contracts → unchanged (override respected)
//   3. projects: custom/unknown step id → no contracts inserted
//   4. cycles: phase.stepDef absent contracts → filled from default
//   5. cycles: phase.stepDef explicit contracts → unchanged
//   6. cycles: phase without stepDef snapshot (old row) → left as-is
//   7. idempotency: migrate() called twice → user_version stays at 1, no duplication
//   8. new projects created AFTER migration → still receive seeded contracts (regression)
import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/infra/db/migrations";
import { openDb } from "../../src/infra/db/open";
import { buildStore } from "../../src/infra/db/store";
import { DEFAULT_STEP_CONTRACTS } from "../../src/domain/project/step-contracts";
import { ProjectId, CycleId } from "../../src/domain/shared/ids";
import { buildProject, buildCycle } from "./builders";
import { ProjectService } from "../../src/app/services/project-service";
import { buildTestApp, makeRepoDir } from "../support/harness";

// ── helpers ─────────────────────────────────────────────────────────────────

/** Open a bare DB and apply only the schema (NOT the v1 backfill).
 * We achieve this by running migrate on a fresh DB, then manually resetting
 * user_version back to 0 so a second call to migrate() will re-run the backfill.
 * This lets us insert "legacy" rows before the backfill runs.
 */
function openPreMigrationDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");
  // Apply schema only (migrate will also do the v1 backfill; we reset after)
  migrate(db);
  // Reset so next migrate() call will re-run the backfill
  db.run("PRAGMA user_version = 0");
  return db;
}

/** Insert a raw project JSON row directly (bypass domain layer). */
function insertRawProject(db: Database, id: string, data: object): void {
  db.run("INSERT INTO projects (id, data) VALUES (?, ?)", [
    id,
    JSON.stringify(data),
  ]);
}

/** Insert a raw cycle JSON row directly. */
function insertRawCycle(
  db: Database,
  id: string,
  projectId: string,
  ver: string,
  data: object,
): void {
  db.run(
    "INSERT INTO cycles (id, projectId, version, data) VALUES (?, ?, ?, ?)",
    [id, projectId, ver, JSON.stringify(data)],
  );
}

/** Read the parsed data of a project row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readProject(db: Database, id: string): any {
  const row = db
    .query<{ data: string }, [string]>("SELECT data FROM projects WHERE id = ?")
    .get(id);
  if (!row) throw new Error(`project ${id} not found`);
  return JSON.parse(row.data);
}

/** Read the parsed data of a cycle row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readCycle(db: Database, id: string): any {
  const row = db
    .query<{ data: string }, [string]>("SELECT data FROM cycles WHERE id = ?")
    .get(id);
  if (!row) throw new Error(`cycle ${id} not found`);
  return JSON.parse(row.data);
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("migration v1 — backfill DEFAULT_STEP_CONTRACTS", () => {
  let db: Database;

  beforeEach(() => {
    db = openPreMigrationDb();
  });

  // ── projects ──────────────────────────────────────────────────────────────

  test("project: absent contracts → filled with DEFAULT_STEP_CONTRACTS", () => {
    const legacy = {
      id: "p1",
      pipelineDef: [
        { id: "S1", label: "要件", order: 0, skillRef: "aidlc-s1" },
        { id: "S7", label: "実装", order: 1, skillRef: "aidlc-s7" },
      ],
    };
    insertRawProject(db, "p1", legacy);

    // run the backfill
    migrate(db);

    const project = readProject(db, "p1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s1 = project.pipelineDef.find((s: any) => s.id === "S1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s7 = project.pipelineDef.find((s: any) => s.id === "S7");

    expect(s1.contracts).toEqual(DEFAULT_STEP_CONTRACTS["S1"]);
    expect(s7.contracts).toEqual(DEFAULT_STEP_CONTRACTS["S7"]);
  });

  test("project: explicit contracts → unchanged (override respected)", () => {
    const explicitContracts = {
      humanGate: { mode: "none" },
      escalation: { onStall: "human" },
    };
    const legacy = {
      id: "p2",
      pipelineDef: [
        {
          id: "S1",
          label: "要件",
          order: 0,
          skillRef: "aidlc-s1",
          contracts: explicitContracts,
        },
      ],
    };
    insertRawProject(db, "p2", legacy);

    migrate(db);

    const project = readProject(db, "p2");
    const s1 = project.pipelineDef[0];
    // Must not be overwritten with the default
    expect(s1.contracts).toEqual(explicitContracts);
    expect(s1.contracts.humanGate.mode).toBe("none");
  });

  test("project: custom/unknown step id → no contracts inserted", () => {
    const legacy = {
      id: "p3",
      pipelineDef: [
        {
          id: "CUSTOM-99",
          label: "独自工程",
          order: 0,
          skillRef: "custom-skill",
        },
      ],
    };
    insertRawProject(db, "p3", legacy);

    migrate(db);

    const project = readProject(db, "p3");
    const custom = project.pipelineDef[0];
    // Unknown step — no default exists, contracts must remain absent
    expect(custom.contracts).toBeUndefined();
  });

  // ── cycles ────────────────────────────────────────────────────────────────

  test("cycle: phase.stepDef absent contracts → filled from default", () => {
    const legacy = {
      id: "c1",
      projectId: "p1",
      version: "v1.0.0",
      phases: [
        {
          id: "ph1",
          step: "S2",
          order: 0,
          state: "done",
          runs: [],
          stepDef: {
            label: "画面",
            order: 0,
            skillRef: "aidlc-s2",
            // contracts intentionally absent (pre-F2 snapshot)
          },
        },
      ],
    };
    insertRawCycle(db, "c1", "p1", "v1.0.0", legacy);

    migrate(db);

    const cycle = readCycle(db, "c1");
    const phase = cycle.phases[0];
    expect(phase.stepDef.contracts).toEqual(DEFAULT_STEP_CONTRACTS["S2"]);
  });

  test("cycle: phase.stepDef explicit contracts → unchanged", () => {
    const explicitContracts = { humanGate: { mode: "device_check" } };
    const legacy = {
      id: "c2",
      projectId: "p1",
      version: "v1.0.1",
      phases: [
        {
          id: "ph2",
          step: "S8",
          order: 0,
          state: "done",
          runs: [],
          stepDef: {
            label: "統合",
            order: 0,
            skillRef: "aidlc-s8",
            contracts: explicitContracts,
          },
        },
      ],
    };
    insertRawCycle(db, "c2", "p1", "v1.0.1", legacy);

    migrate(db);

    const cycle = readCycle(db, "c2");
    const phase = cycle.phases[0];
    expect(phase.stepDef.contracts).toEqual(explicitContracts);
  });

  test("cycle: phase without stepDef snapshot (old row) → left as-is", () => {
    const legacy = {
      id: "c3",
      projectId: "p1",
      version: "v1.0.2",
      phases: [
        {
          id: "ph3",
          step: "S1",
          order: 0,
          state: "done",
          runs: [],
          // stepDef absent — pre-snapshot era row
        },
      ],
    };
    insertRawCycle(db, "c3", "p1", "v1.0.2", legacy);

    migrate(db);

    const cycle = readCycle(db, "c3");
    const phase = cycle.phases[0];
    // Must not inject a stepDef where none existed
    expect(phase.stepDef).toBeUndefined();
  });

  // ── idempotency ───────────────────────────────────────────────────────────

  test("idempotency: migrate() twice does not double-apply contracts", () => {
    const legacy = {
      id: "p4",
      pipelineDef: [
        { id: "S3", label: "UIデザイン", order: 0, skillRef: "aidlc-s3" },
      ],
    };
    insertRawProject(db, "p4", legacy);

    migrate(db); // first run: applies v1 backfill, sets user_version = 1
    migrate(db); // second run: user_version = 1 → backfill skipped

    const userVersion = db
      .query<{ user_version: number }, []>("PRAGMA user_version")
      .get()!.user_version;
    expect(userVersion).toBe(1);

    const project = readProject(db, "p4");
    const s3 = project.pipelineDef[0];
    // Contracts should be present exactly once (not doubled or corrupted)
    expect(s3.contracts).toEqual(DEFAULT_STEP_CONTRACTS["S3"]);
  });

  // ── new projects after migration (regression) ─────────────────────────────

  test("new project created via ProjectService after migration receives seeded contracts", () => {
    // ProjectService.createProject uses defaultPipeline() which seeds contracts
    // from DEFAULT_STEP_CONTRACTS (F-2). This regression ensures that path is intact.
    const repoPath = makeRepoDir();
    const { ports } = buildTestApp();
    const svc = new ProjectService(ports);
    const project = svc.createProject({ repoPath });

    const loaded = ports.repos.projects.findById(project.id)!;
    const s1 = loaded.pipelineDef.find((sd) => (sd.id as string) === "S1");
    // New projects created via ProjectService have seeded contracts (no regression)
    expect(s1?.contracts).toBeDefined();
    expect(s1?.contracts).toEqual(DEFAULT_STEP_CONTRACTS["S1"]);
  });

  test("cycle round-trips through the store without corruption", () => {
    const freshDb = openDb(":memory:");
    const store = buildStore(freshDb);

    const project = buildProject("fresh-p2");
    store.repos.projects.save(project);
    const cycle = buildCycle("fresh-p2", "fresh-c1", "v1.0.0");
    store.repos.cycles.save(cycle);

    const loaded = store.repos.cycles.findById(CycleId("fresh-c1"))!;
    // buildCycle creates S1 + S6 phases; check phase integrity after migration
    expect(loaded.phases).toBeDefined();
    expect(loaded.phases.length).toBeGreaterThan(0);
  });
});

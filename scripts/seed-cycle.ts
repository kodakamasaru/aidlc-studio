// US-04 / Unit-04 (BT-04) — seed-cycle CLI. Thin wrapper over `seedCycleCore`
// (src/infra/seed/seed-cycle-core.ts). Seeds, into an ISOLATED sandbox repo +
// sandbox DB, the DATA to verify any step IMMEDIATELY (no slow live AI): phase/run
// STATE + prior artifacts + the step's product + the step's evidence manifest
// (capturedAt >= the seeded run's startedAt, so the evidence gate is `eligible`
// at once). It refuses to write into the studio repo itself (throwaway repo only).
//
// Backward compatible: a fixture whose steps omit produceArtifact/priorArtifacts/
// evidence seeds STATES ONLY (as before).
//
// Fixture (JSON, via --fixture <file> or stdin):
//   { "version": "v0.0.5", "title": "seed", "projectId"?: "...",
//     "steps": [
//       { "step": "S1", "state": "done" },                               // states-only
//       { "step": "S9", "state": "review",
//         "produceArtifact": true, "priorArtifacts": true,
//         "evidence": "complete" }                                       // immediate-verify
//     ] }
//
// Usage:
//   AIDLC_DB=/tmp/aidlc-sandbox.db bun run scripts/seed-cycle.ts --fixture seed.json
import { readFileSync } from "node:fs";
import { openDb } from "../src/infra/db/open";
import { buildStore } from "../src/infra/db/store";
import { UuidIdGen } from "../src/infra/sys/id-gen";
import { SystemClock } from "../src/infra/sys/clock";
import type { ProjectId } from "../src/domain/shared/ids";
import {
  seedCycleCore,
  SeedError,
  type CycleFixture,
} from "../src/infra/seed/seed-cycle-core";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const fixturePath = arg("fixture");
const raw = fixturePath ? readFileSync(fixturePath, "utf8") : readFileSync(0, "utf8");
const fixture = JSON.parse(raw) as CycleFixture;

const dbPath = process.env.AIDLC_DB ?? "/tmp/aidlc-sandbox.db";
const db = openDb(dbPath);
const store = buildStore(db);
const ids = new UuidIdGen();
const now = new SystemClock().now();

// Resolve target project (explicit id, else the only/first project in the sandbox).
const projects = store.repos.projects.list();
const project = fixture.projectId
  ? store.repos.projects.findById(fixture.projectId as ProjectId)
  : projects[0];
if (!project) {
  console.error(
    `[seed-cycle] no project in ${dbPath}. Create one first (e.g. bun run verify:test).`,
  );
  process.exit(1);
}

try {
  const result = seedCycleCore({
    store,
    ids,
    project,
    fixture,
    now,
    studioRoot: process.cwd(),
  });
  const { cycle } = result;
  console.log(
    `[seed-cycle] seeded cycle ${cycle.id} (${fixture.version}) on project ${project.id} @ ${dbPath}`,
  );
  console.log(`[seed-cycle] repoPath (sandbox): ${project.repoPath as string}`);
  for (const p of cycle.phases) console.log(`  - ${p.step as string}: ${p.state}`);
  if (result.artifactPaths.length > 0) {
    console.log(`[seed-cycle] artifacts (${result.artifactPaths.length}):`);
    for (const p of result.artifactPaths) console.log(`    ${p}`);
  }
  if (result.manifestPaths.length > 0) {
    console.log(`[seed-cycle] evidence manifests (${result.manifestPaths.length}):`);
    for (const p of result.manifestPaths) console.log(`    ${p}`);
  }
} catch (e: unknown) {
  if (e instanceof SeedError) {
    console.error(`[seed-cycle] ${e.message}`);
    process.exit(1);
  }
  throw e;
}

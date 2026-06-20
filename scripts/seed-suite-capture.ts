// seed-suite-capture — produce GENUINE screenshots for the seed suite's
// evidence:complete steps (US-04 Q-01: "実際に回した時同様の適切なデータ" — real
// captures, not 1x1 placeholder PNGs).
//
// It seeds the whole fixture suite into a throwaway DB + repo (evidence STRIPPED,
// so no screenshot is required yet), boots the real studio server in-process
// against that DB, drives Playwright's bundled chromium to each seeded cycle's
// board (/cycles/<id>), and saves a full-page PNG into the fixture's
// evidence/<step>/shot.png for every evidence:complete step. The committed PNG is
// then what `seedSuiteCore` copies as the visual evidence form — a real product
// capture of that exact seeded cycle (its title, its step states), faithful to
// what the live path's captureVerifyUi records.
//
// Usage: bun run scripts/seed-suite-capture.ts
import { chromium } from "playwright";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { openDb } from "../src/infra/db/open";
import { buildStore } from "../src/infra/db/store";
import { UuidIdGen } from "../src/infra/sys/id-gen";
import { SystemClock } from "../src/infra/sys/clock";
import { openProject } from "../src/domain/project/project";
import type { VisionRef, SkillRef, Project } from "../src/domain/project/project";
import { DEFAULT_STEPS } from "../src/domain/shared/vocab";
import { ProjectId } from "../src/domain/shared/ids";
import { seedCycleCore, type CycleFixture } from "../src/infra/seed/seed-cycle-core";
import { buildServer } from "../src/server";

const STUDIO_ROOT = process.cwd();
const FIXTURES_ROOT = join(STUDIO_ROOT, "fixtures", "seed-cycles");
const SANDBOX = "/tmp/aidlc-seed-capture";
const DB = "/tmp/aidlc-seed-capture.db";
const PORT = 8799;

// Fresh sandbox each run.
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${DB}${suffix}`, { force: true });
rmSync(SANDBOX, { recursive: true, force: true });
mkdirSync(SANDBOX, { recursive: true });

const store = buildStore(openDb(DB));
const ids = new UuidIdGen();
const now = new SystemClock().now();

function openProjectFor(repoPath: string, slug: string): Project {
  const r = openProject({
    id: ProjectId(`p-cap-${slug}`),
    repoPath,
    vision: "aidlc-docs/vision/brief.md" as unknown as VisionRef,
    pipelineDef: DEFAULT_STEPS.map((id, i) => ({
      id,
      label: id as string,
      order: i,
      skillRef: `kit/skills/${id as string}` as unknown as SkillRef,
    })),
    env: { modelName: "claude", worktreeRoot: "/wt", stallTimeoutMin: 30, maxAttempt: 3 },
    createdAt: now,
  });
  if (!r.ok) throw new Error(`openProject failed: ${JSON.stringify(r.error)}`);
  return r.value;
}

const slugs = readdirSync(FIXTURES_ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name)
  .sort();

interface CaptureTarget {
  readonly slug: string;
  readonly cycleId: string;
  readonly completeSteps: readonly string[];
}
const targets: CaptureTarget[] = [];

for (const slug of slugs) {
  const fixtureDir = join(FIXTURES_ROOT, slug);
  const fixture = JSON.parse(
    readFileSync(join(fixtureDir, "cycle.json"), "utf8"),
  ) as CycleFixture;
  const completeSteps = fixture.steps
    .filter((s) => s.evidence === "complete")
    .map((s) => s.step);
  if (completeSteps.length === 0) continue; // nothing to capture for this cycle

  const repoPath = join(SANDBOX, slug);
  mkdirSync(repoPath, { recursive: true });
  const project = openProjectFor(repoPath, slug);
  store.uow.run(() => store.repos.projects.save(project));

  // Seed with evidence STRIPPED — board state + artifacts only (no shot needed).
  const stripped: CycleFixture = {
    ...fixture,
    steps: fixture.steps.map((s) => ({ ...s, evidence: "none" as const })),
  };
  const result = seedCycleCore({
    store,
    ids,
    project,
    fixture: stripped,
    now,
    studioRoot: STUDIO_ROOT,
    fixtureDir,
  });
  targets.push({ slug, cycleId: result.cycle.id as string, completeSteps });
}

// Boot the real server in-process against the seeded DB.
const { app } = buildServer({ dbPath: DB, orchestrator: "scripted" });
const server = Bun.serve({ port: PORT, hostname: "127.0.0.1", fetch: app.fetch });
console.log(`[capture] server on http://127.0.0.1:${PORT} (db=${DB})`);

const browser = await chromium.launch();
let written = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const t of targets) {
    const url = `http://127.0.0.1:${PORT}/cycles/${encodeURIComponent(t.cycleId)}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    for (const step of t.completeSteps) {
      const dir = resolve(FIXTURES_ROOT, t.slug, "evidence", step);
      mkdirSync(dir, { recursive: true });
      const out = join(dir, "shot.png");
      await page.screenshot({ path: out, fullPage: true, animations: "disabled" });
      written++;
      console.log(`[capture] ${t.slug} ${step} → ${out}`);
    }
  }
} finally {
  await browser.close();
  server.stop(true);
}
console.log(`[capture] done — ${written} screenshots written from ${targets.length} cycles`);
process.exit(0);

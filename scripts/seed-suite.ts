// seed:suite — seed the WHOLE example-cycle suite (US-04 Q-01) into an isolated
// sandbox: one project per cycle, each a different app, each STOPPED at a different
// step, all with real-run-equivalent artifacts + genuine evidence screenshots.
// After this, ANY step can be verified immediately on plausible data — no live AI.
//
// Source of truth = fixtures/seed-cycles/<slug>/ (committed). Screenshots are the
// genuine captures produced by `bun run scripts/seed-suite-capture.ts`.
//
// Usage:
//   AIDLC_DB=/tmp/aidlc-sandbox.db bun run scripts/seed-suite.ts            # all
//   AIDLC_DB=/tmp/aidlc-sandbox.db bun run scripts/seed-suite.ts chat expense # subset
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { openDb } from "../src/infra/db/open";
import { buildStore } from "../src/infra/db/store";
import { UuidIdGen } from "../src/infra/sys/id-gen";
import { SystemClock } from "../src/infra/sys/clock";
import { seedSuiteCore, SeedError } from "../src/infra/seed/seed-cycle-core";

const STUDIO_ROOT = process.cwd();
const FIXTURES_ROOT = join(STUDIO_ROOT, "fixtures", "seed-cycles");
const SANDBOX_ROOT = process.env.AIDLC_SANDBOX ?? "/tmp/aidlc-suite";
const dbPath = process.env.AIDLC_DB ?? "/tmp/aidlc-suite.db";

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));

// "必ず初期データに戻る": the committed fixtures are the single source of truth, so
// seeding ALWAYS wipes the throwaway DB + sandbox first and re-materializes them.
// Re-running yields the exact same suite — never accumulates duplicate cycles.
// Pass `--keep` to append instead of reset. Guard: refuse to wipe anything inside
// the studio repo (protects the real aidlc-studio.db / aidlc-docs).
function assertThrowaway(p: string): void {
  const r = resolve(p);
  const studio = resolve(STUDIO_ROOT);
  if (r === studio || r.startsWith(`${studio}/`)) {
    throw new SeedError(
      `seed:suite refuses to reset ${r} — it is inside the studio repo. ` +
        `Point AIDLC_DB / AIDLC_SANDBOX at a throwaway path (e.g. /tmp/...).`,
    );
  }
}
if (!process.argv.includes("--keep")) {
  assertThrowaway(SANDBOX_ROOT);
  assertThrowaway(dbPath);
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
  rmSync(SANDBOX_ROOT, { recursive: true, force: true });
}
mkdirSync(SANDBOX_ROOT, { recursive: true });

const store = buildStore(openDb(dbPath));
const ids = new UuidIdGen();
const now = new SystemClock().now();

try {
  const items = seedSuiteCore({
    store,
    ids,
    sandboxRoot: SANDBOX_ROOT,
    fixturesRoot: FIXTURES_ROOT,
    now,
    studioRoot: STUDIO_ROOT,
    ...(only.length > 0 ? { only } : {}),
  });
  console.log(`[seed:suite] seeded ${items.length} cycle(s) @ ${dbPath}`);
  console.log(`[seed:suite] sandbox repos under: ${SANDBOX_ROOT}`);
  for (const it of items) {
    const stop = it.result.cycle.phases.find((p) => p.state === "review" || p.state === "running");
    const stopLabel = stop ? (stop.step as string) : "(all done)";
    console.log(
      `  - ${it.slug.padEnd(10)} cycle=${it.result.cycle.id} stop=${stopLabel} ` +
        `manifests=${it.result.manifestPaths.length}`,
    );
  }
} catch (e: unknown) {
  if (e instanceof SeedError) {
    console.error(`[seed:suite] ${e.message}`);
    process.exit(1);
  }
  throw e;
}

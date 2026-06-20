// US-04 / Unit-04 (BT-04) — seed = "data to verify any step IMMEDIATELY".
// Drives `seedCycleCore` directly (no live AI, no script spawn) against a real
// in-memory store + a real temp sandbox repo, then proves:
//   - evidence:complete step → manifest written AND FsEvidenceGate.check returns
//     `eligible` using the SEEDED run's startedAt (immediate, no live run);
//   - evidence:none step → blocked;
//   - prior index.md files written + cycle/run state persisted;
//   - the sandbox guard refuses the studio repo itself.
import { describe, test, expect, afterEach } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../src/infra/db/open";
import { buildStore } from "../../src/infra/db/store";
import type { Store } from "../../src/infra/db/store";
import { nodeFs } from "../../src/infra/sys/fs";
import { FsEvidenceGate } from "../../src/infra/evidence/fs-evidence-gate";
import {
  seedCycleCore,
  seedSuiteCore,
  SeedError,
  type CycleFixture,
} from "../../src/infra/seed/seed-cycle-core";
import { SeqIdGen } from "../../src/infra/sys/fakes";
import { openProject } from "../../src/domain/project/project";
import type { Project, VisionRef, SkillRef } from "../../src/domain/project/project";
import { DEFAULT_STEPS, Step } from "../../src/domain/shared/vocab";
import { ProjectId } from "../../src/domain/shared/ids";
import { instant, type Instant } from "../../src/domain/shared/primitives";
import { unwrap } from "../../src/domain/shared/result";

const NOW: Instant = unwrap(instant("2026-06-20T00:00:00.000Z"));
const VERSION = "v0.0.1";
const STUDIO_ROOT = "/Users/mac/ghq/github.com/kodakamasaru/aidlc-studio";

const tempDirs: string[] = [];
afterEach(() => {
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function sandboxRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "aidlc-seed-"));
  tempDirs.push(dir);
  return dir;
}

/** Project with the full default 12-step pipeline, rooted at a temp sandbox repo. */
function buildSandboxProject(repoPath: string): Project {
  return unwrap(
    openProject({
      id: ProjectId("p-seed"),
      repoPath,
      vision: "vision/brief.md" as unknown as VisionRef,
      pipelineDef: DEFAULT_STEPS.map((id, i) => ({
        id,
        label: id as string,
        order: i,
        skillRef: `kit/skills/${id as string}` as unknown as SkillRef,
      })),
      env: { modelName: "claude", worktreeRoot: "/wt", stallTimeoutMin: 30, maxAttempt: 3 },
      createdAt: NOW,
    }),
  );
}

function setup(): { store: Store; project: Project; repoPath: string } {
  const store = buildStore(openDb(":memory:"));
  const repoPath = sandboxRepo();
  const project = buildSandboxProject(repoPath);
  store.uow.run(() => store.repos.projects.save(project));
  return { store, project, repoPath };
}

describe("US-04 BT-04 — seeded cycle is immediately verifiable (no live AI)", () => {
  test("evidence:complete → manifest written AND gate eligible with seeded startedAt", () => {
    const { store, project, repoPath } = setup();
    const fixture: CycleFixture = {
      version: VERSION,
      steps: [
        { step: "S1", state: "done" },
        { step: "S2", state: "done" },
        {
          step: "S9",
          state: "review",
          produceArtifact: true,
          priorArtifacts: true,
          evidence: "complete",
        },
      ],
    };

    const result = seedCycleCore({
      store,
      ids: new SeqIdGen(),
      project,
      fixture,
      now: NOW,
      studioRoot: STUDIO_ROOT,
    });

    // Manifest + evidence files exist on disk.
    const evDir = join(repoPath, "aidlc-docs", VERSION, "_evidence", "S9");
    const manifestPath = join(evDir, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    expect(existsSync(join(evDir, "run.log"))).toBe(true);
    expect(existsSync(join(evDir, "shot.png"))).toBe(true);

    // The gate is eligible IMMEDIATELY using the SEEDED run's startedAt (no live run).
    const runStartedAt = result.runStartedAt["S9"]!;
    const verdict = new FsEvidenceGate(nodeFs).check({
      repoPath,
      version: VERSION,
      step: "S9",
      runStartedAt,
    });
    expect(verdict).toEqual({ eligibility: "eligible", missing: [] });

    // capturedAt >= startedAt is real: manifest forms are at NOW, run starts before.
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      forms: { kind: string; capturedAt: string }[];
    };
    for (const f of manifest.forms) expect(f.capturedAt >= runStartedAt).toBe(true);
    expect(manifest.forms.map((f) => f.kind).sort()).toEqual(["log", "screenshot"]);
  });

  test("evidence:none → gate blocked (no manifest)", () => {
    const { store, project, repoPath } = setup();
    const result = seedCycleCore({
      store,
      ids: new SeqIdGen(),
      project,
      fixture: { version: VERSION, steps: [{ step: "S1", state: "review", evidence: "none" }] },
      now: NOW,
      studioRoot: STUDIO_ROOT,
    });
    const verdict = new FsEvidenceGate(nodeFs).check({
      repoPath,
      version: VERSION,
      step: "S1",
      runStartedAt: result.runStartedAt["S1"]!,
    });
    expect(verdict.eligibility).toBe("blocked");
  });

  test("log-only → gate blocked on missing visual/operational form", () => {
    const { store, project, repoPath } = setup();
    const result = seedCycleCore({
      store,
      ids: new SeqIdGen(),
      project,
      fixture: { version: VERSION, steps: [{ step: "S1", state: "review", evidence: "log-only" }] },
      now: NOW,
      studioRoot: STUDIO_ROOT,
    });
    const verdict = new FsEvidenceGate(nodeFs).check({
      repoPath,
      version: VERSION,
      step: "S1",
      runStartedAt: result.runStartedAt["S1"]!,
    });
    expect(verdict.eligibility).toBe("blocked");
    expect(verdict.missing).toContain("visual-or-operational");
  });

  test("prior index.md files written + cycle/run state persisted", () => {
    const { store, project, repoPath } = setup();
    const result = seedCycleCore({
      store,
      ids: new SeqIdGen(),
      project,
      fixture: {
        version: VERSION,
        steps: [
          { step: "S1", state: "done" },
          { step: "S2", state: "done" },
          {
            step: "S3",
            state: "review",
            produceArtifact: true,
            priorArtifacts: true,
            evidence: "complete",
          },
        ],
      },
      now: NOW,
      studioRoot: STUDIO_ROOT,
    });

    // Prior done steps S1/S2 have real index.md; current step S3 product written.
    expect(existsSync(join(repoPath, "aidlc-docs", VERSION, "S1", "index.md"))).toBe(true);
    expect(existsSync(join(repoPath, "aidlc-docs", VERSION, "S2", "index.md"))).toBe(true);
    expect(existsSync(join(repoPath, "aidlc-docs", VERSION, "S3", "index.md"))).toBe(true);

    // Cycle + run state persisted to the store.
    const persisted = store.repos.cycles.findById(result.cycle.id)!;
    expect(persisted).toBeDefined();
    const s3 = persisted.phases.find((p) => (p.step as string) === "S3")!;
    expect(s3.state).toBe("review");
    const s1 = persisted.phases.find((p) => (p.step as string) === "S1")!;
    expect(s1.state).toBe("done");
    expect(s1.runs[0]!.state).toBe("done");
    // The seeded run's startedAt is NOW - 1s (deterministic, before evidence).
    expect(s3.runs[0]!.startedAt).toBe(result.runStartedAt["S3"]!);
  });

  test("backward compatible: states-only fixture writes no artifacts/evidence", () => {
    const { store, project, repoPath } = setup();
    const result = seedCycleCore({
      store,
      ids: new SeqIdGen(),
      project,
      fixture: {
        version: VERSION,
        steps: [
          { step: "S1", state: "done" },
          { step: "S2", state: "running" },
        ],
      },
      now: NOW,
      studioRoot: STUDIO_ROOT,
    });
    expect(result.manifestPaths.length).toBe(0);
    // No _evidence dir, no product index for S2.
    expect(existsSync(join(repoPath, "aidlc-docs", VERSION, "_evidence"))).toBe(false);
    expect(existsSync(join(repoPath, "aidlc-docs", VERSION, "S2", "index.md"))).toBe(false);
    // State still persisted.
    const persisted = store.repos.cycles.findById(result.cycle.id)!;
    expect(persisted.phases.map((p) => p.state)).toEqual(["done", "running"]);
  });

  test("sandbox guard: refuses writing into the studio repo itself", () => {
    const store = buildStore(openDb(":memory:"));
    const studioProject = unwrap(
      openProject({
        id: ProjectId("p-studio"),
        repoPath: STUDIO_ROOT,
        vision: "vision/brief.md" as unknown as VisionRef,
        pipelineDef: [
          { id: Step("S1"), label: "S1", order: 0, skillRef: "k" as unknown as SkillRef },
        ],
        env: { modelName: "claude", worktreeRoot: "/wt", stallTimeoutMin: 30, maxAttempt: 3 },
        createdAt: NOW,
      }),
    );
    store.uow.run(() => store.repos.projects.save(studioProject));
    expect(() =>
      seedCycleCore({
        store,
        ids: new SeqIdGen(),
        project: studioProject,
        fixture: { version: VERSION, steps: [{ step: "S1", state: "done" }] },
        now: NOW,
        studioRoot: STUDIO_ROOT,
      }),
    ).toThrow(SeedError);
  });
});

// ── US-04 Q-01: the SUITE of plausible example cycles (real-run-equivalent) ──
// Seeds the committed fixtures (fixtures/seed-cycles/*) — a different app each,
// each stopped at a different step — and proves that ANY of those steps is
// verifiable IMMEDIATELY on plausible data, with NO live AI. The visual evidence
// is a GENUINE captured screenshot (not the 1x1 placeholder).
import { join as joinPath } from "node:path";

const FIXTURES_ROOT = joinPath(STUDIO_ROOT, "fixtures", "seed-cycles");
const SUITE_VERSION = "v0.0.1";
// A real PNG capture is tens of KB; the old placeholder was ~70 bytes. Anything
// above this threshold cannot be the 1x1 transparent PNG.
const MIN_REAL_PNG_BYTES = 2000;

describe("US-04 Q-01 — seed SUITE is real-run-equivalent + immediately verifiable", () => {
  function seedSuite(): { repoBySlug: Record<string, string>; stopBySlug: Record<string, string> } {
    const store = buildStore(openDb(":memory:"));
    const sandboxRoot = sandboxRepo();
    const items = seedSuiteCore({
      store,
      ids: new SeqIdGen(),
      sandboxRoot,
      fixturesRoot: FIXTURES_ROOT,
      now: NOW,
      studioRoot: STUDIO_ROOT,
    });
    const repoBySlug: Record<string, string> = {};
    const stopBySlug: Record<string, string> = {};
    for (const it of items) {
      repoBySlug[it.slug] = it.repoPath;
      const stop = it.result.cycle.phases.find(
        (p) => p.state === "review" || p.state === "running",
      );
      stopBySlug[it.slug] = stop ? (stop.step as string) : "(none)";
    }
    return { repoBySlug, stopBySlug };
  }

  test("every cycle stops at a DIFFERENT step (varied coverage)", () => {
    const { stopBySlug } = seedSuite();
    const stops = Object.values(stopBySlug);
    expect(stops.length).toBeGreaterThanOrEqual(5);
    // distinct stop steps → varied coverage across the pipeline.
    expect(new Set(stops).size).toBe(stops.length);
    // sanity: the known suite stops.
    expect(stopBySlug["todo-app"]).toBe("S2");
    expect(stopBySlug["inventory"]).toBe("S4");
    expect(stopBySlug["booking"]).toBe("S6");
    expect(stopBySlug["expense"]).toBe("S8");
    expect(stopBySlug["chat"]).toBe("S9");
  });

  test("chat@S9 and expense@S8 are gate-eligible IMMEDIATELY with a REAL screenshot", () => {
    const { repoBySlug } = seedSuite();
    const gate = new FsEvidenceGate(nodeFs);
    const runStartedAt = unwrap(instant("2026-06-20T00:00:00.000Z")); // NOW; forms are at NOW

    for (const [slug, step] of [
      ["chat", "S9"],
      ["expense", "S8"],
    ] as const) {
      const repoPath = repoBySlug[slug]!;
      const verdict = gate.check({ repoPath, version: SUITE_VERSION, step, runStartedAt });
      expect(verdict.eligibility).toBe("eligible");

      // the visual form points to a GENUINE capture, not the 1x1 placeholder.
      const manifestPath = join(
        repoPath,
        "aidlc-docs",
        SUITE_VERSION,
        "_evidence",
        step,
        "manifest.json",
      );
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        forms: { kind: string; path: string }[];
      };
      const shot = manifest.forms.find((f) => f.kind === "screenshot")!;
      const shotPath = join(repoPath, "aidlc-docs", SUITE_VERSION, shot.path);
      expect(existsSync(shotPath)).toBe(true);
      expect(statSync(shotPath).size).toBeGreaterThan(MIN_REAL_PNG_BYTES);
    }
  });

  test("artifacts are plausible real content (not stubs): code + concrete docs materialized", () => {
    const { repoBySlug } = seedSuite();
    const chat = repoBySlug["chat"]!;
    const docs = (p: string): string => join(chat, "aidlc-docs", SUITE_VERSION, p);

    // pure domain code shipped as a real file (S7), not a placeholder.
    const messageTs = docs("S7/code/message.ts");
    expect(existsSync(messageTs)).toBe(true);
    const code = readFileSync(messageTs, "utf8");
    expect(code).toContain("export");
    expect(code).not.toContain("(seeded product)");

    // the stopped step's product is the real scenario report (S9), not a stub.
    const s9 = readFileSync(docs("S9/index.md"), "utf8");
    expect(s9).not.toContain("(seeded product)");
    expect(s9.length).toBeGreaterThan(200);

    // a prior step's product exists too (immediate review needs prior context).
    expect(existsSync(docs("S1/index.md"))).toBe(true);
  });
});

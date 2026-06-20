// US-04 / Unit-04 (BT-04) — seedCycle core. Seeds, into an ISOLATED sandbox repo
// + sandbox DB, the DATA needed to verify any step IMMEDIATELY (without running a
// slow live AI):
//   ① phase/run STATE in the DB (Cycle aggregate, constructed directly — that's
//      the point of a seed: jump to a state).
//   ② PRIOR ARTIFACTS — aidlc-docs/<version>/sN/* for every prior done step
//      (satisfies the deterministic gate / prior context without running them).
//   ③ the step's PRODUCT — aidlc-docs/<version>/<step>/* (review target).
//   ④ the step's EVIDENCE — _evidence/<step>/manifest.json (+ run.log + shot.png)
//      with capturedAt >= the seeded run's startedAt, so FsEvidenceGate.check is
//      `eligible` immediately for an evidence:complete step.
//
// Two content modes:
//   • FIXTURE mode (`fixtureDir` set) — the REAL-RUN-EQUIVALENT path used by the
//     seed SUITE (S1 re-hearing Q-01). Artifacts and evidence are COPIED verbatim
//     from committed plausible fixtures on disk (fixtures/seed-cycles/<slug>/).
//     No placeholders: the content is whatever a real AI-DLC run would produce
//     (concrete US / screens / domain model / pure code / scenario report) and the
//     screenshot is a genuine captured PNG.
//   • INLINE mode (`fixtureDir` absent) — backward-compatible generated stubs for
//     the original states-only / minimal tests.
//
// "Immediate verification" guarantee (capturedAt >= startedAt): the caller passes
// ONE fixed `now`. Every seeded run starts at `runStartedAt = now - 1s` and every
// evidence form is captured at `now`. So `capturedAt (now) >= runStartedAt
// (now-1s)` always holds — deterministically, with no wall-clock involved.
//
// Pure of the script/CLI: this module takes a Store + IdGen + the resolved sandbox
// project + a fixed `now`. The bun script (scripts/seed-cycle.ts) is a thin CLI
// wrapper; the test imports `seedCycleCore` / `seedSuiteCore` directly.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Store } from "../db/store";
import type { IdGen } from "../../app/ports/sys";
import { version as makeVersion } from "../../domain/cycle/cycle";
import type {
  Cycle,
  Phase,
  Run,
  PhaseState,
  RunState,
} from "../../domain/cycle/cycle";
import { Step, DEFAULT_STEPS } from "../../domain/shared/vocab";
import { nonEmptyText, type Instant } from "../../domain/shared/primitives";
import { unwrap } from "../../domain/shared/result";
import { ProjectId } from "../../domain/shared/ids";
import {
  openProject,
  type Project,
  type VisionRef,
  type SkillRef,
} from "../../domain/project/project";
import { writeEvidenceManifest } from "../evidence/evidence-manifest";

// ── fixture shape (S6 seed-fixture.md) ──────────────────────────────────────
export type SeedEvidence = "none" | "log-only" | "complete";

export interface StepSeed {
  readonly step: string;
  readonly state: PhaseState;
  /** Write the step's OWN product (index.md) so there is something to review. */
  readonly produceArtifact?: boolean;
  /** Write prior done steps' index.md (deterministic gate / prior context). */
  readonly priorArtifacts?: boolean;
  /** Evidence to seed: none | log-only | complete(log + screenshot manifest). */
  readonly evidence?: SeedEvidence;
}

export interface CycleFixture {
  readonly version: string;
  readonly title?: string;
  readonly slug?: string;
  readonly brief?: string;
  readonly projectId?: string;
  readonly stopAt?: string;
  readonly steps: readonly StepSeed[];
}

export interface SeedResult {
  readonly cycle: Cycle;
  /** Absolute manifest paths written (evidence:complete | log-only steps). */
  readonly manifestPaths: readonly string[];
  /** Absolute index.md / artifact-dir paths written (prior + product). */
  readonly artifactPaths: readonly string[];
  /** Per-step: the seeded run's startedAt, so callers can drive the gate. */
  readonly runStartedAt: Readonly<Record<string, Instant>>;
}

export class SeedError extends Error {}

// One second before `now`, as a deterministic Instant. Used as the seeded run's
// startedAt so that evidence captured at `now` is always >= it.
const ONE_SECOND_MS = 1000;
function oneSecondBefore(now: Instant): Instant {
  const t = new Date(now).getTime();
  if (Number.isNaN(t)) throw new SeedError(`seed: invalid now instant ${now}`);
  return new Date(t - ONE_SECOND_MS).toISOString() as Instant;
}

/**
 * Refuse to write into the studio's OWN repo (would pollute real aidlc-docs).
 * The seed target MUST be an isolated/throwaway repo. We refuse when it IS the
 * studio repo root, or an ancestor that contains it. The studio root is the
 * running process cwd (the script runs from the studio repo).
 */
export function assertSandboxRepoPath(repoPath: string, studioRoot: string): void {
  const target = resolve(repoPath);
  const studio = resolve(studioRoot);
  if (target === studio) {
    throw new SeedError(
      `seed: refusing to write into the studio repo itself (${target}). ` +
        `Use a throwaway/isolated repo (e.g. under /tmp).`,
    );
  }
  // Refuse if target is an ancestor of the studio (writing there could shadow it).
  if (`${studio}/`.startsWith(`${target}/`)) {
    throw new SeedError(
      `seed: refusing repoPath ${target} — it contains the studio repo. Use an isolated repo.`,
    );
  }
}

const docsRoot = (repoPath: string, version: string): string =>
  join(repoPath, "aidlc-docs", version);

const stepDocsDir = (repoPath: string, version: string, step: string): string =>
  join(docsRoot(repoPath, version), step);

const stepIndexPath = (repoPath: string, version: string, step: string): string =>
  join(stepDocsDir(repoPath, version, step), "index.md");

function writeFileEnsuring(path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

// Prior = every other seeded step that is done AND ordered before `current`
// (by canonical "S<n>" numeric order; non-numeric steps sort last).
function priorDoneSteps(
  steps: readonly StepSeed[],
  current: StepSeed,
): readonly string[] {
  const order = (s: string): number => {
    const m = /^S(\d+)$/.exec(s);
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  };
  const cur = order(current.step);
  return steps
    .filter((s) => s.state === "done" && order(s.step) < cur)
    .map((s) => s.step);
}

/** Build a Phase at the requested state (with a coherent run for non-pending). */
function phaseFor(
  seed: StepSeed,
  index: number,
  ids: IdGen,
  runStartedAt: Instant,
  now: Instant,
): Phase {
  const runs: Run[] = [];
  if (seed.state !== "pending") {
    // running phase → a running run; review/done phase → a finished (done) run.
    const runState: RunState = seed.state === "running" ? "running" : "done";
    runs.push({
      id: ids.runId(),
      attempt: 1,
      state: runState,
      startedAt: runStartedAt,
      ...(runState === "done" ? { endedAt: now } : {}),
    });
  }
  return {
    id: ids.phaseId(),
    step: Step(seed.step),
    order: index,
    state: seed.state,
    runs,
  };
}

// ── fixture-content helpers (FIXTURE mode) ──────────────────────────────────
const fixtureArtifactDir = (fixtureDir: string, step: string): string =>
  join(fixtureDir, "artifacts", step);

const fixtureEvidenceDir = (fixtureDir: string, step: string): string =>
  join(fixtureDir, "evidence", step);

/** Copy a fixture step's whole artifact subtree into the sandbox docs dir. */
function materializeArtifactDir(
  fixtureDir: string,
  step: string,
  repoPath: string,
  version: string,
): string | null {
  const src = fixtureArtifactDir(fixtureDir, step);
  if (!existsSync(src)) return null;
  const dest = stepDocsDir(repoPath, version, step);
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  return dest;
}

// ── ④ evidence writer (shared by both modes) ────────────────────────────────
interface EvidenceSource {
  /** run.log body (FIXTURE: read from disk; INLINE: generated). */
  readonly log: string;
  /** screenshot bytes (FIXTURE: real captured PNG; INLINE: minimal PNG). null = none. */
  readonly shot: Uint8Array | null;
}

function writeEvidence(
  source: EvidenceSource,
  evidence: SeedEvidence,
  repoPath: string,
  version: string,
  step: string,
  now: Instant,
): string {
  const evDir = join(docsRoot(repoPath, version), "_evidence", step);
  writeFileEnsuring(join(evDir, "run.log"), source.log);
  const forms: { kind: "log" | "screenshot"; path: string; capturedAt: string }[] = [
    { kind: "log", path: `_evidence/${step}/run.log`, capturedAt: now },
  ];
  if (evidence === "complete") {
    if (!source.shot) {
      throw new SeedError(
        `seed: step ${step} is evidence:complete but no screenshot is available ` +
          `(fixture must provide evidence/${step}/shot.png).`,
      );
    }
    writeFileEnsuring(join(evDir, "shot.png"), source.shot);
    forms.push({ kind: "screenshot", path: `_evidence/${step}/shot.png`, capturedAt: now });
  }
  // forms are captured at `now`, which is always >= the seeded run's startedAt.
  return writeEvidenceManifest(repoPath, version, step, forms, now);
}

/** Resolve the evidence source for a step from disk (FIXTURE) or generated (INLINE). */
function evidenceSourceFor(
  seed: StepSeed,
  evidence: SeedEvidence,
  fixtureDir: string | undefined,
  runStartedAt: Instant,
): EvidenceSource {
  if (fixtureDir) {
    const evDir = fixtureEvidenceDir(fixtureDir, seed.step);
    const logPath = join(evDir, "run.log");
    if (!existsSync(logPath)) {
      throw new SeedError(
        `seed: fixture step ${seed.step} declares evidence:${evidence} but ` +
          `${logPath} is missing.`,
      );
    }
    const shotPath = join(evDir, "shot.png");
    return {
      log: readFileSync(logPath, "utf8"),
      shot: existsSync(shotPath) ? readFileSync(shotPath) : null,
    };
  }
  // INLINE (generated)
  return {
    log:
      `[seed] ${seed.step} run.log — immediate-verify fixture (BT-04)\n` +
      `startedAt=${runStartedAt}\n`,
    shot: evidence === "complete" ? MINIMAL_PNG : null,
  };
}

/**
 * Seed a cycle's STATE + DATA into the sandbox. Deterministic given `now` + ids.
 *
 * @param fixtureDir  when set, artifacts/evidence are COPIED from this committed
 *                    fixture dir (real-run-equivalent content). When absent,
 *                    minimal stubs are generated (backward compatible).
 */
export function seedCycleCore(opts: {
  readonly store: Store;
  readonly ids: IdGen;
  readonly project: Project;
  readonly fixture: CycleFixture;
  readonly now: Instant;
  readonly studioRoot: string;
  readonly fixtureDir?: string;
}): SeedResult {
  const { store, ids, project, fixture, now, studioRoot, fixtureDir } = opts;

  if (!Array.isArray(fixture.steps) || fixture.steps.length === 0) {
    throw new SeedError("seed: fixture.steps must be a non-empty array");
  }

  const repoPath = project.repoPath as string;
  assertSandboxRepoPath(repoPath, studioRoot);

  const runStartedAt = oneSecondBefore(now);
  const version = unwrap(makeVersion(fixture.version));

  // ── ① DB state ─────────────────────────────────────────────────────────
  const phases = fixture.steps.map((seed, i) =>
    phaseFor(seed, i, ids, runStartedAt, now),
  );
  const cycle: Cycle = {
    id: ids.cycleId(),
    projectId: project.id,
    version,
    title: unwrap(nonEmptyText(fixture.title ?? `seed ${fixture.version}`)),
    taskIds: [],
    state: "active",
    createdAt: now,
    phases,
  };
  store.uow.run(() => store.repos.cycles.save(cycle));

  // ── ②③④ disk data ────────────────────────────────────────────────────
  const artifactPaths: string[] = [];
  const manifestPaths: string[] = [];
  const runStartedAtByStep: Record<string, Instant> = {};
  const writtenPriors = new Set<string>();
  // Default (INLINE): also seed prior artifacts for the highest (last-declared) step.
  const highestStep = fixture.steps[fixture.steps.length - 1]!.step;

  for (const seed of fixture.steps) {
    runStartedAtByStep[seed.step] = runStartedAt;

    if (fixtureDir) {
      // FIXTURE mode: copy whatever artifact subtree this step ships (idempotent
      // across steps — each step has its own dir). Priors are materialized when
      // their own loop iteration runs.
      const dest = materializeArtifactDir(fixtureDir, seed.step, repoPath, fixture.version);
      if (dest) artifactPaths.push(dest);
    } else {
      // INLINE mode (generated stubs) ─────────────────────────────────────
      // ② prior artifacts (explicit flag OR default for the highest step)
      const wantPriors = seed.priorArtifacts === true || seed.step === highestStep;
      if (wantPriors) {
        for (const prior of priorDoneSteps(fixture.steps, seed)) {
          if (writtenPriors.has(prior)) continue;
          const p = stepIndexPath(repoPath, fixture.version, prior);
          writeFileEnsuring(
            p,
            `# ${prior} (seeded prior artifact)\n\n` +
              `Seeded so ${seed.step} can be verified without re-running ${prior} (BT-04).\n`,
          );
          artifactPaths.push(p);
          writtenPriors.add(prior);
        }
      }
      // ③ the step's own product
      if (seed.produceArtifact === true) {
        const p = stepIndexPath(repoPath, fixture.version, seed.step);
        writeFileEnsuring(
          p,
          `# ${seed.step} (seeded product)\n\n` +
            `Review target for ${seed.step}. Seeded for immediate verification (BT-04).\n`,
        );
        artifactPaths.push(p);
      }
    }

    // ④ the step's evidence (both modes)
    const evidence: SeedEvidence = seed.evidence ?? "none";
    if (evidence !== "none") {
      const source = evidenceSourceFor(seed, evidence, fixtureDir, runStartedAt);
      const manifestPath = writeEvidence(
        source,
        evidence,
        repoPath,
        fixture.version,
        seed.step,
        now,
      );
      manifestPaths.push(manifestPath);
    }
  }

  return {
    cycle,
    manifestPaths,
    artifactPaths,
    runStartedAt: runStartedAtByStep,
  };
}

// ── seed SUITE (US-04 Q-01): many plausible cycles, each stopped differently ─
export interface SuiteSeedItem {
  readonly slug: string;
  readonly project: Project;
  readonly repoPath: string;
  readonly result: SeedResult;
}

function loadCycleFixture(fixtureDir: string): CycleFixture {
  const path = join(fixtureDir, "cycle.json");
  if (!existsSync(path)) {
    throw new SeedError(`seed: ${path} not found (each fixture needs a cycle.json).`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CycleFixture;
  if (!parsed.version || !Array.isArray(parsed.steps)) {
    throw new SeedError(`seed: ${path} is missing version/steps.`);
  }
  return parsed;
}

function buildSuiteProject(repoPath: string, slug: string, now: Instant): Project {
  return unwrap(
    openProject({
      id: ProjectId(`p-seed-${slug}`),
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
    }),
  );
}

/**
 * Seed EVERY fixture under `fixturesRoot` into the sandbox — one PROJECT per
 * cycle (rooted at `<sandboxRoot>/<slug>`), each stopped at its own step, each
 * with real-run-equivalent artifacts + evidence. This is the US-04 deliverable:
 * a suite that lets ANY step be verified immediately on plausible data, with no
 * live AI.
 */
export function seedSuiteCore(opts: {
  readonly store: Store;
  readonly ids: IdGen;
  readonly sandboxRoot: string;
  readonly fixturesRoot: string;
  readonly now: Instant;
  readonly studioRoot: string;
  /** Optional subset of slugs to seed (default: all fixtures present). */
  readonly only?: readonly string[];
}): readonly SuiteSeedItem[] {
  const { store, ids, sandboxRoot, fixturesRoot, now, studioRoot, only } = opts;
  if (!existsSync(fixturesRoot)) {
    throw new SeedError(`seed: fixtures root not found: ${fixturesRoot}`);
  }
  const slugs = readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .filter((slug) => (only ? only.includes(slug) : true))
    .sort();

  const items: SuiteSeedItem[] = [];
  for (const slug of slugs) {
    const fixtureDir = join(fixturesRoot, slug);
    const fixture = loadCycleFixture(fixtureDir);
    const repoPath = join(sandboxRoot, slug);
    mkdirSync(repoPath, { recursive: true });
    const project = buildSuiteProject(repoPath, slug, now);
    store.uow.run(() => store.repos.projects.save(project));
    const result = seedCycleCore({
      store,
      ids,
      project,
      fixture,
      now,
      studioRoot,
      fixtureDir,
    });
    items.push({ slug, project, repoPath, result });
  }
  if (items.length === 0) {
    throw new SeedError(
      `seed: no fixtures seeded from ${fixturesRoot}` +
        (only ? ` (filtered by only=${only.join(",")})` : ""),
    );
  }
  return items;
}

// A minimal 1x1 transparent PNG — INLINE mode only (FIXTURE mode ships real PNGs).
const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

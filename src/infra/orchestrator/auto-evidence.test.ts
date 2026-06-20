/**
 * US-04 (AC「視覚/動作証拠の自動生成を毎 step 自動実行」): the LIVE orchestrator must
 * AUTOMATICALLY write a step's live-evidence manifest from REAL run artifacts, so the
 * Unit-01 gate validates platform-produced evidence instead of a hand-faked file.
 *
 * These tests drive the private writeStepEvidence helper directly (seeding the
 * repoPath/version maps the same way an actual launch would) with a fake capturer +
 * a temp repo — deterministic, no real claude. They prove:
 *   - a reviewable result writes _evidence/<step>/manifest.json with a log + screenshot form
 *   - run.log = the run's actual stdout; shot.png = the captured png copied in
 *   - capturedAt is UTC `Z` and AFTER the run start (passes the gate freshness check)
 *   - no version/repoPath → no-op (backward compatible: scripted / version-less)
 *   - capture failure → log-only manifest (gate honestly blocks; no faked visual evidence)
 */
import { test, expect, describe, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LiveClaudeOrchestrator } from "./live";
import type { RunContext, RunEmission } from "../../app/ports/orchestrator";
import type { ScreenshotCapturer, CaptureRequest, CaptureResult } from "../../app/ports/screenshot";
import type { RunId, CycleId, PhaseId, ProjectId } from "../../domain/shared/ids";
import type { Step } from "../../domain/shared/vocab";

const RUN_ID = "run-auto-ev" as RunId;
const VERSION = "v0.0.5";
const STEP = "S1";

const ctx: RunContext = {
  runId: RUN_ID,
  projectId: "proj-1" as ProjectId,
  cycleId: "cyc-1" as CycleId,
  phaseId: "ph-1" as PhaseId,
  step: STEP as Step,
};

/** Fake capturer that writes a real (tiny) png to outPath, mimicking Playwright. */
class WritingCapturer implements ScreenshotCapturer {
  async capture(req: CaptureRequest): Promise<CaptureResult> {
    writeFileSync(req.outPath, "PNGBYTES");
    return { ok: true, path: req.outPath };
  }
}

/** Fake capturer that always fails (no png written). */
class FailingCapturer implements ScreenshotCapturer {
  async capture(): Promise<CaptureResult> {
    return { ok: false, reason: "playwright timeout" };
  }
}

const noopSink = async (_e: RunEmission): Promise<void> => {};

interface PrivateMaps {
  repoPaths: Map<string, string>;
  versions: Map<string, string>;
  writeStepEvidence(ctx: RunContext, stdout: string): Promise<void>;
}

function seed(orc: LiveClaudeOrchestrator, repoPath: string, version?: string): void {
  const p = orc as unknown as PrivateMaps;
  p.repoPaths.set(RUN_ID, repoPath);
  if (version !== undefined) p.versions.set(RUN_ID, version);
}

const tempDirs: string[] = [];
function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "auto-evidence-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "aidlc-docs", VERSION), { recursive: true });
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const d = tempDirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("LiveClaudeOrchestrator auto-evidence (US-04)", () => {
  test("reviewable result writes manifest with a log + screenshot form from real artifacts", async () => {
    const repo = makeRepo();
    const shotsDir = mkdtempSync(join(tmpdir(), "shots-"));
    tempDirs.push(shotsDir);
    const before = new Date();
    const orc = new LiveClaudeOrchestrator({
      sink: noopSink,
      capturer: new WritingCapturer(),
      verifyUrl: "http://localhost:3000",
      shotsDir,
    });
    seed(orc, repo, VERSION);

    const stdout = "LIVE VERTICAL-PATH TRACE\nstep S1 produced its output";
    await (orc as unknown as PrivateMaps).writeStepEvidence(ctx, stdout);

    const manifestPath = join(repo, "aidlc-docs", VERSION, "_evidence", STEP, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.step).toBe(STEP);
    const kinds = manifest.forms.map((f: { kind: string }) => f.kind).sort();
    expect(kinds).toEqual(["log", "screenshot"]);

    // log form points at run.log which holds the ACTUAL stdout.
    const logForm = manifest.forms.find((f: { kind: string }) => f.kind === "log");
    expect(logForm.path).toBe(`_evidence/${STEP}/run.log`);
    expect(readFileSync(join(repo, "aidlc-docs", VERSION, logForm.path), "utf8")).toBe(stdout);

    // screenshot form points at shot.png copied into the _evidence dir (self-contained).
    const shotForm = manifest.forms.find((f: { kind: string }) => f.kind === "screenshot");
    expect(shotForm.path).toBe(`_evidence/${STEP}/shot.png`);
    expect(existsSync(join(repo, "aidlc-docs", VERSION, shotForm.path))).toBe(true);

    // capturedAt is UTC `Z` and AFTER the run-start instant (gate freshness passes).
    for (const f of manifest.forms) {
      expect(f.capturedAt.endsWith("Z")).toBe(true);
      expect(new Date(f.capturedAt).getTime()).toBeGreaterThanOrEqual(before.getTime());
    }
  });

  test("no version → no-op (backward compatible: scripted / version-less)", async () => {
    const repo = makeRepo();
    const orc = new LiveClaudeOrchestrator({
      sink: noopSink,
      capturer: new WritingCapturer(),
      verifyUrl: "http://localhost:3000",
    });
    seed(orc, repo); // repoPath only, no version
    await (orc as unknown as PrivateMaps).writeStepEvidence(ctx, "trace");
    expect(existsSync(join(repo, "aidlc-docs", VERSION, "_evidence", STEP, "manifest.json"))).toBe(false);
  });

  test("capture failure → log-only manifest (gate honestly blocks; no faked visual evidence)", async () => {
    const repo = makeRepo();
    const orc = new LiveClaudeOrchestrator({
      sink: noopSink,
      capturer: new FailingCapturer(),
      verifyUrl: "http://localhost:3000",
    });
    seed(orc, repo, VERSION);
    await (orc as unknown as PrivateMaps).writeStepEvidence(ctx, "trace");

    const manifestPath = join(repo, "aidlc-docs", VERSION, "_evidence", STEP, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.forms.map((f: { kind: string }) => f.kind)).toEqual(["log"]);
  });
});

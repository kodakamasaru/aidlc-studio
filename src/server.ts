// Composition root — wires concrete infra adapters into the Ports bundle and
// builds the Hono app. Production uses a file-backed bun:sqlite DB, the system
// clock, UUID ids, a no-op notify, and (v0) the ScriptedOrchestrator whose
// emissions flow back through EventApplier (the DomainEventSink). The live
// Claude-CLI orchestrator is wired in Phase 5b.
//
// server.ts is export-only so importing buildServer (e.g. for tests) never
// starts a listener. The Bun run entry lives in src/main.ts.
import type { Database } from "bun:sqlite";
import type { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./infra/db/open";
import { buildStore } from "./infra/db/store";
import { SystemClock } from "./infra/sys/clock";
import { UuidIdGen } from "./infra/sys/id-gen";
import { nodeFs } from "./infra/sys/fs";
import { createApp } from "./infra/http/app";
import { logError } from "./infra/log";
import { EngineService } from "./app/services/engine-service";
import { reconcileRunningRuns } from "./app/services/reconcile";
import {
  ScriptedOrchestrator,
  type ScriptedScenario,
} from "./infra/orchestrator/scripted";
import { LiveClaudeOrchestrator } from "./infra/orchestrator/live";
import { PromptComposer } from "./app/services/prompt-composer";
import { PlaywrightCapturer } from "./infra/screenshot/playwright-capturer";
import type { Ports } from "./app/ports/composition";
import type { OrchestratorPort, DomainEventSink } from "./app/ports/orchestrator";
import type { NotifyPort } from "./app/ports/notify";
import type { SessionRepo } from "./app/ports/repos";

export interface BuildServerOptions {
  readonly dbPath?: string;
  readonly orchestrator?: "scripted" | "live";
}

export interface BuiltServer {
  readonly app: Hono;
  readonly db: Database;
  readonly ports: Ports;
}

const DEFAULT_DB_PATH = "aidlc-studio.db";
// US-05: verify-ui screenshots are written here (runtime, gitignored) and served
// at SHOT_URL_BASE so a review block's <img src> can load the real png. Path index
// only — the binary lives on disk, never in the DB (artifact 模範 / US-01 boundary).
const SHOTS_DIR = resolve(process.cwd(), ".verify-screenshots");
const SHOT_URL_BASE = "/api/screenshots";
/** Filename guard for the screenshots route: no path traversal, png only. */
const SHOT_FILE_RE = /^[A-Za-z0-9._-]+\.png$/;
/**
 * Allowed AIDLC_MODEL shape. A model name is interpolated directly into the
 * spawn argv (`--model <value>`); restricting it to identifier-safe chars stops
 * a crafted value from injecting an extra `--flag` into the live CLI args.
 */
const MODEL_NAME_RE = /^[A-Za-z0-9._-]+$/;

const noopNotify: NotifyPort = {
  questionRaised(): void {
    // no-op (US-31 notification is v0.0.x).
  },
};

export function buildServer(opts?: BuildServerOptions): BuiltServer {
  const db = openDb(opts?.dbPath ?? process.env.AIDLC_DB ?? DEFAULT_DB_PATH);
  const store = buildStore(db);
  const clock = new SystemClock();
  const ids = new UuidIdGen();

  // The EngineService is the DomainEventSink: orchestrator emissions are persisted
  // by its inner EventApplier (S7 D-04), then it drives the gen→gate→eval pipeline
  // (S8). Mutual dependency (engine→orchestrator.launchEval, orchestrator→sink→
  // engine) is broken with a late-bound sink closure.
  let engine: EngineService;
  const sink: DomainEventSink = (e) => engine.handle(e);

  // Selection precedence: explicit opts → AIDLC_ORCHESTRATOR env → "scripted".
  // "scripted" stays the default so the deterministic suite + visual E2E are
  // unaffected; AIDLC_ORCHESTRATOR=live opts into the local Claude-CLI adapter.
  const orchestratorKind =
    opts?.orchestrator ??
    (process.env.AIDLC_ORCHESTRATOR === "live" ? "live" : "scripted");
  // Unit-04: the live adapter persists each run's claude session_id via this repo
  // so a later answer can `claude --resume <sessionId>`. Without it the session_id
  // is captured but never saved → resume fails with "sessionId missing" and the
  // hearing stalls right after the human answers (S10 実機: 回答したら止まる).
  const orchestrator = buildOrchestrator(orchestratorKind, sink, store.repos.sessions);

  const ports: Ports = {
    clock,
    ids,
    fs: nodeFs,
    uow: store.uow,
    repos: store.repos,
    orchestrator,
    notify: noopNotify,
  };
  engine = new EngineService(ports);

  // Startup recovery: any run still "running" at boot is orphaned (this fresh
  // process holds no live child/stall-timer behind it — see reconcile.ts), so
  // drive it to "stalled" before serving. Without this, a crash or `bun --watch`
  // restart mid-run leaves the run stuck "running" forever with no retry path.
  reconcileRunningRuns(ports);

  const app = createApp(ports);
  mountScreenshots(app);
  mountStaticSpa(app);
  return { app, db, ports };
}

/**
 * US-05: serve verify-ui screenshots from SHOTS_DIR. The src in a live review block
 * is `${SHOT_URL_BASE}/<runId>.png`; this route returns the png bytes on demand
 * (path index, not DB blob). Filename is guarded against traversal; missing → 404.
 */
function mountScreenshots(app: Hono): void {
  app.get(`${SHOT_URL_BASE}/:file`, async (c) => {
    const file = c.req.param("file");
    if (!SHOT_FILE_RE.test(file)) return c.text("bad filename", 400);
    const path = join(SHOTS_DIR, file);
    if (!existsSync(path)) return c.text("not found", 404);
    return new Response(Bun.file(path), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
    });
  });
}

/**
 * Serve the built SPA from web/dist so the app is same-origin with the API.
 * Only touches non-/api paths (the API tests rely on createApp staying API-only,
 * so this lives in the composition root, not in createApp). No-ops when web/dist
 * doesn't exist yet (e.g. before a build, or in unit tests).
 */
function mountStaticSpa(app: Hono): void {
  const here = dirname(fileURLToPath(import.meta.url)); // src/
  const distDir = join(here, "..", "web", "dist");
  if (!existsSync(distDir)) return;

  const root = "./web/dist";
  // Static assets (hashed JS/CSS/maps) — let the API win on /api/*.
  app.use("/assets/*", serveStatic({ root }));
  app.get("/favicon.ico", serveStatic({ path: "./web/dist/favicon.ico" }));

  // SPA fallback: any non-/api GET that didn't match an asset → index.html.
  // index.html must NOT be cached by the browser (its hashed asset references
  // change on every build); otherwise a rebuilt frontend looks "stale" until a
  // hard refresh. The hashed /assets/* stay cacheable.
  app.get("*", (c, next) => {
    if (c.req.path.startsWith("/api")) return next();
    c.header("Cache-Control", "no-cache, must-revalidate");
    return serveStatic({ path: "./web/dist/index.html" })(c, next);
  });
}

function buildOrchestrator(
  kind: "scripted" | "live",
  sink: DomainEventSink,
  sessionRepo: SessionRepo,
): OrchestratorPort {
  if (kind === "live") {
    // Drive the locally-installed Claude Code CLI headless (S7 Phase 5b). The
    // model defaults to the CLI's own default unless AIDLC_MODEL overrides it.
    const raw = process.env.AIDLC_MODEL?.trim();
    if (raw !== undefined && raw.length > 0 && !MODEL_NAME_RE.test(raw)) {
      logError("buildOrchestrator: ignoring invalid AIDLC_MODEL", { raw });
    }
    const model =
      raw !== undefined && raw.length > 0 && MODEL_NAME_RE.test(raw)
        ? raw
        : undefined;
    // AIDLC_STALL_TIMEOUT_MS bounds how long a live run may run with no result
    // before it's treated as STALLED (retriable). Defaults to the adapter's
    // built-in 120s; set a small value to demo/test the stall surface quickly.
    const tRaw = process.env.AIDLC_STALL_TIMEOUT_MS?.trim();
    const tParsed = tRaw ? Number.parseInt(tRaw, 10) : NaN;
    const timeoutMs = Number.isInteger(tParsed) && tParsed > 0 ? tParsed : undefined;
    // AIDLC_MAX_TURNS caps claude's agentic turns (`--max-turns`). UNSET = no cap
    // (the agent can finish a phase); set a positive int only to bound it.
    const mtRaw = process.env.AIDLC_MAX_TURNS?.trim();
    const mtParsed = mtRaw ? Number.parseInt(mtRaw, 10) : NaN;
    const maxTurns = Number.isInteger(mtParsed) && mtParsed > 0 ? mtParsed : undefined;
    // US-03: compose real prompts from skill 本文 + contracts (single canonical
    // source) instead of the one-sentence stub. The composer reads 本文 via the Fs
    // port (nodeFs), keeping the live adapter's prompt build hexagonal.
    const composer = new PromptComposer(nodeFs);
    // US-05: capture a real verify-ui screenshot of the running app (this server)
    // on evaluator runs. verifyUrl defaults to this process's own URL; the capturer
    // writes pngs into SHOTS_DIR which the /api/screenshots route serves.
    const capturer = new PlaywrightCapturer();
    const verifyUrl =
      process.env.AIDLC_VERIFY_URL?.trim() ||
      `http://127.0.0.1:${process.env.PORT?.trim() || "8787"}/`;
    return new LiveClaudeOrchestrator({
      sink,
      composer,
      capturer,
      verifyUrl,
      sessionRepo,
      shotsDir: SHOTS_DIR,
      shotUrlBase: SHOT_URL_BASE,
      ...(model !== undefined ? { model } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(maxTurns !== undefined ? { maxTurns } : {}),
    });
  }
  // AIDLC_SCENARIO lets E2E pick the deterministic script: "happy" (default)
  // drives the full Q→review→done loop; "stall-first" stalls on launch so the
  // stalled/retry surface can be exercised. "gen-eval-complete"/"gen-eval-descope"
  // drive the v0.0.2 gen→gate→eval pipeline (a step with a verification contract
  // launches as generator) so S9 can validate the completeness gate, descope
  // decision, and rich rendering through the browser. Unknown values → happy.
  const allowed: readonly ScriptedScenario[] = [
    "happy",
    "stall-first",
    "gen-eval-complete",
    "gen-eval-descope",
    "config-hearing", // BU-3: exercises the config-hearing write mechanism
    "missing-context", // S9: visual evidence for the missing-context banner in ReviewDetail
  ];
  const requested = process.env.AIDLC_SCENARIO as ScriptedScenario | undefined;
  const scenario =
    requested && allowed.includes(requested) ? requested : "happy";
  return new ScriptedOrchestrator({ sink, scenario });
}

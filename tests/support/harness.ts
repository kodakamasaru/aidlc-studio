// buildTestApp — wires a real (in-memory) SQLite store to deterministic system
// fakes (FixedClock + SeqIdGen) and a recording orchestrator + noop notify, then
// builds the Hono app over the resulting Ports. Tests drive it via app.request()
// and assert both persisted state (real DB) and dispatched orchestrator calls.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import type { Hono } from "hono";
import { openDb } from "../../src/infra/db/open";
import { buildStore } from "../../src/infra/db/store";
import { FixedClock, SeqIdGen, FakeFs } from "../../src/infra/sys/fakes";
import { createApp } from "../../src/infra/http/app";
import type { Ports } from "../../src/app/ports/composition";
import type { EvidenceGatePort } from "../../src/app/ports/evidence-gate";
import type {
  DomainEventSink,
  OrchestratorPort,
} from "../../src/app/ports/orchestrator";
import { EngineService } from "../../src/app/services/engine-service";
import {
  ScriptedOrchestrator,
  type ScriptedScenario,
} from "../../src/infra/orchestrator/scripted";
import {
  RecordingOrchestrator,
  FailingOrchestrator,
  noopNotify,
} from "./recording-orchestrator";

export interface TestApp {
  readonly app: Hono;
  readonly ports: Ports;
  readonly orchestrator: RecordingOrchestrator;
  readonly db: Database;
}

// ProjectService.createProject now rejects a repoPath that is not absolute or
// does not exist on disk, so tests need a real absolute dir. makeRepoDir creates
// a unique temp dir per call (caller owns cleanup; OS temp is fine for tests).
export function makeRepoDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-repo-"));
}

export function buildTestApp(): TestApp {
  const db = openDb(":memory:");
  const store = buildStore(db);
  const orchestrator = new RecordingOrchestrator();
  const ports: Ports = {
    clock: new FixedClock(),
    ids: new SeqIdGen(),
    fs: new FakeFs(),
    uow: store.uow,
    repos: store.repos,
    orchestrator,
    notify: noopNotify,
  };
  const app = createApp(ports);
  return { app, ports, orchestrator, db };
}

// Like buildTestApp but with an orchestrator that always throws (post-commit
// failure) — used to assert run-state compensation + 502 mapping (Fix 4).
export interface FailingTestApp {
  readonly app: Hono;
  readonly ports: Ports;
  readonly db: Database;
}

export function buildFailingApp(
  orchestrator: OrchestratorPort = new FailingOrchestrator(),
): FailingTestApp {
  const db = openDb(":memory:");
  const store = buildStore(db);
  const ports: Ports = {
    clock: new FixedClock(),
    ids: new SeqIdGen(),
    fs: new FakeFs(),
    uow: store.uow,
    repos: store.repos,
    orchestrator,
    notify: noopNotify,
  };
  const app = createApp(ports);
  return { app, ports, db };
}

// ── full-loop harness ────────────────────────────────────────────
// Unlike buildTestApp (which records orchestrator calls), this wires the REAL
// ScriptedOrchestrator → EventApplier sink so the whole vertical loop runs
// deterministically against a real in-memory DB. A distinct-instant clock keeps
// createdAt ordering stable so inbox ordering is reproducible.
export interface LoopTestApp {
  readonly app: Hono;
  readonly ports: Ports;
  readonly db: Database;
  readonly orchestrator: ScriptedOrchestrator;
}

const LOOP_INSTANTS: readonly string[] = [
  "2026-01-01T00:00:00.000Z",
  "2026-01-01T00:00:01.000Z",
  "2026-01-01T00:00:02.000Z",
  "2026-01-01T00:00:03.000Z",
  "2026-01-01T00:00:04.000Z",
  "2026-01-01T00:00:05.000Z",
  "2026-01-01T00:00:06.000Z",
  "2026-01-01T00:00:07.000Z",
  "2026-01-01T00:00:08.000Z",
  "2026-01-01T00:00:09.000Z",
];

export function buildLoopTestApp(
  scenario: ScriptedScenario = "happy",
  evidence?: EvidenceGatePort,
): LoopTestApp {
  const db = openDb(":memory:");
  const store = buildStore(db);
  const clock = new FixedClock(LOOP_INSTANTS);
  const ids = new SeqIdGen();

  // The EngineService wraps the EventApplier as the sink and drives gen→gate→eval.
  // Mutual dependency (engine→orchestrator for launchEval, orchestrator→sink→engine
  // for emissions) is broken with a late-bound sink closure: the orchestrator is
  // built first over `(e) => engine.handle(e)`, then `engine` is assigned.
  let engine: EngineService;
  const sink: DomainEventSink = (e) => engine.handle(e);
  const orchestrator = new ScriptedOrchestrator({ sink, scenario });

  const ports: Ports = {
    clock,
    ids,
    fs: new FakeFs(),
    uow: store.uow,
    repos: store.repos,
    orchestrator,
    notify: noopNotify,
    ...(evidence !== undefined ? { evidence } : {}),
  };
  engine = new EngineService(ports);
  const app = createApp(ports);
  return { app, ports, db, orchestrator };
}

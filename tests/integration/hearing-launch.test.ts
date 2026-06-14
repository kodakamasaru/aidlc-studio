/**
 * BU-3 WEB+API slice: POST /api/hearing/launch integration tests.
 *
 * Tests cover:
 *   1. cycle-scope: first pending phase starts → returns {scope, cycleId, runId, step}
 *   2. cycle-scope: config questions appear in cycle inbox after launch
 *   3. cycle-scope: all phases already started → 409 HearingNoPendingPhase
 *   4. global-scope: returns {scope:"global"} (no cycle context / placeholder path)
 *   5. invalid scope → 400 from parseScope
 *   6. missing scope field → 400 MissingField:scope
 *   7. unknown cycleId → 404 CycleNotFound
 */
import { describe, test, expect } from "bun:test";
import { buildLoopTestApp, buildTestApp, makeRepoDir } from "../support/harness";
import type { LoopTestApp, TestApp } from "../support/harness";
import { CycleId } from "../../src/domain/shared/ids";

async function post(
  app: LoopTestApp["app"] | TestApp["app"],
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => undefined) };
}

async function get(
  app: LoopTestApp["app"] | TestApp["app"],
  path: string,
): Promise<{ status: number; json: any }> {
  const res = await app.request(path);
  return { status: res.status, json: await res.json().catch(() => undefined) };
}

async function createProject(h: LoopTestApp | TestApp): Promise<string> {
  const { status, json } = await post(h.app, "/api/projects", {
    repoPath: makeRepoDir(),
  });
  expect(status).toBe(201);
  return json.data.id as string;
}

async function createCycle(
  h: LoopTestApp | TestApp,
  projectId: string,
): Promise<any> {
  const { status, json } = await post(
    h.app,
    `/api/projects/${projectId}/cycles`,
    { title: "hearing test cycle", version: "v1.0.0" },
  );
  expect(status).toBe(201);
  return json.data;
}

// ── cycle-scope launch ────────────────────────────────────────────────────────

describe("POST /api/hearing/launch — cycle-scope", () => {
  test("returns cycleId + runId + step after starting the first pending phase", async () => {
    const h = buildLoopTestApp("config-hearing");
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);

    const { status, json } = await post(h.app, "/api/hearing/launch", {
      scope: `cycle:${cycle.id}`,
    });

    expect(status).toBe(200);
    const data = json.data;
    expect(data.scope).toBe(`cycle:${cycle.id}`);
    expect(data.cycleId).toBe(cycle.id);
    expect(typeof data.runId).toBe("string");
    expect(data.runId.length).toBeGreaterThan(0);
    expect(typeof data.step).toBe("string");
    expect(data.step.length).toBeGreaterThan(0);
  });

  test("cycle inbox shows 2 config questions with targets after launch", async () => {
    const h = buildLoopTestApp("config-hearing");
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);

    await post(h.app, "/api/hearing/launch", { scope: `cycle:${cycle.id}` });

    const inbox = await get(h.app, `/api/cycles/${cycle.id}/inbox`);
    expect(inbox.status).toBe(200);
    const questions: any[] = inbox.json.data;
    // config-hearing scenario emits 2 questions with targets
    expect(questions).toHaveLength(2);
    expect(questions.every((q: any) => q.kind === "question")).toBe(true);
    const targets = questions.map((q: any) => q.target).filter(Boolean);
    expect(targets).toHaveLength(2);
    expect(targets.every((t: any) => t.step === "S1")).toBe(true);
    const fields = targets.map((t: any) => t.field as string).sort();
    expect(fields).toEqual(["humanGate.mode", "output.profileKind"]);
  });

  test("409 HearingNoPendingPhase when no pending phase remains", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);

    // Directly set ALL phases to "running" in the repo so none are pending.
    // This simulates a fully-in-progress cycle without going through the full
    // phase-start protocol (which requires sequential done→pending ordering).
    const domainCycle = h.ports.repos.cycles.findById(CycleId(cycle.id))!;
    const allRunning = {
      ...domainCycle,
      state: "active" as const,
      phases: domainCycle.phases.map((p) => ({
        ...p,
        state: "running" as const,
      })),
    };
    h.ports.repos.cycles.save(allRunning as any);

    const { status, json } = await post(h.app, "/api/hearing/launch", {
      scope: `cycle:${cycle.id}`,
    });
    expect(status).toBe(409);
    expect(json.error).toBe("HearingNoPendingPhase");
  });
});

// ── global-scope launch ───────────────────────────────────────────────────────

describe("POST /api/hearing/launch — global-scope", () => {
  test("returns {scope:'global'} without starting any run", async () => {
    const h = buildTestApp();

    const { status, json } = await post(h.app, "/api/hearing/launch", {
      scope: "global",
    });

    expect(status).toBe(200);
    expect(json.data.scope).toBe("global");
    // No runId or cycleId — global scope is the placeholder path
    expect("runId" in json.data).toBe(false);
    expect("cycleId" in json.data).toBe(false);
    // Orchestrator was NOT called (no run launched)
    const launches = h.orchestrator.ofMethod("launch");
    expect(launches).toHaveLength(0);
  });
});

// ── validation ────────────────────────────────────────────────────────────────

describe("POST /api/hearing/launch — validation", () => {
  test("invalid scope string → 400", async () => {
    const h = buildTestApp();
    const { status, json } = await post(h.app, "/api/hearing/launch", {
      scope: "bad-scope-value",
    });
    expect(status).toBe(400);
    expect(typeof json.error).toBe("string");
  });

  test("missing scope field → 400 MissingField:scope", async () => {
    const h = buildTestApp();
    const { status, json } = await post(h.app, "/api/hearing/launch", {});
    expect(status).toBe(400);
    expect(json.error).toBe("MissingField:scope");
  });

  test("unknown cycleId in cycle scope → 404 CycleNotFound", async () => {
    const h = buildTestApp();
    const { status, json } = await post(h.app, "/api/hearing/launch", {
      scope: "cycle:nonexistent-cycle-id",
    });
    expect(status).toBe(404);
    expect(json.error).toBe("CycleNotFound");
  });
});

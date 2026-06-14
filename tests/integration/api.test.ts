// Integration tests for the Phase-2 HTTP API. Drives the real (in-memory) DB via
// app.request(); system clock/ids and the orchestrator are deterministic doubles
// so every assertion is reproducible. Covers the 5 screens / 6 US surface:
// project bootstrap, cycle CRUD + execution, and the human-inbox answer flow.
import { describe, test, expect } from "bun:test";
import {
  buildTestApp,
  buildFailingApp,
  makeRepoDir,
} from "../support/harness";
import type { TestApp, FailingTestApp } from "../support/harness";
import { raiseQuestion } from "../../src/domain/question/question";
import type { QuestionPayload } from "../../src/domain/question/question";
import { buildReview } from "../../src/domain/review/review";
import {
  advanceRun,
  createCycle as domainCreateCycle,
  startPhase as domainStartPhase,
  version,
} from "../../src/domain/cycle/cycle";
import {
  ProjectId,
  QuestionId,
  RunId,
  CycleId,
  PhaseId,
  TaskId,
} from "../../src/domain/shared/ids";
import { Step } from "../../src/domain/shared/vocab";
import { instant } from "../../src/domain/shared/primitives";
import { unwrap } from "../../src/domain/shared/result";
import { cycleErrorStatus } from "../../src/app/services/cycle-service";
import { nextVersion } from "../../src/app/services/cycle-version";

const T0 = unwrap(instant("2026-01-01T00:00:00.000Z"));

// ── request helpers ──────────────────────────────────────────────
async function post(
  app: TestApp["app"],
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
  app: TestApp["app"],
  path: string,
): Promise<{ status: number; json: any }> {
  const res = await app.request(path);
  return { status: res.status, json: await res.json().catch(() => undefined) };
}

/** Create a project, return its id. repoPath defaults to a real temp dir. */
async function createProject(
  h: TestApp,
  repoPath: string = makeRepoDir(),
): Promise<string> {
  const { status, json } = await post(h.app, "/api/projects", { repoPath });
  expect(status).toBe(201);
  return json.data.id as string;
}

/** Create a cycle under a project, return its (JSON) body. */
async function createCycle(
  h: TestApp,
  projectId: string,
  version = "v1.0.0",
): Promise<any> {
  const { status, json } = await post(
    h.app,
    `/api/projects/${projectId}/cycles`,
    { title: "first cycle", version },
  );
  expect(status).toBe(201);
  return json.data;
}

/** Seed an OPEN question against a cycle's running run. */
function seedQuestion(
  h: TestApp,
  cycle: any,
  runId: string,
  payload: QuestionPayload,
  taskId?: string,
  idSuffix = "",
): string {
  const id = `q-seed-${runId}${idSuffix}`;
  const q = raiseQuestion({
    id: QuestionId(id),
    runId: RunId(runId),
    cycleId: CycleId(cycle.id),
    ...(taskId !== undefined ? { taskId: TaskId(taskId) } : {}),
    payload,
    createdAt: T0,
  });
  h.ports.repos.questions.save(q);
  return id;
}

// ── health ───────────────────────────────────────────────────────
describe("health", () => {
  test("returns ok envelope", async () => {
    const h = buildTestApp();
    const { status, json } = await get(h.app, "/api/health");
    expect(status).toBe(200);
    expect(json).toEqual({ success: true, data: { ok: true } });
  });
});

// ── projects ─────────────────────────────────────────────────────
describe("projects", () => {
  test("create then list round trip", async () => {
    const h = buildTestApp();
    const repoPath = makeRepoDir();
    const id = await createProject(h, repoPath);
    const { status, json } = await get(h.app, "/api/projects");
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(id);
    expect(json.data[0].repoPath).toBe(repoPath);
    // pipeline defaulted from CANONICAL_STEPS (v2: 12 steps, S2.5 retired)
    expect(json.data[0].pipelineDef).toHaveLength(12);
    // US-02: real dir skillRef + 平易ラベル from the single canonical source
    // (no fake `aidlc-S1`, no `label = "S1"` 死蔵).
    const s1 = json.data[0].pipelineDef[0];
    expect(s1.id).toBe("S1");
    expect(s1.skillRef).toBe("aidlc-s1-requirements");
    expect(s1.label).toBe("要件");
  });

  test("missing repoPath → 400", async () => {
    const h = buildTestApp();
    const { status, json } = await post(h.app, "/api/projects", {});
    expect(status).toBe(400);
    expect(json.success).toBe(false);
  });

  test("relative repoPath → 400 InvalidRepoPath", async () => {
    const h = buildTestApp();
    const { status, json } = await post(h.app, "/api/projects", {
      repoPath: "relative/dir",
    });
    expect(status).toBe(400);
    expect(json.error).toBe("InvalidRepoPath");
  });

  test("non-existent absolute repoPath → 400 InvalidRepoPath", async () => {
    const h = buildTestApp();
    const { status, json } = await post(h.app, "/api/projects", {
      repoPath: "/no/such/dir/aidlc-does-not-exist-xyz",
    });
    expect(status).toBe(400);
    expect(json.error).toBe("InvalidRepoPath");
  });

  test("present-but-blank modelName → 400 InvalidField:modelName", async () => {
    const h = buildTestApp();
    const { status, json } = await post(h.app, "/api/projects", {
      repoPath: makeRepoDir(),
      modelName: "   ",
    });
    expect(status).toBe(400);
    expect(json.error).toBe("InvalidField:modelName");
  });

  test("GET /api/projects/:projectId returns the project", async () => {
    const h = buildTestApp();
    const repoPath = makeRepoDir();
    const id = await createProject(h, repoPath);
    const { status, json } = await get(h.app, `/api/projects/${id}`);
    expect(status).toBe(200);
    expect(json.data.id).toBe(id);
    expect(json.data.repoPath).toBe(repoPath);
  });

  test("GET /api/projects/:projectId unknown → 404 ProjectNotFound", async () => {
    const h = buildTestApp();
    const { status, json } = await get(h.app, "/api/projects/ghost");
    expect(status).toBe(404);
    expect(json.error).toBe("ProjectNotFound");
  });
});

// ── cycles: create / list / get ──────────────────────────────────
describe("cycles create/list/get", () => {
  test("happy path creates cycle in planned state", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId, "v1.2.3");
    expect(cycle.version).toBe("v1.2.3");
    expect(cycle.state).toBe("planned");
    expect(cycle.phases).toHaveLength(12); // v2: 12 steps (S2.5 retired)
    const got = await get(h.app, `/api/cycles/${cycle.id}`);
    expect(got.status).toBe(200);
    expect(got.json.data.id).toBe(cycle.id);
    // US-02 / S6 snapshot: each phase pins its StepDef (label/skillRef) at creation,
    // and the snapshot survives the DB round trip (JSON.stringify(cycle)).
    const s1Phase = got.json.data.phases[0];
    expect(s1Phase.step).toBe("S1");
    expect(s1Phase.stepDef.skillRef).toBe("aidlc-s1-requirements");
    expect(s1Phase.stepDef.label).toBe("要件");
  });

  test("duplicate version → 409", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    await createCycle(h, projectId, "v1.0.0");
    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/cycles`,
      { title: "dup", version: "v1.0.0" },
    );
    expect(status).toBe(409);
    expect(json.error).toBe("DuplicateVersion");
  });

  test("duplicate version that RACES past the pre-check → still 409 (UNIQUE-mapped)", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    await createCycle(h, projectId, "v1.0.0");
    // Simulate the race: the findByProjectVersion pre-check misses (returns
    // undefined) so the flow reaches the insert, where UNIQUE(projectId,version)
    // fires. The service must map that to 409, not leak a 500.
    h.ports.repos.cycles.findByProjectVersion = () => undefined;
    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/cycles`,
      { title: "race", version: "v1.0.0" },
    );
    expect(status).toBe(409);
    expect(json.error).toBe("DuplicateVersion");
  });

  test("cycleErrorStatus maps PhaseNotFound → 404 (lookup failure)", () => {
    expect(cycleErrorStatus("PhaseNotFound").httpStatus).toBe(404);
    // Sanity: an illegal-command error still defaults to 400.
    expect(cycleErrorStatus("StepNotInPipeline").httpStatus).toBe(400);
  });

  test("invalid version → 400", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/cycles`,
      { title: "bad", version: "1.0" },
    );
    expect(status).toBe(400);
    expect(json.error).toBe("InvalidVersion");
  });

  test("create with NO version on a fresh project → 201 auto-assigns v0.0.1", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/cycles`,
      { title: "Human Inbox 縦ループ" },
    );
    expect(status).toBe(201);
    expect(json.data.version).toBe("v0.0.1");
    expect(json.data.title).toBe("Human Inbox 縦ループ");
  });

  test("second create with NO version → auto bumps the patch to v0.0.2", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const first = await post(h.app, `/api/projects/${projectId}/cycles`, {
      title: "first goal",
    });
    expect(first.json.data.version).toBe("v0.0.1");
    const second = await post(h.app, `/api/projects/${projectId}/cycles`, {
      title: "second goal",
    });
    expect(second.status).toBe(201);
    expect(second.json.data.version).toBe("v0.0.2");
  });

  test("blank version string is treated as omitted → auto-assigns", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/cycles`,
      { title: "goal", version: "   " },
    );
    // asOptionalString rejects a present-but-blank field before the service.
    expect(status).toBe(400);
    expect(json.error).toBe("InvalidField:version");
  });

  test("project not found → 404", async () => {
    const h = buildTestApp();
    const { status, json } = await post(h.app, `/api/projects/ghost/cycles`, {
      title: "x",
      version: "v1.0.0",
    });
    expect(status).toBe(404);
    expect(json.error).toBe("ProjectNotFound");
  });

  test("listCycles is scoped per project", async () => {
    const h = buildTestApp();
    const p1 = await createProject(h);
    const p2 = await createProject(h);
    await createCycle(h, p1, "v1.0.0");
    await createCycle(h, p1, "v2.0.0");
    await createCycle(h, p2, "v1.0.0");

    const l1 = await get(h.app, `/api/projects/${p1}/cycles`);
    const l2 = await get(h.app, `/api/projects/${p2}/cycles`);
    expect(l1.json.data).toHaveLength(2);
    expect(l2.json.data).toHaveLength(1);
  });

  test("getCycle not found → 404", async () => {
    const h = buildTestApp();
    const { status, json } = await get(h.app, "/api/cycles/ghost");
    expect(status).toBe(404);
    expect(json.error).toBe("CycleNotFound");
  });

  test("createCycle with a non-existent taskId → 404 AND cycle is NOT persisted (rollback)", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const before = (await get(h.app, `/api/projects/${projectId}/cycles`)).json
      .data.length as number;

    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/cycles`,
      { title: "with-tasks", version: "v9.9.9", taskIds: ["ghost-task"] },
    );
    expect(status).toBe(404);
    expect(json.error).toBe("TaskNotFound");

    // The cycle save (first write in the tx) was rolled back with the failure.
    const after = (await get(h.app, `/api/projects/${projectId}/cycles`)).json
      .data.length as number;
    expect(after).toBe(before);
  });
});

// ── nextVersion (pure auto-assign helper) ────────────────────────
describe("nextVersion", () => {
  test("empty → v0.0.1", () => {
    expect(nextVersion([])).toBe("v0.0.1");
  });

  test('["v0.0.1"] → v0.0.2', () => {
    expect(nextVersion(["v0.0.1"])).toBe("v0.0.2");
  });

  test('["v0.1.0","v0.0.9"] → v0.1.1 (semver-max, not lexical-max)', () => {
    expect(nextVersion(["v0.1.0", "v0.0.9"])).toBe("v0.1.1");
  });

  test("ignores non-vX.Y.Z entries; all-invalid → v0.0.1", () => {
    expect(nextVersion(["nope", "1.0", "v2"])).toBe("v0.0.1");
    expect(nextVersion(["v1.2.3", "garbage"])).toBe("v1.2.4");
  });
});

// ── startPhase ───────────────────────────────────────────────────
describe("startPhase", () => {
  test("success → phase running + launch recorded", async () => {
    const h = buildTestApp();
    const repoPath = makeRepoDir();
    const projectId = await createProject(h, repoPath);
    const cycle = await createCycle(h, projectId);
    const firstStep = cycle.phases[0]!.step;

    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/phases/${firstStep}/start`,
    );
    expect(status).toBe(200);
    const phase = json.data.phases.find((p: any) => p.step === firstStep);
    expect(phase.state).toBe("running");
    expect(phase.runs).toHaveLength(1);

    const launches = h.orchestrator.ofMethod("launch");
    expect(launches).toHaveLength(1);
    const args = launches[0]!.args;
    expect(args.cycleId).toBe(cycle.id);
    expect(args.phaseId).toBe(phase.id);
    expect(args.step).toBe(firstStep);
    expect(args.runId).toBe(phase.runs[0].id);
    expect(args.repoPath).toBe(repoPath);
  });

  test("starting a later phase before prev done → 409", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);
    const secondStep = cycle.phases[1]!.step;
    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/phases/${secondStep}/start`,
    );
    expect(status).toBe(409);
    expect(json.error).toBe("PrevPhaseNotDone");
  });

  test("bad step → 400", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);
    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/phases/ZZ/start`,
    );
    expect(status).toBe(400);
    expect(json.error).toBe("StepNotInPipeline");
  });

  test("dotted step segment (retired S2.5) decodes and is evaluated against the pipeline", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);
    // A step id with a dot must decode through the route (not be mangled). S2.5 is
    // retired from the v2 default pipeline, so the decoded id evaluates to
    // StepNotInPipeline (400) — which still proves the dotted segment decoded.
    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/phases/S2.5/start`,
    );
    expect(status).toBe(400);
    expect(json.error).toBe("StepNotInPipeline");
  });
});

describe("relaunchPhase (re-run a backtrack-rewound phase)", () => {
  test("success → fresh run launched on the rewound phase", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { cycle, runId } = await cycleWithRunningRun(h, projectId);
    const firstStep = cycle.phases[0]!.step as string;
    const review = buildReview({
      runId: RunId(runId),
      cycleId: CycleId(cycle.id),
      step: Step(firstStep),
      taskId: TaskId("task-1"),
      blocks: [{ type: "summary", title: "x", body: "y" }],
      producedAt: T0,
    });
    const qid = seedQuestion(
      h,
      cycle,
      runId,
      { kind: "visual_review", review },
      "task-1",
    );
    // Reject → backtrack to the SAME phase: it becomes rewound (running, run done).
    await post(h.app, `/api/questions/${qid}/answer`, {
      verdict: "reject",
      backtrackTo: firstStep,
      reason: "redo it",
    });

    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/phases/${firstStep}/relaunch`,
    );
    expect(status).toBe(200);
    const phase = json.data.phases.find((p: any) => p.step === firstStep);
    expect(phase.state).toBe("running");
    expect(phase.runs).toHaveLength(2); // old (done) + the fresh run
    const newRun = phase.runs[phase.runs.length - 1];
    expect(newRun.state).toBe("running");

    const launches = h.orchestrator.ofMethod("launch");
    const last = launches[launches.length - 1]!.args;
    expect(last.runId).toBe(newRun.id);
    expect(last.step as string).toBe(firstStep);
  });

  test("relaunch on a pending (non-rewound) phase → 409 PhaseNotRewound", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);
    const firstStep = cycle.phases[0]!.step as string;
    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/phases/${firstStep}/relaunch`,
    );
    expect(status).toBe(409);
    expect(json.error).toBe("PhaseNotRewound");
  });
});

// ── retryRun ─────────────────────────────────────────────────────
/** Drive a cycle to a failed run on its first phase, return {cycle, runId}. */
async function cycleWithFailedRun(
  h: TestApp,
  projectId: string,
): Promise<{ cycle: any; runId: string }> {
  const created = await createCycle(h, projectId);
  const firstStep = created.phases[0]!.step;
  const started = await post(
    h.app,
    `/api/cycles/${created.id}/phases/${firstStep}/start`,
  );
  const runId: string = started.json.data.phases.find(
    (p: any) => p.step === firstStep,
  ).runs[0].id;

  const cycle = h.ports.repos.cycles.findById(CycleId(created.id))!;
  const failed = unwrap(
    advanceRun(cycle, { runId: RunId(runId), to: "failed", at: T0 }),
  );
  h.ports.repos.cycles.save(failed);
  return { cycle: failed, runId };
}

describe("retryRun", () => {
  test("failed run → new attempt + retry recorded", async () => {
    const h = buildTestApp();
    const repoPath = makeRepoDir();
    const projectId = await createProject(h, repoPath);
    const { cycle, runId } = await cycleWithFailedRun(h, projectId);

    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/runs/${runId}/retry`,
    );
    expect(status).toBe(200);
    const phase = json.data.phases[0];
    expect(phase.runs).toHaveLength(2);
    expect(phase.runs[1].attempt).toBe(2);

    const retries = h.orchestrator.ofMethod("retry");
    expect(retries).toHaveLength(1);
    expect(retries[0]!.args.runId as string).toBe(runId);
    expect(retries[0]!.args.repoPath).toBe(repoPath);
    expect(retries[0]!.args.newRunId as string).toBe(phase.runs[1].id);
  });

  test("retrying a non-failed (running) run → 409", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const created = await createCycle(h, projectId);
    const firstStep = created.phases[0]!.step;
    const started = await post(
      h.app,
      `/api/cycles/${created.id}/phases/${firstStep}/start`,
    );
    const runId = started.json.data.phases.find(
      (p: any) => p.step === firstStep,
    ).runs[0].id;

    const { status, json } = await post(
      h.app,
      `/api/cycles/${created.id}/runs/${runId}/retry`,
    );
    expect(status).toBe(409);
    expect(json.error).toBe("RunNotFailedOrStalled");
  });
});

// ── orchestrator-failure compensation (Fix 4) ────────────────────
/** Create project + cycle on a failing-orchestrator app; return ids. */
async function failingProjectCycle(
  h: FailingTestApp,
): Promise<{ projectId: string; cycle: any }> {
  const pres = await post(h.app, "/api/projects", { repoPath: makeRepoDir() });
  expect(pres.status).toBe(201);
  const projectId = pres.json.data.id as string;
  const cres = await post(h.app, `/api/projects/${projectId}/cycles`, {
    title: "c",
    version: "v1.0.0",
  });
  expect(cres.status).toBe(201);
  return { projectId, cycle: cres.json.data };
}

describe("orchestrator failure compensation", () => {
  test("startPhase whose launch throws → 502 AND run is failed (not stuck running)", async () => {
    const h = buildFailingApp();
    const { cycle } = await failingProjectCycle(h);
    const firstStep = cycle.phases[0].step;

    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/phases/${firstStep}/start`,
    );
    expect(status).toBe(502);
    expect(json.error).toBe("OrchestratorLaunchFailed");

    // The persisted run was compensated to "failed", never left "running".
    const got = await get(h.app, `/api/cycles/${cycle.id}`);
    const run = got.json.data.phases.find((p: any) => p.step === firstStep)
      .runs[0];
    expect(run.state).toBe("failed");
    // ...AND it carries the REAL cause so the UI shows more than a generic
    // "Run が失敗しました。" — the orchestrator's thrown message is surfaced.
    expect(run.failureReason).toBe(
      "AI 実行の起動に失敗しました: launch failed (test)",
    );
  });

  test("retryRun whose retry throws → 502 AND new attempt compensated to failed", async () => {
    const h = buildFailingApp();
    const { cycle } = await failingProjectCycle(h);
    const firstStep = cycle.phases[0].step;

    // startPhase launch throws too (failing orchestrator), but the run is
    // compensated to "failed" — exactly the precondition retryRun needs.
    await post(h.app, `/api/cycles/${cycle.id}/phases/${firstStep}/start`);
    const afterStart = await get(h.app, `/api/cycles/${cycle.id}`);
    const failedRun = afterStart.json.data.phases
      .flatMap((p: any) => p.runs)
      .find((r: any) => r.state === "failed");
    expect(failedRun).toBeDefined();

    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/runs/${failedRun.id}/retry`,
    );
    expect(status).toBe(502);
    expect(json.error).toBe("OrchestratorRetryFailed");

    // The NEW attempt run was compensated to failed (no stuck running).
    const got = await get(h.app, `/api/cycles/${cycle.id}`);
    const runs = got.json.data.phases.flatMap((p: any) => p.runs);
    expect(runs.some((r: any) => r.state === "running")).toBe(false);
    expect(runs.filter((r: any) => r.state === "failed").length).toBe(2);
    // The retry-attempt run carries the retry-specific real cause.
    const retryRun = runs.find(
      (r: any) => (r.id as string) !== failedRun.id && r.state === "failed",
    );
    expect(retryRun.failureReason).toBe(
      "AI 実行のリトライに失敗しました: retry failed (test)",
    );
  });
});

// ── retryRun MaxAttemptExceeded (Fix 10) ─────────────────────────
describe("retryRun max attempts", () => {
  test("exhausting maxAttempt=1 → 409 MaxAttemptExceeded", async () => {
    const h = buildTestApp();
    // maxAttempt is a project default (3); override via a project with env=1 by
    // creating it directly through the repo so we can pin maxAttempt.
    const repoPath = makeRepoDir();
    const projectId = await createProject(h, repoPath);
    const project = h.ports.repos.projects.findById(
      ProjectId(projectId),
    )!;
    const capped = { ...project, env: { ...project.env, maxAttempt: 1 } };
    h.ports.repos.projects.save(capped);

    const { cycle, runId } = await cycleWithFailedRun(h, projectId);
    // attempt would become 2 > maxAttempt(1) → MaxAttemptExceeded.
    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/runs/${runId}/retry`,
    );
    expect(status).toBe(409);
    expect(json.error).toBe("MaxAttemptExceeded");
  });
});

// ── answerQuestion (core flow) ───────────────────────────────────
/** Bootstrap a cycle with a running run; return {cycle, runId}. */
async function cycleWithRunningRun(
  h: TestApp,
  projectId: string,
): Promise<{ cycle: any; runId: string }> {
  const created = await createCycle(h, projectId);
  const firstStep = created.phases[0].step;
  const started = await post(
    h.app,
    `/api/cycles/${created.id}/phases/${firstStep}/start`,
  );
  const cycle = started.json.data;
  const runId: string = cycle.phases.find(
    (p: any) => p.step === firstStep,
  ).runs[0].id;
  return { cycle, runId };
}

describe("answerQuestion", () => {
  test("question-kind answer → resumeRun, answered, fact persisted in one tx", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { cycle, runId } = await cycleWithRunningRun(h, projectId);
    const qid = seedQuestion(h, cycle, runId, {
      kind: "question",
      prompt: "which db?",
    });

    const { status, json } = await post(
      h.app,
      `/api/questions/${qid}/answer`,
      { verdict: "answer", body: "sqlite" },
    );
    expect(status).toBe(200);
    expect(json.data.question.state).toBe("answered");

    const inbox = await get(h.app, `/api/projects/${projectId}/inbox`);
    expect(inbox.json.data.find((q: any) => q.id === qid)).toBeUndefined();

    const facts = h.ports.repos.facts.listByCycle(CycleId(cycle.id));
    expect(facts).toHaveLength(1);
    expect(facts[0]!.questionId as string).toBe(qid);

    const resumes = h.orchestrator.ofMethod("resume");
    expect(resumes).toHaveLength(1);
    expect(resumes[0]!.args.runId as string).toBe(runId);
    expect(resumes[0]!.args.body).toBe("sqlite");
  });

  test("batch hearing — N open questions on one run → exactly ONE resume on the last answer (S2/S6 N問→N答→1 resume)", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { cycle, runId } = await cycleWithRunningRun(h, projectId);
    // Two `question` cards raised by the same run (a batch hearing).
    const q1 = seedQuestion(h, cycle, runId, { kind: "question", prompt: "Q1?" }, undefined, "-a");
    const q2 = seedQuestion(h, cycle, runId, { kind: "question", prompt: "Q2?" }, undefined, "-b");

    // Answering the FIRST (a sibling question is still open) must NOT resume yet —
    // otherwise the live session would be re-spawned once per answer.
    const r1 = await post(h.app, `/api/questions/${q1}/answer`, { verdict: "answer", body: "batch-block" });
    expect(r1.status).toBe(200);
    expect(r1.json.data.question.state).toBe("answered");
    expect(h.orchestrator.ofMethod("resume")).toHaveLength(0); // deferred.

    // Answering the LAST one (no open question siblings remain) → single resume.
    const r2 = await post(h.app, `/api/questions/${q2}/answer`, { verdict: "answer", body: "batch-block" });
    expect(r2.status).toBe(200);

    const resumes = h.orchestrator.ofMethod("resume");
    expect(resumes).toHaveLength(1);
    expect(resumes[0]!.args.runId as string).toBe(runId);
    expect(resumes[0]!.args.body).toBe("batch-block");

    // Both questions ended up answered (each persisted; only resume was deferred).
    const inbox = await get(h.app, `/api/projects/${projectId}/inbox`);
    expect(inbox.json.data.find((q: any) => q.id === q1)).toBeUndefined();
    expect(inbox.json.data.find((q: any) => q.id === q2)).toBeUndefined();
  });

  test("visual_review approve → run done + phase done (domain functions, not orchestrator.resume)", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { cycle, runId } = await cycleWithRunningRun(h, projectId);
    const review = buildReview({
      runId: RunId(runId),
      cycleId: CycleId(cycle.id),
      step: Step("S1"),
      taskId: TaskId("task-1"),
      blocks: [{ type: "summary", title: "done", body: "ok" }],
      producedAt: T0,
    });
    const qid = seedQuestion(
      h,
      cycle,
      runId,
      { kind: "visual_review", review },
      "task-1",
    );

    const { status, json } = await post(
      h.app,
      `/api/questions/${qid}/answer`,
      { verdict: "approve" },
    );
    expect(status).toBe(200);
    expect(json.data.question.state).toBe("answered");

    // approveTaskReview now uses domain functions directly (advanceRun +
    // approvePhase) instead of orchestrator.resume — so the run should be
    // "done" and the phase should be "done" (not "review") immediately after
    // the answer is processed. No orchestrator.resume call expected.
    const updated = h.ports.repos.cycles.findById(CycleId(cycle.id));
    const phase = updated!.phases.find((p) =>
      p.runs.some((r) => (r.id as string) === runId),
    );
    expect(phase).toBeDefined();
    const run = phase!.runs.find((r) => (r.id as string) === runId);
    expect(run!.state).toBe("done");
    expect(phase!.state).toBe("done");
  });

  test("approving the LAST phase completes the cycle (active → done)", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    // A single-phase cycle built directly, so approving that phase = ALL phases
    // done → completeCycle should fire and flip the cycle active → done.
    const built = unwrap(
      domainCreateCycle({
        id: CycleId("cyc-final"),
        projectId: ProjectId(projectId),
        version: unwrap(version("v9.9.9")),
        title: "final-phase cycle",
        taskIds: [],
        createdAt: T0,
        pipeline: [{ phaseId: PhaseId("cyc-final-p1"), step: Step("S1") }],
      }),
    );
    const runId = "run-final";
    const started = unwrap(
      domainStartPhase(built, {
        step: Step("S1"),
        runId: RunId(runId),
        startedAt: T0,
      }),
    );
    h.ports.repos.cycles.save(started);

    const review = buildReview({
      runId: RunId(runId),
      cycleId: CycleId("cyc-final"),
      step: Step("S1"),
      taskId: TaskId("task-1"),
      blocks: [{ type: "summary", title: "x", body: "y" }],
      producedAt: T0,
    });
    const qid = seedQuestion(
      h,
      { id: "cyc-final" },
      runId,
      { kind: "visual_review", review },
      "task-1",
    );

    const { status } = await post(h.app, `/api/questions/${qid}/answer`, {
      verdict: "approve",
    });
    expect(status).toBe(200);

    const done = h.ports.repos.cycles.findById(CycleId("cyc-final"))!;
    expect(done.state).toBe("done");
    expect(done.phases[0]!.state).toBe("done");
  });

  test("approving a NON-final phase leaves the cycle active", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    // Default pipeline has 8 phases; approving the first leaves 7 pending.
    const { cycle, runId } = await cycleWithRunningRun(h, projectId);
    const review = buildReview({
      runId: RunId(runId),
      cycleId: CycleId(cycle.id),
      step: Step("S1"),
      taskId: TaskId("task-1"),
      blocks: [{ type: "summary", title: "x", body: "y" }],
      producedAt: T0,
    });
    const qid = seedQuestion(
      h,
      cycle,
      runId,
      { kind: "visual_review", review },
      "task-1",
    );

    await post(h.app, `/api/questions/${qid}/answer`, { verdict: "approve" });

    const after = h.ports.repos.cycles.findById(CycleId(cycle.id))!;
    expect(after.state).toBe("active");
  });

  test("visual_review reject w/ backtrackTo+reason → cycle backtracked + persisted", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { cycle, runId } = await cycleWithRunningRun(h, projectId);
    const review = buildReview({
      runId: RunId(runId),
      cycleId: CycleId(cycle.id),
      step: Step("S1"),
      taskId: TaskId("task-1"),
      blocks: [{ type: "summary", title: "x", body: "y" }],
      producedAt: T0,
    });
    const firstStep = cycle.phases[0]!.step as string;
    const qid = seedQuestion(
      h,
      cycle,
      runId,
      { kind: "visual_review", review },
      "task-1",
    );

    const { status, json } = await post(
      h.app,
      `/api/questions/${qid}/answer`,
      { verdict: "reject", backtrackTo: firstStep, reason: "redo it" },
    );
    expect(status).toBe(200);
    expect(json.data.question.state).toBe("answered");

    const back = h.ports.repos.cycles.findById(CycleId(cycle.id))!;
    const targetPhase = back.phases.find(
      (p) => (p.step as string) === firstStep,
    )!;
    expect(targetPhase.state).toBe("running");
    // The reviewed run must be retired to "done" — NOT left "running". Backtracking
    // to the reviewed phase itself would otherwise leave a phantom running run, and
    // the cycle-detail UI would spin "生成中" forever (rewound needs run=done|none).
    const reviewedRun = targetPhase.runs.find((r) => r.id === runId)!;
    expect(reviewedRun.state).toBe("done");
    expect(h.ports.repos.facts.listByCycle(CycleId(cycle.id))).toHaveLength(1);
  });

  test("answering a closed (already answered) question → 409", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { cycle, runId } = await cycleWithRunningRun(h, projectId);
    const qid = seedQuestion(h, cycle, runId, {
      kind: "question",
      prompt: "p",
    });
    await post(h.app, `/api/questions/${qid}/answer`, { verdict: "answer" });
    const { status, json } = await post(
      h.app,
      `/api/questions/${qid}/answer`,
      { verdict: "answer" },
    );
    expect(status).toBe(409);
    expect(json.error).toBe("QuestionClosed");
  });

  test("answering an unknown question → 404", async () => {
    const h = buildTestApp();
    const { status, json } = await post(h.app, `/api/questions/ghost/answer`, {
      verdict: "answer",
    });
    expect(status).toBe(404);
    expect(json.error).toBe("QuestionNotFound");
  });

  test("invalid verdict for kind → 400 InvalidVerdict", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { cycle, runId } = await cycleWithRunningRun(h, projectId);
    const qid = seedQuestion(h, cycle, runId, {
      kind: "question",
      prompt: "p",
    });
    // 'approve' is not allowed for a 'question' kind (only 'answer')
    const { status, json } = await post(
      h.app,
      `/api/questions/${qid}/answer`,
      { verdict: "approve" },
    );
    expect(status).toBe(400);
    expect(json.error).toBe("InvalidVerdict");
  });

  test("stall_retry rejected → cancelRun dispatched (orchestrator.cancel called)", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { cycle, runId } = await cycleWithRunningRun(h, projectId);
    const qid = seedQuestion(h, cycle, runId, {
      kind: "stall_retry",
      runId: RunId(runId),
      stalledAt: T0,
    });

    const { status } = await post(h.app, `/api/questions/${qid}/answer`, {
      verdict: "reject",
      reason: "give up this attempt",
    });
    expect(status).toBe(200);

    const cancels = h.orchestrator.ofMethod("cancel");
    expect(cancels).toHaveLength(1);
    expect(cancels[0]!.args.runId as string).toBe(runId);
  });

  test("answer persistence is atomic — fact-save throw rolls back the question too", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { cycle, runId } = await cycleWithRunningRun(h, projectId);
    const qid = seedQuestion(h, cycle, runId, {
      kind: "question",
      prompt: "p",
    });

    // Force the fact save (second write in the tx) to throw → whole tx rolls back.
    const realSave = h.ports.repos.facts.save.bind(h.ports.repos.facts);
    h.ports.repos.facts.save = () => {
      throw new Error("boom (test): fact save failed");
    };

    const { status } = await post(h.app, `/api/questions/${qid}/answer`, {
      verdict: "answer",
    });
    expect(status).toBe(500);

    h.ports.repos.facts.save = realSave;

    // Neither side persisted: question still open, no fact for the cycle.
    const reFetch = await get(h.app, `/api/questions/${qid}`);
    expect(reFetch.json.data.state).toBe("open");
    expect(h.ports.repos.facts.listByCycle(CycleId(cycle.id))).toHaveLength(0);
  });

  test("cycle-inbox surfaces the open visual_review card after answering the question (SCR-02 human-waiting)", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { cycle, runId } = await cycleWithRunningRun(h, projectId);

    // The run launched and the AI asked a question → cycle-inbox shows it open.
    const qid = seedQuestion(h, cycle, runId, {
      kind: "question",
      prompt: "scope?",
    });
    const waiting = await get(h.app, `/api/cycles/${cycle.id}/inbox`);
    expect(waiting.status).toBe(200);
    expect(waiting.json.data).toHaveLength(1);
    expect(waiting.json.data[0].id).toBe(qid);
    expect(waiting.json.data[0].state).toBe("open");

    // Answer it → resume drives the scripted-style follow-up. Here we model the
    // post-answer visual_review by seeding one, then assert the cycle-inbox now
    // returns the review card (and not the answered question).
    await post(h.app, `/api/questions/${qid}/answer`, {
      verdict: "answer",
      body: "the scope is fine",
    });
    const review = buildReview({
      runId: RunId(runId),
      cycleId: CycleId(cycle.id),
      step: Step("S1"),
      taskId: TaskId("task-1"),
      blocks: [{ type: "summary", title: "done", body: "ok" }],
      producedAt: T0,
    });
    seedQuestion(
      h,
      cycle,
      runId,
      { kind: "visual_review", review },
      "task-1",
      "-review",
    );

    const afterAnswer = await get(h.app, `/api/cycles/${cycle.id}/inbox`);
    expect(afterAnswer.status).toBe(200);
    expect(afterAnswer.json.data).toHaveLength(1);
    expect(afterAnswer.json.data[0].kind).toBe("visual_review");
    expect(afterAnswer.json.data[0].state).toBe("open");
    // The answered question is no longer surfaced.
    expect(afterAnswer.json.data.some((q: any) => q.id === qid)).toBe(false);
  });

  test("cycle-inbox is empty for a cycle with no open questions", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { cycle } = await cycleWithRunningRun(h, projectId);
    const { status, json } = await get(h.app, `/api/cycles/${cycle.id}/inbox`);
    expect(status).toBe(200);
    expect(json.data).toHaveLength(0);
  });

  test("inbox is multi-tenant — one project's questions never leak into another's", async () => {
    const h = buildTestApp();
    const p1 = await createProject(h);
    const p2 = await createProject(h);
    const c1 = await cycleWithRunningRun(h, p1);
    seedQuestion(h, c1.cycle, c1.runId, { kind: "question", prompt: "p1?" });

    const inbox1 = await get(h.app, `/api/projects/${p1}/inbox`);
    const inbox2 = await get(h.app, `/api/projects/${p2}/inbox`);
    expect(inbox1.json.data).toHaveLength(1);
    expect(inbox2.json.data).toHaveLength(0);
  });
});

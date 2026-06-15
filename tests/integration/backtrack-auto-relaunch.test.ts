// Integration tests for auto-relaunch after backtrack (US-13 UX).
// When a visual_review is answered with verdict:"reject" + backtrackTo, the
// inbox-service commits the cycle rollback and then automatically relaunches
// the rewound phase — without requiring the human to press "relaunch" manually.
//
// Coverage:
//   #1 Happy path: backtrack answer → new running run launched (no /relaunch call)
//   #2 Launch args: the auto-launched run carries correct step/cycleId/repoPath
//   #3 Failure compensation: if orchestrator.launch fails after backtrack, run → stalled
//   #4 Existing test compat: non-backtrack answers (approve) are unaffected
import { describe, test, expect } from "bun:test";
import {
  buildTestApp,
  makeRepoDir,
} from "../support/harness";
import { FailingOrchestrator } from "../support/recording-orchestrator";
import type { TestApp } from "../support/harness";
import { raiseQuestion } from "../../src/domain/question/question";
import type { QuestionPayload } from "../../src/domain/question/question";
import { buildReview } from "../../src/domain/review/review";
import { QuestionId, RunId, CycleId, TaskId } from "../../src/domain/shared/ids";
import { Step } from "../../src/domain/shared/vocab";
import { instant } from "../../src/domain/shared/primitives";
import { unwrap } from "../../src/domain/shared/result";

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

/** Create a project, return its id. */
async function createProject(h: TestApp, repoPath = makeRepoDir()): Promise<string> {
  const { status, json } = await post(h.app, "/api/projects", { repoPath });
  expect(status).toBe(201);
  return json.data.id as string;
}

/** Create a cycle under a project and start its first phase, return {cycle, runId, firstStep}. */
async function cycleWithRunningRun(
  h: TestApp,
  projectId: string,
): Promise<{ cycle: any; runId: string; firstStep: string }> {
  const { json: createJson } = await post(h.app, `/api/projects/${projectId}/cycles`, {
    title: "auto-relaunch test cycle",
    version: "v1.0.0",
  });
  expect(createJson.success).toBe(true);
  const cycle = createJson.data;
  const firstStep = cycle.phases[0].step as string;

  const { json: startJson } = await post(
    h.app,
    `/api/cycles/${cycle.id}/phases/${firstStep}/start`,
  );
  expect(startJson.success).toBe(true);
  const startedCycle = startJson.data;
  const runId: string = startedCycle.phases.find(
    (p: any) => p.step === firstStep,
  ).runs[0].id;

  return { cycle: startedCycle, runId, firstStep };
}

/** Seed a visual_review question against a running run and return its id. */
function seedVisualReview(
  h: TestApp,
  cycleId: string,
  runId: string,
  firstStep: string,
): string {
  const review = buildReview({
    runId: RunId(runId),
    cycleId: CycleId(cycleId),
    step: Step(firstStep),
    taskId: TaskId("task-r1"),
    blocks: [{ type: "summary", title: "screenshot review", body: "review body" }],
    producedAt: T0,
  });
  const qid = `q-vr-${runId}`;
  const payload: QuestionPayload = { kind: "visual_review", review };
  const q = raiseQuestion({
    id: QuestionId(qid),
    runId: RunId(runId),
    cycleId: CycleId(cycleId),
    taskId: TaskId("task-r1"),
    payload,
    createdAt: T0,
  });
  h.ports.repos.questions.save(q);
  return qid;
}

describe("auto-relaunch after backtrack (US-13 UX)", () => {
  test("#1 happy path: backtrack answer automatically launches the rewound phase", async () => {
    const repoPath = makeRepoDir();
    const h = buildTestApp();
    const projectId = await createProject(h, repoPath);
    const { cycle, runId, firstStep } = await cycleWithRunningRun(h, projectId);
    const qid = seedVisualReview(h, cycle.id, runId, firstStep);

    const launchesBefore = h.orchestrator.ofMethod("launch").length;

    // Answer visual_review with reject + backtrackTo — no manual /relaunch call.
    const { status, json } = await post(
      h.app,
      `/api/questions/${qid}/answer`,
      { verdict: "reject", backtrackTo: firstStep, reason: "output not satisfactory" },
    );
    expect(status).toBe(200);
    expect(json.data.question.state).toBe("answered");

    // The phase must have a NEW running run (attempt 2) without any manual /relaunch.
    const updatedCycle = h.ports.repos.cycles.findById(CycleId(cycle.id))!;
    const phase = updatedCycle.phases.find((p) => (p.step as string) === firstStep)!;
    expect(phase.state).toBe("running");
    // Two runs: attempt 1 (done) + attempt 2 (running, auto-launched).
    expect(phase.runs).toHaveLength(2);
    const newRun = phase.runs.find((r) => r.attempt === 2)!;
    expect(newRun).toBeDefined();
    expect(newRun.state).toBe("running");

    // A new launch was dispatched to the orchestrator.
    const launches = h.orchestrator.ofMethod("launch");
    expect(launches.length).toBeGreaterThan(launchesBefore);
    const autoLaunch = launches[launches.length - 1]!.args;
    expect(autoLaunch.runId).toBe(newRun.id);
    expect(autoLaunch.step as string).toBe(firstStep);
    expect(autoLaunch.cycleId as string).toBe(cycle.id);
  });

  test("#2 launch args: auto-relaunch carries correct repoPath and cycleId", async () => {
    const repoPath = makeRepoDir();
    const h = buildTestApp();
    const projectId = await createProject(h, repoPath);
    const { cycle, runId, firstStep } = await cycleWithRunningRun(h, projectId);
    const qid = seedVisualReview(h, cycle.id, runId, firstStep);

    await post(
      h.app,
      `/api/questions/${qid}/answer`,
      { verdict: "reject", backtrackTo: firstStep, reason: "re-do" },
    );

    const launches = h.orchestrator.ofMethod("launch");
    const autoLaunch = launches[launches.length - 1]!.args;
    expect(autoLaunch.repoPath).toBe(repoPath);
    expect(autoLaunch.cycleId as string).toBe(cycle.id);
    expect(autoLaunch.step as string).toBe(firstStep);
  });

  test("#3 failure compensation: if orchestrator.launch fails after backtrack, answer still returns 200 and new run is compensated to failed (retriable via /retry)", async () => {
    // Build a normal app to get a running run, then swap the orchestrator to a
    // failing one BEFORE the backtrack answer so only the auto-relaunch fails.
    // The initial startPhase must succeed (RecordingOrchestrator) so we have a
    // real running run; the auto-relaunch call uses FailingOrchestrator.
    const repoPath = makeRepoDir();
    const h = buildTestApp();
    const projectId = await createProject(h, repoPath);
    const { cycle, runId, firstStep } = await cycleWithRunningRun(h, projectId);

    // Swap orchestrator after startPhase so the relaunch call fails.
    // Casting to `any` for test-only mutation of a readonly property.
    (h.ports as any).orchestrator = new FailingOrchestrator();

    const qid = seedVisualReview(h, cycle.id, runId, firstStep);

    // Even though auto-relaunch throws internally, the answer itself must succeed
    // (the backtrack is committed) — no 502 leaks to the caller.
    const { status, json } = await post(
      h.app,
      `/api/questions/${qid}/answer`,
      { verdict: "reject", backtrackTo: firstStep, reason: "failure test" },
    );
    // Key invariant: the HTTP response is 200 (the backtrack succeeded), not 502.
    expect(status).toBe(200);
    expect(json.data.question.state).toBe("answered");

    // The cycle rollback is committed regardless of the relaunch failure.
    const updatedCycle = h.ports.repos.cycles.findById(CycleId(cycle.id))!;
    const phase = updatedCycle.phases.find((p) => (p.step as string) === firstStep)!;

    // CycleService.persistThenLaunch compensates a launch failure to "failed"
    // (mirroring startPhase behavior — same compensation path). "failed" is
    // retriable via /retry, and the human can also use the manual /relaunch button.
    const newestRun = phase.runs.slice().sort((a, b) => b.attempt - a.attempt)[0]!;
    expect(newestRun.state).toBe("failed");
    // The original reviewed run (attempt 1) is still "done".
    const originalRun = phase.runs.find((r) => r.id === runId)!;
    expect(originalRun.state).toBe("done");
  });

  test("#4 non-backtrack answer (approve visual_review) is unaffected", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const { cycle, runId, firstStep } = await cycleWithRunningRun(h, projectId);
    const qid = seedVisualReview(h, cycle.id, runId, firstStep);

    const launchesBefore = h.orchestrator.ofMethod("launch").length;

    await post(
      h.app,
      `/api/questions/${qid}/answer`,
      { verdict: "approve" },
    );

    // Approve must NOT trigger a backtrack RELAUNCH of the step (F-4 is backtrack-only;
    // approve finalizes via domain funcs). It MAY launch the US-08 reconstruction run
    // when the approved step is S1 確定 — that is a separate, expected launch carrying
    // hearingScope:"reconstruction", which this test allows.
    const newLaunches = h.orchestrator.ofMethod("launch").slice(launchesBefore);
    const nonReconLaunches = newLaunches.filter(
      (c) => c.args.hearingScope !== "reconstruction",
    );
    expect(nonReconLaunches).toHaveLength(0);

    // Phase should be done (approved).
    const updatedCycle = h.ports.repos.cycles.findById(CycleId(cycle.id))!;
    const phase = updatedCycle.phases.find((p) => (p.step as string) === firstStep)!;
    expect(phase.state).toBe("done");
  });
});

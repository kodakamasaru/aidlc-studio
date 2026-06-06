// Full vertical-loop integration tests (S7 v0 DoD). Drives the Human Inbox loop
// end to end over HTTP against a real in-memory DB with the deterministic
// ScriptedOrchestrator → EventApplier sink: createProject → createCycle → start
// phase → answer question → review → approve → run done. Plus the stall→retry
// branch. Everything is deterministic (FixedClock + SeqIdGen), so assertions are
// reproducible run to run.
import { describe, test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { buildLoopTestApp, makeRepoDir } from "../support/harness";
import type { LoopTestApp } from "../support/harness";
import { openDb } from "../../src/infra/db/open";
import { buildStore } from "../../src/infra/db/store";
import { FixedClock, SeqIdGen } from "../../src/infra/sys/fakes";
import { EventApplier } from "../../src/app/services/event-applier";
import { noopNotify } from "../support/recording-orchestrator";
import type { RunContext } from "../../src/app/ports/orchestrator";
import { docPath } from "../../src/domain/external-memory/external-memory";
import { unwrap } from "../../src/domain/shared/result";
import {
  ProjectId,
  CycleId,
  PhaseId,
  RunId,
  QuestionId,
} from "../../src/domain/shared/ids";
import { Step } from "../../src/domain/shared/vocab";
import { raiseQuestion } from "../../src/domain/question/question";
import { instant } from "../../src/domain/shared/primitives";
import { buildCycle } from "./builders";

const T0 = unwrap(instant("2026-01-01T00:00:00.000Z"));

async function post(
  app: LoopTestApp["app"],
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
  app: LoopTestApp["app"],
  path: string,
): Promise<{ status: number; json: any }> {
  const res = await app.request(path);
  return { status: res.status, json: await res.json().catch(() => undefined) };
}

async function createProject(h: LoopTestApp): Promise<string> {
  const { status, json } = await post(h.app, "/api/projects", {
    repoPath: makeRepoDir(),
  });
  expect(status).toBe(201);
  return json.data.id as string;
}

async function createCycle(h: LoopTestApp, projectId: string): Promise<any> {
  const { status, json } = await post(
    h.app,
    `/api/projects/${projectId}/cycles`,
    { title: "loop cycle", version: "v1.0.0" },
  );
  expect(status).toBe(201);
  return json.data;
}

/** Collect every run state across a cycle's phases. */
function runStates(cycle: any): string[] {
  return cycle.phases.flatMap((p: any) => p.runs.map((r: any) => r.state));
}

describe("full loop — happy path", () => {
  test("project → cycle → start → answer → review → approve → run done", async () => {
    const h = buildLoopTestApp("happy");
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);

    // Start the first phase (S1). Scripted launch raises one "question".
    const startRes = await post(
      h.app,
      `/api/cycles/${cycle.id}/phases/S1/start`,
    );
    expect(startRes.status).toBe(200);

    // Inbox shows exactly one OPEN question of kind "question".
    const inbox1 = await get(h.app, `/api/projects/${projectId}/inbox`);
    expect(inbox1.status).toBe(200);
    expect(inbox1.json.data).toHaveLength(1);
    const question = inbox1.json.data[0];
    expect(question.kind).toBe("question");
    expect(question.state).toBe("open");

    // Answer it. Persists a Fact AND (via resume → ResultEmitted) a Review +
    // a visual_review question now visible in the inbox.
    const answerRes = await post(
      h.app,
      `/api/questions/${question.id}/answer`,
      { verdict: "answer", body: "scope confirmed" },
    );
    expect(answerRes.status).toBe(200);
    expect(answerRes.json.data.fact).toBeDefined();
    expect(answerRes.json.data.fact.id).toBeDefined();
    expect(answerRes.json.data.question.state).toBe("answered");

    // The visual_review question is now the only open one.
    const inbox2 = await get(h.app, `/api/projects/${projectId}/inbox`);
    expect(inbox2.json.data).toHaveLength(1);
    const reviewQ = inbox2.json.data[0];
    expect(reviewQ.kind).toBe("visual_review");

    // Its payload carries the Review with the 4 MVP block types.
    const reviewQGet = await get(h.app, `/api/questions/${reviewQ.id}`);
    expect(reviewQGet.status).toBe(200);
    expect(reviewQGet.json.data.payload.kind).toBe("visual_review");
    const blocks = reviewQGet.json.data.payload.review.blocks;
    expect(blocks).toHaveLength(4);
    expect(blocks.map((b: any) => b.type)).toEqual([
      "summary",
      "ac-map",
      "mermaid",
      "screenshot",
    ]);

    // Approve the review → resume → RunStateChanged done.
    const approveRes = await post(
      h.app,
      `/api/questions/${reviewQ.id}/answer`,
      { verdict: "approve" },
    );
    expect(approveRes.status).toBe(200);

    // The run is now "done" in the cycle.
    const cycleGet = await get(h.app, `/api/cycles/${cycle.id}`);
    expect(cycleGet.status).toBe(200);
    expect(runStates(cycleGet.json.data)).toContain("done");

    // Inbox is now empty (both questions answered).
    const inbox3 = await get(h.app, `/api/projects/${projectId}/inbox`);
    expect(inbox3.json.data).toHaveLength(0);
  });

  test("answer is atomic — fact and answered question both persist together", async () => {
    const h = buildLoopTestApp("happy");
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);
    await post(h.app, `/api/cycles/${cycle.id}/phases/S1/start`);

    const inbox = await get(h.app, `/api/projects/${projectId}/inbox`);
    const question = inbox.json.data[0];

    const answerRes = await post(
      h.app,
      `/api/questions/${question.id}/answer`,
      { verdict: "answer", body: "ok" },
    );
    expect(answerRes.status).toBe(200);

    // The answered question is no longer open, AND a fact exists for it: never
    // one without the other.
    const reFetch = await get(h.app, `/api/questions/${question.id}`);
    expect(reFetch.json.data.state).toBe("answered");
    expect(answerRes.json.data.fact.questionId).toBe(question.id);
  });
});

describe("full loop — stall → retry", () => {
  test("stalled run can be retried into a fresh attempt with a new question", async () => {
    const h = buildLoopTestApp("stall-first");
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);

    // Start: scripted stall-first launch emits RunStateChanged stalled.
    const startRes = await post(
      h.app,
      `/api/cycles/${cycle.id}/phases/S1/start`,
    );
    expect(startRes.status).toBe(200);

    // The run is stalled.
    const cycleGet1 = await get(h.app, `/api/cycles/${cycle.id}`);
    const states1 = runStates(cycleGet1.json.data);
    expect(states1).toContain("stalled");

    // Locate the stalled run id to retry it.
    const stalledRun = cycleGet1.json.data.phases
      .flatMap((p: any) => p.runs)
      .find((r: any) => r.state === "stalled");
    expect(stalledRun).toBeDefined();

    // Retry → a new attempt run exists.
    const retryRes = await post(
      h.app,
      `/api/cycles/${cycle.id}/runs/${stalledRun.id}/retry`,
    );
    expect(retryRes.status).toBe(200);

    const cycleGet2 = await get(h.app, `/api/cycles/${cycle.id}`);
    const runs = cycleGet2.json.data.phases.flatMap((p: any) => p.runs);
    // Original stalled run + the new attempt.
    expect(runs.length).toBeGreaterThanOrEqual(2);
    const newRun = runs.find((r: any) => r.attempt === 2);
    expect(newRun).toBeDefined();
    expect(newRun.state).toBe("running");

    // A fresh open "question" now appears in the inbox (scripted retry emitted it).
    const inbox = await get(h.app, `/api/projects/${projectId}/inbox`);
    expect(inbox.json.data).toHaveLength(1);
    expect(inbox.json.data[0].kind).toBe("question");
    expect(inbox.json.data[0].runId).toBe(newRun.id);
  });

  test("stall_retry rejected → cancelRun → scripted run goes failed (from running)", async () => {
    // Use the happy scenario so the launched run is "running" (cancel→failed is
    // a legal advanceRun transition only from running). Seed a stall_retry
    // question against that running run and reject it → cancelRun.
    const h = buildLoopTestApp("happy");
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);
    await post(h.app, `/api/cycles/${cycle.id}/phases/S1/start`);

    const cycleGet = await get(h.app, `/api/cycles/${cycle.id}`);
    const runningRun = cycleGet.json.data.phases
      .flatMap((p: any) => p.runs)
      .find((r: any) => r.state === "running");
    expect(runningRun).toBeDefined();

    const q = raiseQuestion({
      id: QuestionId("q-cancel"),
      runId: RunId(runningRun.id),
      cycleId: CycleId(cycle.id),
      payload: {
        kind: "stall_retry",
        runId: RunId(runningRun.id),
        stalledAt: T0,
      },
      createdAt: T0,
    });
    h.ports.repos.questions.save(q);

    const ans = await post(h.app, `/api/questions/q-cancel/answer`, {
      verdict: "reject",
      reason: "abandon this run",
    });
    expect(ans.status).toBe(200);

    // Scripted cancel emitted RunStateChanged failed → applier advanced the run.
    const after = await get(h.app, `/api/cycles/${cycle.id}`);
    const run = after.json.data.phases
      .flatMap((p: any) => p.runs)
      .find((r: any) => r.id === runningRun.id);
    expect(run.state).toBe("failed");
  });
});

// ── EventApplier branches (direct) ───────────────────────────────
// Exercise the persistence branches not covered by the full-loop happy/stall
// paths by calling applier.apply() directly with synthetic emissions.
describe("EventApplier branches", () => {
  function buildApplier() {
    const db: Database = openDb(":memory:");
    const store = buildStore(db);
    const applier = new EventApplier({
      clock: new FixedClock(),
      ids: new SeqIdGen(),
      uow: store.uow,
      repos: store.repos,
      notify: noopNotify,
    });
    return { db, store, applier };
  }

  const ctxFor = (projectId: string, cycleId: string, runId: string): RunContext => ({
    runId: RunId(runId),
    projectId: ProjectId(projectId),
    cycleId: CycleId(cycleId),
    phaseId: PhaseId(`${cycleId}-p1`),
    step: Step("S6"),
  });

  test("ArtifactEmitted persists an indexed artifact for the cycle", async () => {
    const { store, applier } = buildApplier();
    const ctx = ctxFor("proj", "cyc", "run");
    await applier.apply({
      ctx,
      event: {
        type: "ArtifactEmitted",
        runId: RunId("run"),
        path: unwrap(docPath("aidlc-docs/s6/code.ts")),
        kind: "code",
      },
    });
    const arts = store.repos.artifacts.listByCycle(CycleId("cyc"));
    expect(arts).toHaveLength(1);
    expect(arts[0]!.kind).toBe("code");
  });

  test("WikiUpdated persists a wiki doc for the project+section", async () => {
    const { store, applier } = buildApplier();
    const ctx = ctxFor("proj", "cyc", "run");
    await applier.apply({
      ctx,
      event: { type: "WikiUpdated", runId: RunId("run"), section: "ubiquitous" },
    });
    const doc = store.repos.wiki.find(ProjectId("proj"), "ubiquitous");
    expect(doc).toBeDefined();
    expect(doc!.section).toBe("ubiquitous");
  });

  test("duplicate ResultEmitted for the same run does NOT stack a second open visual_review card", async () => {
    const { store, applier } = buildApplier();
    const ctx = ctxFor("proj", "cyc", "run");
    const emission = {
      ctx,
      event: {
        type: "ResultEmitted" as const,
        runId: RunId("run"),
        blocks: [{ type: "summary" as const, title: "S6", body: "out" }],
      },
    };

    // First emission raises the card; a redelivered/retried second emission for
    // the same (runId, taskId) must be deduped (only one OPEN card).
    await applier.apply(emission);
    await applier.apply(emission);

    const cards = store.repos.questions
      .listByRun(RunId("run"))
      .filter((q) => q.kind === "visual_review" && q.state === "open");
    expect(cards).toHaveLength(1);
  });

  test("RunStateChanged to:'running' is a no-op (cycle unchanged)", async () => {
    const { store, applier } = buildApplier();
    // Seed a cycle with a running run; "running" emissions must not mutate it.
    const cycle = buildCycle("proj", "cyc", "v1.0.0");
    store.repos.cycles.save(cycle);
    const before = JSON.stringify(store.repos.cycles.findById(CycleId("cyc")));

    await applier.apply({
      ctx: ctxFor("proj", "cyc", "cyc-r1"),
      event: { type: "RunStateChanged", runId: RunId("cyc-r1"), to: "running" },
    });

    const after = JSON.stringify(store.repos.cycles.findById(CycleId("cyc")));
    expect(after).toBe(before);
  });
});

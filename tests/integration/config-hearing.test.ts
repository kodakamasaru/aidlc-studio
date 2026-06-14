/**
 * BU-3 end-to-end integration test: config-hearing scripted scenario.
 *
 * Drives the full HTTP vertical loop:
 *   1. createProject + createCycle
 *   2. Start phase S1 → ScriptedOrchestrator emits 2 config QuestionRaised
 *      events with target:{step, field, scope=cycle:{cycleId}}
 *   3. Inbox shows 2 open "question" cards with .target set
 *   4. Answer each config question one by one
 *   5. After the LAST answer, batch gate fires resume → scripted emits ResultEmitted
 *   6. Assert that cycle phase S1 stepDef.contracts now carries the written values
 *   7. Regression: a normal (no-target) question from the happy scenario is unaffected
 */
import { describe, test, expect } from "bun:test";
import { buildLoopTestApp, makeRepoDir } from "../support/harness";
import type { LoopTestApp } from "../support/harness";

// ── request helpers ───────────────────────────────────────────────────────────

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
    { title: "config-hearing cycle", version: "v1.0.0" },
  );
  expect(status).toBe(201);
  return json.data;
}

/** Find a phase by step id from the cycle GET response payload. */
function findPhase(cycleData: any, step: string): any {
  return cycleData.phases.find((p: any) => p.step === step);
}

// ── config-hearing scenario ───────────────────────────────────────────────────

describe("BU-3 config-hearing — end-to-end", () => {
  test("start S1 → inbox shows 2 open config questions with targets", async () => {
    const h = buildLoopTestApp("config-hearing");
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);

    const startRes = await post(h.app, `/api/cycles/${cycle.id}/phases/S1/start`);
    expect(startRes.status).toBe(200);

    const inbox = await get(h.app, `/api/projects/${projectId}/inbox`);
    expect(inbox.status).toBe(200);
    const questions: any[] = inbox.json.data;
    expect(questions).toHaveLength(2);
    expect(questions.every((q: any) => q.kind === "question")).toBe(true);
    expect(questions.every((q: any) => q.state === "open")).toBe(true);

    // Both questions carry a target pointing to S1.
    const targets = questions.map((q: any) => q.target).filter(Boolean);
    expect(targets).toHaveLength(2);
    expect(targets.every((t: any) => t.step === "S1")).toBe(true);
    const fields = targets.map((t: any) => t.field).sort();
    expect(fields).toEqual(["humanGate.mode", "output.profileKind"]);
  });

  test("answering both config questions writes contracts to cycle phase snapshot", async () => {
    const h = buildLoopTestApp("config-hearing");
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);

    await post(h.app, `/api/cycles/${cycle.id}/phases/S1/start`);

    const inbox = await get(h.app, `/api/projects/${projectId}/inbox`);
    const questions: any[] = inbox.json.data;
    expect(questions).toHaveLength(2);

    const q1 = questions.find((q: any) => q.target?.field === "output.profileKind");
    const q2 = questions.find((q: any) => q.target?.field === "humanGate.mode");
    expect(q1).toBeDefined();
    expect(q2).toBeDefined();

    // Answer question 1: output.profileKind = "briefing" (plain body → note path).
    const ans1 = await post(h.app, `/api/questions/${q1.id}/answer`, {
      verdict: "answer",
      body: "briefing",
    });
    expect(ans1.status).toBe(200);
    expect(ans1.json.data.question.state).toBe("answered");

    // The second question is still open (batch gate defers resume).
    const inbox2 = await get(h.app, `/api/projects/${projectId}/inbox`);
    const remaining = inbox2.json.data.filter((q: any) => q.state === "open");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(q2.id);

    // Answer question 2: humanGate.mode = "visual_review".
    const ans2 = await post(h.app, `/api/questions/${q2.id}/answer`, {
      verdict: "answer",
      body: "visual_review",
    });
    expect(ans2.status).toBe(200);
    expect(ans2.json.data.question.state).toBe("answered");

    // GET cycle — S1 phase stepDef.contracts must carry both written values.
    const cycleGet = await get(h.app, `/api/cycles/${cycle.id}`);
    expect(cycleGet.status).toBe(200);
    const s1Phase = findPhase(cycleGet.json.data, "S1");
    expect(s1Phase).toBeDefined();
    expect(s1Phase.stepDef).toBeDefined();
    expect(s1Phase.stepDef.contracts).toBeDefined();
    expect(s1Phase.stepDef.contracts.output?.profileKind).toBe("briefing");
    expect(s1Phase.stepDef.contracts.humanGate?.mode).toBe("visual_review");
  });

  test("first answer persists its contract immediately, before the second answer", async () => {
    const h = buildLoopTestApp("config-hearing");
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);

    await post(h.app, `/api/cycles/${cycle.id}/phases/S1/start`);

    const inbox = await get(h.app, `/api/projects/${projectId}/inbox`);
    const q1 = (inbox.json.data as any[]).find(
      (q: any) => q.target?.field === "output.profileKind",
    );
    expect(q1).toBeDefined();

    await post(h.app, `/api/questions/${q1.id}/answer`, {
      verdict: "answer",
      body: "briefing",
    });

    // Contract write happens pre-dispatch (before batch gate / resume), so
    // profileKind is already persisted in the cycle snapshot after the first answer.
    const cycleGet = await get(h.app, `/api/cycles/${cycle.id}`);
    const s1Phase = findPhase(cycleGet.json.data, "S1");
    expect(s1Phase?.stepDef?.contracts?.output?.profileKind).toBe("briefing");
    // Note(S10 F-2): the cycle snapshot now carries seeded default contracts at phase
    // creation, so humanGate may already be present. The key invariant verified above
    // is that profileKind="briefing" is written by the first answer before the batch
    // gate fires — not that humanGate is absent.
  });

  test("cycle-scope write does NOT touch project.pipelineDef", async () => {
    const h = buildLoopTestApp("config-hearing");
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);

    // Capture the project pipeline contracts before any config answer.
    const projBefore = await get(h.app, `/api/projects/${projectId}`);
    const s1Before = (projBefore.json.data.pipelineDef as any[]).find(
      (sd: any) => sd.id === "S1",
    );
    const contractsBefore = s1Before?.contracts;

    await post(h.app, `/api/cycles/${cycle.id}/phases/S1/start`);

    const inbox = await get(h.app, `/api/projects/${projectId}/inbox`);
    const questions: any[] = inbox.json.data;
    for (const q of questions) {
      const val = q.target?.field === "humanGate.mode" ? "none" : "briefing";
      await post(h.app, `/api/questions/${q.id}/answer`, {
        verdict: "answer",
        body: val,
      });
    }

    // Project pipelineDef must be identical to what it was before any config answer.
    const projAfter = await get(h.app, `/api/projects/${projectId}`);
    const s1After = (projAfter.json.data.pipelineDef as any[]).find(
      (sd: any) => sd.id === "S1",
    );
    expect(s1After?.contracts).toEqual(contractsBefore);
  });

  test("after both answers batch gate fires resume → visual_review card appears", async () => {
    const h = buildLoopTestApp("config-hearing");
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);

    await post(h.app, `/api/cycles/${cycle.id}/phases/S1/start`);
    const inbox = await get(h.app, `/api/projects/${projectId}/inbox`);
    const questions: any[] = inbox.json.data;

    // Answer both config questions.
    for (const q of questions) {
      const val = q.target?.field === "humanGate.mode" ? "visual_review" : "briefing";
      await post(h.app, `/api/questions/${q.id}/answer`, {
        verdict: "answer",
        body: val,
      });
    }

    // Both config questions are answered. The batch gate fired resume on the LAST
    // answer, the scripted orchestrator emitted ResultEmitted → EventApplier raised
    // a visual_review card. The two answered config questions are no longer "open".
    // Additionally, EngineService.onRolelessResult auto-launched a reconstruction
    // run → ReconstructionProposalEmitted → reconstruction inbox card (US-08 F-1).
    const inbox3 = await get(h.app, `/api/projects/${projectId}/inbox`);
    const openAfter: any[] = inbox3.json.data.filter((q: any) => q.state === "open");
    // At least one open card; the visual_review card must be present.
    expect(openAfter.length).toBeGreaterThanOrEqual(1);
    const visualReviewCard = openAfter.find((q: any) => q.kind === "visual_review");
    expect(visualReviewCard).toBeDefined();
    expect(visualReviewCard.kind).toBe("visual_review");
  });
});

// ── Regression: normal (no-target) happy-path question is unaffected ──────────

describe("BU-3 regression — normal happy-path question unaffected by config-hearing", () => {
  test("answering a normal (no-target) question succeeds with no config-hearing side effect", async () => {
    const h = buildLoopTestApp("happy");
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId);

    await post(h.app, `/api/cycles/${cycle.id}/phases/S1/start`);
    const inbox = await get(h.app, `/api/projects/${projectId}/inbox`);
    const question = inbox.json.data[0];

    // Normal questions have no target set.
    expect(question.target).toBeUndefined();

    const answerRes = await post(h.app, `/api/questions/${question.id}/answer`, {
      verdict: "answer",
      body: "scope confirmed",
    });
    expect(answerRes.status).toBe(200);
    expect(answerRes.json.data.question.state).toBe("answered");

    // Project pipeline contracts are untouched by the normal (no-target) answer.
    // S10 F-2: DEFAULT_STEP_CONTRACTS now seeds contracts on createProject, so
    // contracts are non-null. The regression assertion is that profileKind is NOT
    // "briefing" (no config-hearing write happened) and the seed was not modified.
    const projGet = await get(h.app, `/api/projects/${projectId}`);
    const s1 = (projGet.json.data.pipelineDef as any[]).find(
      (sd: any) => sd.id === "S1",
    );
    // profileKind is only written by config-hearing; a normal answer must not set it.
    expect(s1?.contracts?.output?.profileKind).toBeUndefined();
  });
});

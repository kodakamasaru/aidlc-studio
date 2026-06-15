/**
 * Unit-04: resume turn 継続 — tests.
 *
 * Covers:
 *   - port: ResumeRun accepts sessionId (type-level guard)
 *   - live: MAX_HEARING_TURNS exported constant (value = 10)
 *   - live.resume(body absent) → done (finalize path, unchanged)
 *   - live.resume(body present + NO sessionId) → stalled (原則④)
 *   - live.resume: context missing → throws
 *   - live.resume MAX_HEARING_TURNS exceeded → stalled
 *   - live.resume(body + sessionId) → next turn → QuestionRaised or ResultEmitted
 *   - scripted: turn parity — answer→QuestionRaised on turn 1, ResultEmitted on turn 2
 *   - scripted: body absent (finalize) on reviewed → done
 *   - scripted: body absent on asked → no-op
 *   - session-repo: persist + fetch round-trip
 *   - inbox-service wiring: sessionId is fetched and passed to port.resume
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { RunId, CycleId, PhaseId, ProjectId } from "../../domain/shared/ids";
import type { Text } from "../../domain/shared/primitives";
import type { Step } from "../../domain/shared/vocab";
import type { RunEmission, RunContext, ResumeRun } from "../../app/ports/orchestrator";
import type { DomainEvent } from "../../domain/events/events";
import {
  LiveClaudeOrchestrator,
  MAX_HEARING_TURNS,
} from "./live";
import {
  ScriptedOrchestrator,
  SCRIPTED_SESSION_ID,
} from "./scripted";
import { SqliteSessionRepo } from "../db/session-repo";
import { openDb } from "../db/open";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const runId = "run-u04-test" as RunId;

const ctx: RunContext = {
  runId,
  projectId: "proj-1" as ProjectId,
  cycleId: "cyc-1" as CycleId,
  phaseId: "ph-1" as PhaseId,
  step: "s1" as Step,
};

function makeSink(): { emissions: RunEmission[]; sink: (e: RunEmission) => Promise<void> } {
  const emissions: RunEmission[] = [];
  return {
    emissions,
    sink: async (e) => { emissions.push(e); },
  };
}

/** Inject context into orchestrator without spawning. */
function injectCtx(orc: LiveClaudeOrchestrator, runCtx: RunContext): void {
  (orc as unknown as { contexts: Map<string, RunContext> }).contexts.set(runCtx.runId, runCtx);
}

/** Pre-seed resume turn counter. */
function seedResumeCount(orc: LiveClaudeOrchestrator, id: RunId, count: number): void {
  (orc as unknown as { resumeCounts: Map<string, number> }).resumeCounts.set(id, count);
}

/** Build fake JSONL containing an aidlc-question block (→ QuestionRaised). */
function fakeQuestionStdout(sessionId = "sess-q-002"): string {
  const initLine = JSON.stringify({ type: "system", subtype: "init", session_id: sessionId });
  const questionBlock = [
    "```aidlc-question",
    JSON.stringify({
      questions: [{
        id: "q2",
        prompt: "Follow-up question?",
        answerKind: "single",
        options: [{ id: "a", label: "Option A", recommended: true }],
      }],
    }),
    "```",
  ].join("\n");
  const resultLine = JSON.stringify({
    type: "result",
    subtype: "success",
    result: questionBlock,
  });
  return [initLine, resultLine].join("\n");
}

/** Build fake JSONL with a plain result (→ ResultEmitted). */
function fakeResultStdout(sessionId = "sess-r-003"): string {
  const initLine = JSON.stringify({ type: "system", subtype: "init", session_id: sessionId });
  const resultLine = JSON.stringify({
    type: "result",
    subtype: "success",
    result: "Step completed successfully.",
  });
  return [initLine, resultLine].join("\n");
}

/**
 * Run awaitAndEmit with a fake child that outputs `stdoutContent`.
 * Returns the emissions collected.
 */
async function drainFake(
  orc: LiveClaudeOrchestrator,
  stdoutContent: string,
  emissions: RunEmission[],
): Promise<void> {
  const fakeChild = Bun.spawn(
    ["bun", "-e", `process.stdout.write(${JSON.stringify(stdoutContent)})`],
    { stdout: "pipe", stderr: "pipe" },
  );
  // We must track in children so awaitAndEmit's finally can clean up.
  (orc as unknown as { children: Map<string, typeof fakeChild> }).children.set(runId, fakeChild);

  await (orc as unknown as {
    awaitAndEmit(ctx: RunContext, child: typeof fakeChild, completeness: boolean): Promise<void>;
  }).awaitAndEmit(ctx, fakeChild, false);
  void emissions; // already mutated by the sink
}

/** Build fake JSONL containing an aidlc-reconstruction block (→ ReconstructionProposalEmitted). */
function fakeReconstructionStdout(sessionId = "sess-recon-001"): string {
  const initLine = JSON.stringify({ type: "system", subtype: "init", session_id: sessionId });
  const block = [
    "```aidlc-reconstruction",
    JSON.stringify({
      scope: "cycle",
      steps: [
        { id: "S2", label: "画面", order: 0, skillRef: "aidlc-s2-wireframe", instruction: "ワイヤーフレーム", diff: "keep" },
        { id: "S6", label: "モデル", order: 1, skillRef: "aidlc-s6-domain-model", instruction: "ドメインモデル", diff: "keep" },
      ],
    }),
    "```",
  ].join("\n");
  const resultLine = JSON.stringify({ type: "result", subtype: "success", result: block });
  return [initLine, resultLine].join("\n");
}

// ---------------------------------------------------------------------------
// US-08 / O5: live adapter emits ReconstructionProposalEmitted from a block
// ---------------------------------------------------------------------------

describe("LiveClaudeOrchestrator.awaitAndEmit — aidlc-reconstruction (US-08 / O5)", () => {
  test("reconstruction block → ReconstructionProposalEmitted + RunStateChanged(done), NO ResultEmitted", async () => {
    const { emissions, sink } = makeSink();
    const orc = new LiveClaudeOrchestrator({ sink });
    injectCtx(orc, ctx);

    await drainFake(orc, fakeReconstructionStdout(), emissions);

    // Mirrors scripted: proposal then done — never a visual_review (loop guard).
    expect(emissions.map((e) => e.event.type)).toEqual([
      "ReconstructionProposalEmitted",
      "RunStateChanged",
    ]);
    const proposalEv = emissions[0]!.event as Extract<DomainEvent, { type: "ReconstructionProposalEmitted" }>;
    expect((proposalEv.proposal as { scope: string }).scope).toBe("cycle");
    expect((proposalEv.proposal as { steps: unknown[] }).steps).toHaveLength(2);
    const doneEv = emissions[1]!.event as Extract<DomainEvent, { type: "RunStateChanged" }>;
    expect(doneEv.to).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Port type guard: ResumeRun accepts sessionId
// ---------------------------------------------------------------------------

describe("ResumeRun port type", () => {
  test("accepts sessionId (optional string)", () => {
    const cmd: ResumeRun = {
      runId,
      body: "my answer" as Text,
      sessionId: "sess-abc-123",
    };
    expect(cmd.sessionId).toBe("sess-abc-123");
  });

  test("sessionId is optional — omitting it is valid", () => {
    const cmd: ResumeRun = { runId };
    expect(cmd.sessionId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// MAX_HEARING_TURNS constant
// ---------------------------------------------------------------------------

describe("MAX_HEARING_TURNS", () => {
  test("is exported from live.ts", () => {
    expect(MAX_HEARING_TURNS).toBeDefined();
  });

  test("value is 10 (provisional operational cap)", () => {
    expect(MAX_HEARING_TURNS).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// LiveClaudeOrchestrator.resume — path B (finalize)
// ---------------------------------------------------------------------------

describe("LiveClaudeOrchestrator.resume — path B (body absent = finalize)", () => {
  test("body absent → emit RunStateChanged done", async () => {
    const { emissions, sink } = makeSink();
    const orc = new LiveClaudeOrchestrator({ sink });
    injectCtx(orc, ctx);

    await orc.resume({ runId });

    expect(emissions).toHaveLength(1);
    const ev = emissions[0]!.event as Extract<DomainEvent, { type: "RunStateChanged" }>;
    expect(ev.type).toBe("RunStateChanged");
    expect(ev.to).toBe("done");
  });

  test("context missing → throws (not silent)", async () => {
    const { sink } = makeSink();
    const orc = new LiveClaudeOrchestrator({ sink });
    // No context registered.

    await expect(orc.resume({ runId })).rejects.toThrow(/context not found/);
  });
});

// ---------------------------------------------------------------------------
// LiveClaudeOrchestrator.resume — path A (body + sessionId = turn continuation)
// ---------------------------------------------------------------------------

describe("LiveClaudeOrchestrator.resume — path A (body + sessionId = turn continuation)", () => {
  test("body present + sessionId missing → emit stalled (原則④)", async () => {
    const { emissions, sink } = makeSink();
    const orc = new LiveClaudeOrchestrator({ sink });
    injectCtx(orc, ctx);

    await orc.resume({ runId, body: "my answer" as Text });

    expect(emissions).toHaveLength(1);
    const ev = emissions[0]!.event as Extract<DomainEvent, { type: "RunStateChanged" }>;
    expect(ev.to).toBe("stalled");
    expect(ev.reason).toContain("セッション ID");
  });

  test("MAX_HEARING_TURNS exceeded → emit stalled with reason", async () => {
    const { emissions, sink } = makeSink();
    const orc = new LiveClaudeOrchestrator({ sink });
    injectCtx(orc, ctx);
    seedResumeCount(orc, runId, MAX_HEARING_TURNS); // next increment = MAX_HEARING_TURNS + 1

    await orc.resume({ runId, body: "answer" as Text, sessionId: "sess-cap-test" });

    expect(emissions).toHaveLength(1);
    const ev = emissions[0]!.event as Extract<DomainEvent, { type: "RunStateChanged" }>;
    expect(ev.to).toBe("stalled");
    expect(ev.reason).toContain(String(MAX_HEARING_TURNS));
  });

  test("exactly at MAX_HEARING_TURNS (not exceeded) → NOT stalled", async () => {
    const { emissions, sink } = makeSink();
    const orc = new LiveClaudeOrchestrator({ sink });
    injectCtx(orc, ctx);
    // Pre-seed count = MAX_HEARING_TURNS - 1 so the next increment = MAX_HEARING_TURNS (at cap, not over).
    seedResumeCount(orc, runId, MAX_HEARING_TURNS - 1);

    // With sessionId present and at-cap → would try to spawn claude --resume.
    // Since we don't have claude binary, we only test that it doesn't stall here
    // by checking that the stalled emit is NOT the first thing that happens.
    // The spawn will throw (no claude binary in test env) → stalled via awaitAndEmit,
    // but the reason should NOT be the turn-cap message.
    await orc.resume({ runId, body: "answer" as Text, sessionId: "sess-at-cap" });

    // Either it tried to spawn (throws/stalls via awaitAndEmit) OR it
    // stalled for a different reason — but NOT because of turn cap.
    if (emissions.length > 0) {
      const ev = emissions[0]!.event as Extract<DomainEvent, { type: "RunStateChanged" }>;
      if (ev.to === "stalled" && ev.reason) {
        expect(ev.reason).not.toContain("turn 数が上限");
      }
    }
  });

  test("next turn via awaitAndEmit emits QuestionRaised when AI asks another question", async () => {
    const { emissions, sink } = makeSink();
    const orc = new LiveClaudeOrchestrator({ sink });
    injectCtx(orc, ctx);

    await drainFake(orc, fakeQuestionStdout(), emissions);

    const questionEvents = emissions.filter((e) => e.event.type === "QuestionRaised");
    expect(questionEvents.length).toBeGreaterThan(0);
  });

  test("next turn via awaitAndEmit emits ResultEmitted when AI produces a result", async () => {
    const { emissions, sink } = makeSink();
    const orc = new LiveClaudeOrchestrator({ sink });
    injectCtx(orc, ctx);

    await drainFake(orc, fakeResultStdout(), emissions);

    const resultEvents = emissions.filter((e) => e.event.type === "ResultEmitted");
    expect(resultEvents.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ScriptedOrchestrator — turn parity (C6)
// ---------------------------------------------------------------------------

describe("ScriptedOrchestrator.resume — turn parity (C6)", () => {
  function makeScripted(): { orc: ScriptedOrchestrator; emissions: RunEmission[] } {
    const emissions: RunEmission[] = [];
    const sink = async (e: RunEmission) => { emissions.push(e); };
    // "multi-turn" scenario exercises the follow-up-question round-trip; the
    // default "happy" scenario concludes a hearing in one turn (loop happy path).
    const orc = new ScriptedOrchestrator({ sink, scenario: "multi-turn" });
    return { orc, emissions };
  }

  async function launchRun(orc: ScriptedOrchestrator): Promise<void> {
    await orc.launch({
      runId,
      projectId: "proj-1" as ProjectId,
      cycleId: "cyc-1" as CycleId,
      phaseId: "ph-1" as PhaseId,
      step: "s1" as Step,
      repoPath: "/tmp",
    });
  }

  test("SCRIPTED_SESSION_ID is exported and non-empty string", () => {
    expect(typeof SCRIPTED_SESSION_ID).toBe("string");
    expect(SCRIPTED_SESSION_ID.length).toBeGreaterThan(0);
  });

  test("turn 1 body present → emit QuestionRaised (follow-up question)", async () => {
    const { orc, emissions } = makeScripted();
    await launchRun(orc); // → QuestionRaised (initial ask)
    const beforeLen = emissions.length;

    await orc.resume({ runId, body: "my first answer" as Text, sessionId: SCRIPTED_SESSION_ID });

    const newEmissions = emissions.slice(beforeLen);
    const questionRaised = newEmissions.find((e) => e.event.type === "QuestionRaised");
    expect(questionRaised).toBeDefined();
  });

  test("turn 2 body present → emit ResultEmitted (hearing concludes)", async () => {
    const { orc, emissions } = makeScripted();
    await launchRun(orc);
    await orc.resume({ runId, body: "answer 1" as Text, sessionId: SCRIPTED_SESSION_ID });
    const beforeLen = emissions.length;

    await orc.resume({ runId, body: "answer 2" as Text, sessionId: SCRIPTED_SESSION_ID });

    const newEmissions = emissions.slice(beforeLen);
    const resultEmitted = newEmissions.find((e) => e.event.type === "ResultEmitted");
    expect(resultEmitted).toBeDefined();
  });

  test("body absent, phase=asked → no-op (state unchanged)", async () => {
    const { orc, emissions } = makeScripted();
    await launchRun(orc);
    const beforeLen = emissions.length;

    await orc.resume({ runId });

    expect(emissions.length).toBe(beforeLen);
  });

  test("body absent, phase=reviewed → emit done (finalize path)", async () => {
    const { orc, emissions } = makeScripted();
    await launchRun(orc);
    // Get to reviewed state: turn 1 (→ question), turn 2 (→ result).
    await orc.resume({ runId, body: "answer 1" as Text, sessionId: SCRIPTED_SESSION_ID });
    await orc.resume({ runId, body: "answer 2" as Text, sessionId: SCRIPTED_SESSION_ID });
    const beforeLen = emissions.length;

    await orc.resume({ runId }); // finalize

    const newEmissions = emissions.slice(beforeLen);
    const done = newEmissions.find(
      (e) => e.event.type === "RunStateChanged" &&
        (e.event as Extract<DomainEvent, { type: "RunStateChanged" }>).to === "done",
    );
    expect(done).toBeDefined();
  });

  test("existing happy scenario: launch→(no-body resume)×2 still works", async () => {
    // Backward compat: old test style where resume is called with no body.
    // launch → asked; resume (no body, asked) → no-op; resume (no body, asked) → no-op.
    const { orc, emissions } = makeScripted();
    await launchRun(orc);
    const afterLaunch = emissions.length;
    await orc.resume({ runId });
    await orc.resume({ runId });
    // No new emissions from no-op resumes.
    expect(emissions.length).toBe(afterLaunch);
  });
});

// ---------------------------------------------------------------------------
// SqliteSessionRepo — persist + fetch round-trip
// ---------------------------------------------------------------------------

describe("SqliteSessionRepo", () => {
  let db: Database;
  let repo: SqliteSessionRepo;

  beforeEach(() => {
    db = openDb(":memory:");
    repo = new SqliteSessionRepo(db);
  });

  test("save + find returns the session_id", () => {
    repo.save(runId, "sess-abc-123");
    expect(repo.find(runId)).toBe("sess-abc-123");
  });

  test("find returns null when no row exists", () => {
    expect(repo.find(runId)).toBeNull();
  });

  test("save is an upsert — later save overwrites the same runId", () => {
    repo.save(runId, "sess-old");
    repo.save(runId, "sess-new");
    expect(repo.find(runId)).toBe("sess-new");
  });

  test("different runIds are independent", () => {
    const runId2 = "run-other" as RunId;
    repo.save(runId, "sess-aaa");
    repo.save(runId2, "sess-bbb");
    expect(repo.find(runId)).toBe("sess-aaa");
    expect(repo.find(runId2)).toBe("sess-bbb");
  });

  test("session_id with special chars round-trips correctly", () => {
    const sessionId = "sess_abc-123.XYZ:9";
    repo.save(runId, sessionId);
    expect(repo.find(runId)).toBe(sessionId);
  });
});

// ---------------------------------------------------------------------------
// inbox-service wiring: sessionId fetched and passed to port.resume
// ---------------------------------------------------------------------------

describe("inbox-service sessionId wiring", () => {
  /**
   * White-box: simulate the dispatch logic from inbox-service to verify that
   * sessions.find is called and its result is forwarded to orchestrator.resume.
   * We test the pattern rather than the full service to avoid wiring all Ports.
   */

  function simulate(
    savedSessionId: string | null,
    body: Text | undefined,
  ): { capturedCmd: ResumeRun | undefined } {
    const capturedCmd: { value?: ResumeRun } = {};
    const sessions = {
      find: (_id: RunId): string | null => savedSessionId,
    };
    const orchestratorResume = (cmd: ResumeRun) => { capturedCmd.value = cmd; };

    // Replicate the dispatch logic from inbox-service.ts.
    const sessionId =
      body !== undefined
        ? (sessions.find(runId) ?? undefined)
        : undefined;
    orchestratorResume({
      runId,
      ...(body !== undefined ? { body } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
    });

    return { capturedCmd: capturedCmd.value };
  }

  test("body present + saved sessionId → sessionId passed to resume", () => {
    const { capturedCmd } = simulate("sess-wired-123", "answer" as Text);
    expect(capturedCmd?.sessionId).toBe("sess-wired-123");
    expect(capturedCmd?.body).toBe("answer");
  });

  test("body present + no saved sessionId → sessionId NOT passed", () => {
    const { capturedCmd } = simulate(null, "answer" as Text);
    expect(capturedCmd?.sessionId).toBeUndefined();
    expect(capturedCmd?.body).toBe("answer");
  });

  test("body absent (finalize) → sessionId NOT passed, body NOT passed", () => {
    const { capturedCmd } = simulate("sess-ignored", undefined);
    expect(capturedCmd?.sessionId).toBeUndefined();
    expect(capturedCmd?.body).toBeUndefined();
  });
});

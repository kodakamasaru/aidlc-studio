/**
 * BU-2 — aidlc-result output protocol tests.
 *
 * TDD suite: RED → write tests first, GREEN → implement.
 *
 * Covers:
 *   - aidlcResultToEvents: pure mapper (the testable core)
 *     - envelope with questions[] → one QuestionRaised per question
 *     - status=needs_human, no questions → ResultEmitted with completeness + artifacts + decisions
 *     - status=done → RunStateChanged done
 *     - status=stalled → RunStateChanged stalled
 *   - awaitAndEmit integration via drainFake helper:
 *     - aidlc-result envelope present → new path (NOT legacy aidlc-question path)
 *     - malformed envelope → visible error log + fall through to legacy path (backward compat)
 *     - NO aidlc-result block → legacy path unchanged (regression guard)
 *   - scripted aidlc-result scenario: deterministic coverage of all status branches
 *   - ResultEmitted extended fields (artifacts/decisions) carried backward-compatibly
 */

import { test, expect, describe } from "bun:test";
import type { RunId, CycleId, PhaseId, ProjectId } from "../../domain/shared/ids";
import type { Text } from "../../domain/shared/primitives";
import type { Step } from "../../domain/shared/vocab";
import type { RunEmission, RunContext } from "../../app/ports/orchestrator";
import type { DomainEvent, QuestionRaised, ResultEmitted, RunStateChanged } from "../../domain/events/events";
import {
  aidlcResultToEvents,
  aidlcQuestionToEvent,
  LiveClaudeOrchestrator,
} from "./live";
import { ScriptedOrchestrator } from "./scripted";
import { serializeAidlcResult, type AidlcResult } from "../../wire/aidlc-result";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const runId = "run-bu2-test" as RunId;

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

const makeMinimalResult = (overrides: Partial<AidlcResult> = {}): AidlcResult => ({
  artifacts: [],
  questions: [],
  decisions: [],
  completeness: {
    requirements: [{ key: "REQ-01", text: "Basic output" }],
    addressed: ["REQ-01"],
  },
  status: "done",
  ...overrides,
});

const makeQuestion = () => ({
  id: "q1",
  prompt: "Which approach?",
  answerKind: "single" as const,
  options: [
    { id: "a", label: "Option A", recommended: true as const },
    { id: "b", label: "Option B" },
  ],
});

/** Build JSONL with an aidlc-result envelope as the result text. */
function fakeAidlcResultStdout(result: AidlcResult, sessionId = "sess-result-001"): string {
  const initLine = JSON.stringify({ type: "system", subtype: "init", session_id: sessionId });
  const resultLine = JSON.stringify({
    type: "result",
    subtype: "success",
    result: serializeAidlcResult(result),
  });
  return [initLine, resultLine].join("\n");
}

/** Build JSONL with a plain text result (no aidlc-result block) → legacy path. */
function fakePlainResultStdout(sessionId = "sess-plain-001"): string {
  const initLine = JSON.stringify({ type: "system", subtype: "init", session_id: sessionId });
  const resultLine = JSON.stringify({
    type: "result",
    subtype: "success",
    result: "This is a plain text result with no fenced blocks.",
  });
  return [initLine, resultLine].join("\n");
}

/** Build JSONL with a malformed aidlc-result block (unclosed fence → err). */
function fakeMalformedResultStdout(): string {
  const initLine = JSON.stringify({ type: "system", subtype: "init", session_id: "sess-malformed" });
  // Unclosed fence — parseAidlcResultBlock returns err
  const malformed = "```aidlc-result\n{\"status\":\"done\"}";
  const resultLine = JSON.stringify({
    type: "result",
    subtype: "success",
    result: malformed,
  });
  return [initLine, resultLine].join("\n");
}

/** Build JSONL with a legacy aidlc-question block (no aidlc-result). */
function fakeLegacyQuestionStdout(): string {
  const initLine = JSON.stringify({ type: "system", subtype: "init", session_id: "sess-legacy-q" });
  const questionBlock = [
    "```aidlc-question",
    JSON.stringify({
      questions: [makeQuestion()],
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

/** Run awaitAndEmit with a fake child that outputs stdoutContent. */
async function drainFake(
  stdoutContent: string,
  emissionsOut: RunEmission[],
): Promise<void> {
  const sink = async (e: RunEmission) => { emissionsOut.push(e); };
  const orc = new LiveClaudeOrchestrator({ sink });
  injectCtx(orc, ctx);

  const fakeChild = Bun.spawn(
    ["bun", "-e", `process.stdout.write(${JSON.stringify(stdoutContent)})`],
    { stdout: "pipe", stderr: "pipe" },
  );
  (orc as unknown as { children: Map<string, typeof fakeChild> }).children.set(runId, fakeChild);

  await (orc as unknown as {
    awaitAndEmit(ctx: RunContext, child: typeof fakeChild, completeness: boolean): Promise<void>;
  }).awaitAndEmit(ctx, fakeChild, false);
}

// ---------------------------------------------------------------------------
// aidlcResultToEvents — pure mapper
// ---------------------------------------------------------------------------

describe("aidlcResultToEvents — pure mapper", () => {
  test("questions[] non-empty → one QuestionRaised per question", () => {
    // Arrange
    const result = makeMinimalResult({
      status: "needs_human",
      questions: [makeQuestion(), { ...makeQuestion(), id: "q2", prompt: "Second Q?" }],
    });

    // Act
    const events = aidlcResultToEvents(runId, result);

    // Assert
    expect(events.length).toBe(2);
    expect(events[0]!.type).toBe("QuestionRaised");
    expect(events[1]!.type).toBe("QuestionRaised");
    const q1 = events[0] as QuestionRaised;
    expect(q1.runId).toBe(runId);
    expect(q1.kind).toBe("question");
  });

  test("questions[] non-empty → each question maps via aidlcQuestionToEvent", () => {
    // Arrange
    const q = makeQuestion();
    const result = makeMinimalResult({ status: "needs_human", questions: [q] });

    // Act
    const events = aidlcResultToEvents(runId, result);

    // Assert — same mapping as aidlcQuestionToEvent
    const expected = aidlcQuestionToEvent(runId, q);
    expect(events[0]).toEqual(expected);
  });

  test("questions[] empty + status=needs_human → ResultEmitted with completeness", () => {
    // Arrange
    const result = makeMinimalResult({
      status: "needs_human",
      questions: [],
      completeness: {
        requirements: [{ key: "R1", text: "Req 1" }],
        addressed: [],
      },
    });

    // Act
    const events = aidlcResultToEvents(runId, result);

    // Assert
    expect(events.length).toBe(1);
    const ev = events[0] as ResultEmitted;
    expect(ev.type).toBe("ResultEmitted");
    expect(ev.runId).toBe(runId);
    expect(ev.completeness).toBeDefined();
    expect(ev.completeness?.requirements).toHaveLength(1);
  });

  test("status=needs_human → ResultEmitted carries artifacts (optional field)", () => {
    // Arrange
    const result = makeMinimalResult({
      status: "needs_human",
      artifacts: ["aidlc-docs/v0.0.4/s1/index.md", "aidlc-docs/v0.0.4/s1/us.md"],
    });

    // Act
    const events = aidlcResultToEvents(runId, result);

    // Assert
    const ev = events[0] as ResultEmitted;
    expect(ev.type).toBe("ResultEmitted");
    expect(ev.artifacts).toEqual(["aidlc-docs/v0.0.4/s1/index.md", "aidlc-docs/v0.0.4/s1/us.md"]);
  });

  test("status=needs_human → ResultEmitted carries decisions (optional field)", () => {
    // Arrange
    const result = makeMinimalResult({
      status: "needs_human",
      decisions: [{ id: "D-01", decision: "Use JSON", reason: "Deterministic parse" }],
    });

    // Act
    const events = aidlcResultToEvents(runId, result);

    // Assert
    const ev = events[0] as ResultEmitted;
    expect(ev.type).toBe("ResultEmitted");
    expect(ev.decisions).toHaveLength(1);
    expect(ev.decisions![0]!.id).toBe("D-01");
  });

  test("status=done → RunStateChanged done (no human gate needed)", () => {
    // Arrange
    const result = makeMinimalResult({ status: "done" });

    // Act
    const events = aidlcResultToEvents(runId, result);

    // Assert
    expect(events.length).toBe(1);
    const ev = events[0] as RunStateChanged;
    expect(ev.type).toBe("RunStateChanged");
    expect(ev.runId).toBe(runId);
    expect(ev.to).toBe("done");
  });

  test("status=stalled → RunStateChanged stalled (retriable)", () => {
    // Arrange
    const result = makeMinimalResult({ status: "stalled" });

    // Act
    const events = aidlcResultToEvents(runId, result);

    // Assert
    expect(events.length).toBe(1);
    const ev = events[0] as RunStateChanged;
    expect(ev.type).toBe("RunStateChanged");
    expect(ev.to).toBe("stalled");
  });

  test("questions[] non-empty takes priority over status (always emit questions first)", () => {
    // Arrange — status=done but there are questions: questions[] wins
    const result = makeMinimalResult({
      status: "done",
      questions: [makeQuestion()],
    });

    // Act
    const events = aidlcResultToEvents(runId, result);

    // Assert — QuestionRaised, not RunStateChanged done
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe("QuestionRaised");
  });

  test("status=needs_human + empty artifacts + empty decisions → ResultEmitted still valid", () => {
    // Arrange
    const result = makeMinimalResult({
      status: "needs_human",
      artifacts: [],
      decisions: [],
    });

    // Act
    const events = aidlcResultToEvents(runId, result);

    // Assert
    const ev = events[0] as ResultEmitted;
    expect(ev.type).toBe("ResultEmitted");
    // Empty arrays should not be set (omit when empty to avoid noise)
    // OR they can be set — either way the event is valid
    expect(events.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// awaitAndEmit integration: aidlc-result envelope path
// ---------------------------------------------------------------------------

describe("awaitAndEmit — aidlc-result envelope path", () => {
  test("aidlc-result with status=done → RunStateChanged done (new envelope path)", async () => {
    // Arrange
    const result = makeMinimalResult({ status: "done" });
    const emissions: RunEmission[] = [];

    // Act
    await drainFake(fakeAidlcResultStdout(result), emissions);

    // Assert — envelope path → RunStateChanged done
    const stateChanges = emissions.filter(
      (e) => e.event.type === "RunStateChanged" &&
        (e.event as RunStateChanged).to === "done",
    );
    expect(stateChanges.length).toBeGreaterThan(0);
  });

  test("aidlc-result with status=stalled → RunStateChanged stalled", async () => {
    // Arrange
    const result = makeMinimalResult({ status: "stalled" });
    const emissions: RunEmission[] = [];

    // Act
    await drainFake(fakeAidlcResultStdout(result), emissions);

    // Assert
    const stateChanges = emissions.filter(
      (e) => e.event.type === "RunStateChanged" &&
        (e.event as RunStateChanged).to === "stalled",
    );
    expect(stateChanges.length).toBeGreaterThan(0);
  });

  test("aidlc-result with questions → QuestionRaised (not ResultEmitted)", async () => {
    // Arrange
    const result = makeMinimalResult({
      status: "needs_human",
      questions: [makeQuestion()],
    });
    const emissions: RunEmission[] = [];

    // Act
    await drainFake(fakeAidlcResultStdout(result), emissions);

    // Assert
    const questionEvents = emissions.filter((e) => e.event.type === "QuestionRaised");
    const resultEvents = emissions.filter((e) => e.event.type === "ResultEmitted");
    expect(questionEvents.length).toBeGreaterThan(0);
    expect(resultEvents.length).toBe(0);
  });

  test("aidlc-result status=needs_human, no questions → ResultEmitted with completeness", async () => {
    // Arrange
    const result = makeMinimalResult({
      status: "needs_human",
      completeness: {
        requirements: [{ key: "R1", text: "Req 1" }],
        addressed: [],
      },
    });
    const emissions: RunEmission[] = [];

    // Act
    await drainFake(fakeAidlcResultStdout(result), emissions);

    // Assert
    const resultEvents = emissions.filter((e) => e.event.type === "ResultEmitted");
    expect(resultEvents.length).toBeGreaterThan(0);
    const ev = resultEvents[0]!.event as ResultEmitted;
    expect(ev.completeness).toBeDefined();
  });

  test("malformed aidlc-result envelope → falls through (some terminal event emitted, no QuestionRaised)", async () => {
    // Arrange — malformed = unclosed fence → err → log + fall through
    const emissions: RunEmission[] = [];

    // Act
    await drainFake(fakeMalformedResultStdout(), emissions);

    // Assert — no QuestionRaised from broken envelope; some event must be emitted
    const questionEvents = emissions.filter((e) => e.event.type === "QuestionRaised");
    expect(questionEvents.length).toBe(0);
    expect(emissions.length).toBeGreaterThan(0);
  });

  test("NO aidlc-result block → legacy path: plain text → ResultEmitted (regression guard)", async () => {
    // Arrange — plain text, no fenced blocks at all
    const emissions: RunEmission[] = [];

    // Act
    await drainFake(fakePlainResultStdout(), emissions);

    // Assert — legacy: ResultEmitted (summary block with the plain text)
    const resultEvents = emissions.filter((e) => e.event.type === "ResultEmitted");
    expect(resultEvents.length).toBeGreaterThan(0);
    // No state changes on clean legacy path
    const stateChanges = emissions.filter((e) => e.event.type === "RunStateChanged");
    expect(stateChanges.length).toBe(0);
  });

  test("legacy aidlc-question block (no aidlc-result) → QuestionRaised (regression guard)", async () => {
    // Arrange — old format: aidlc-question block without aidlc-result wrapper
    const emissions: RunEmission[] = [];

    // Act
    await drainFake(fakeLegacyQuestionStdout(), emissions);

    // Assert — legacy path still works
    const questionEvents = emissions.filter((e) => e.event.type === "QuestionRaised");
    expect(questionEvents.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ResultEmitted backward compatibility
// ---------------------------------------------------------------------------

describe("ResultEmitted — backward compatibility (optional fields)", () => {
  test("ResultEmitted without artifacts/decisions is still valid (existing callers unchanged)", () => {
    // Arrange — old-style emission without the new fields
    const event: ResultEmitted = {
      type: "ResultEmitted",
      runId,
      blocks: [{ type: "summary", title: "Test" as Text, body: "body" as Text }],
    };

    // Assert — TypeScript allows it (optional fields) and values are absent
    expect(event.artifacts).toBeUndefined();
    expect(event.decisions).toBeUndefined();
    expect(event.completeness).toBeUndefined();
  });

  test("ResultEmitted with artifacts/decisions carries them correctly", () => {
    // Arrange — new-style emission with the new fields
    const event: ResultEmitted = {
      type: "ResultEmitted",
      runId,
      blocks: [],
      artifacts: ["aidlc-docs/v0.0.4/s1/index.md"],
      decisions: [{ id: "D-01", decision: "Use JSON", reason: "Deterministic" }],
    };

    // Assert
    expect(event.artifacts).toHaveLength(1);
    expect(event.decisions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Scripted aidlc-result scenarios: deterministic coverage (C6 parity)
// ---------------------------------------------------------------------------

describe("ScriptedOrchestrator — aidlc-result scenarios (C6 parity)", () => {
  function makeScripted(scenario: import("./scripted").ScriptedScenario): {
    orc: ScriptedOrchestrator;
    emissions: RunEmission[];
  } {
    const emissions: RunEmission[] = [];
    const sink = async (e: RunEmission) => { emissions.push(e); };
    const orc = new ScriptedOrchestrator({ sink, scenario });
    return { orc, emissions };
  }

  async function doLaunch(orc: ScriptedOrchestrator): Promise<void> {
    await orc.launch({
      runId,
      projectId: "proj-1" as ProjectId,
      cycleId: "cyc-1" as CycleId,
      phaseId: "ph-1" as PhaseId,
      step: "s1" as Step,
      repoPath: "/tmp",
    });
  }

  test("aidlc-result-done scenario: launch → RunStateChanged done", async () => {
    // Arrange
    const { orc, emissions } = makeScripted("aidlc-result-done");

    // Act
    await doLaunch(orc);

    // Assert
    expect(emissions).toHaveLength(1);
    const ev = emissions[0]!.event as RunStateChanged;
    expect(ev.type).toBe("RunStateChanged");
    expect(ev.to).toBe("done");
  });

  test("aidlc-result-needs-human scenario: launch → ResultEmitted with completeness", async () => {
    // Arrange
    const { orc, emissions } = makeScripted("aidlc-result-needs-human");

    // Act
    await doLaunch(orc);

    // Assert
    expect(emissions).toHaveLength(1);
    const ev = emissions[0]!.event as ResultEmitted;
    expect(ev.type).toBe("ResultEmitted");
    expect(ev.completeness).toBeDefined();
  });

  test("aidlc-result-stalled scenario: launch → RunStateChanged stalled", async () => {
    // Arrange
    const { orc, emissions } = makeScripted("aidlc-result-stalled");

    // Act
    await doLaunch(orc);

    // Assert
    expect(emissions).toHaveLength(1);
    const ev = emissions[0]!.event as RunStateChanged;
    expect(ev.type).toBe("RunStateChanged");
    expect(ev.to).toBe("stalled");
  });

  test("aidlc-result-questions scenario: launch → QuestionRaised(s)", async () => {
    // Arrange
    const { orc, emissions } = makeScripted("aidlc-result-questions");

    // Act
    await doLaunch(orc);

    // Assert — at least one QuestionRaised
    const questionEvents = emissions.filter((e) => e.event.type === "QuestionRaised");
    expect(questionEvents.length).toBeGreaterThan(0);
  });

  test("existing happy scenario is UNCHANGED: launch → QuestionRaised", async () => {
    // Regression guard: existing happy scenario unaffected
    const { orc, emissions } = makeScripted("happy");

    await doLaunch(orc);

    // happy: emits QuestionRaised (initial ask)
    expect(emissions).toHaveLength(1);
    expect(emissions[0]!.event.type).toBe("QuestionRaised");
  });

  test("existing stall-first scenario is UNCHANGED: launch → RunStateChanged stalled", async () => {
    const { orc, emissions } = makeScripted("stall-first");

    await doLaunch(orc);

    expect(emissions).toHaveLength(1);
    const ev = emissions[0]!.event as RunStateChanged;
    expect(ev.type).toBe("RunStateChanged");
    expect(ev.to).toBe("stalled");
  });
});

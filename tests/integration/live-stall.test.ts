// Live adapter stall detection: when a run hangs (no result) past the timeout,
// the adapter must emit RunStateChanged STALLED (the retriable stall surface),
// NOT failed. Uses a fake "claude" that just sleeps + a tiny timeout — no real
// Claude needed, fully deterministic.
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LiveClaudeOrchestrator,
  claudeFailureDetail,
} from "../../src/infra/orchestrator/live";
import type {
  RunEmission,
  DomainEventSink,
  RunLaunch,
} from "../../src/app/ports/orchestrator";
import { RunId, ProjectId, CycleId, PhaseId } from "../../src/domain/shared/ids";
import { Step } from "../../src/domain/shared/vocab";

test("live adapter: a timed-out run emits RunStateChanged stalled (not failed)", async () => {
  // Fake "claude": a script that hangs (sleeps), ignoring its CLI args. With a
  // tiny timeoutMs the adapter times it out → emits a STALLED terminal state.
  const dir = mkdtempSync(join(tmpdir(), "aidlc-fakeclaude-"));
  const bin = join(dir, "claude");
  writeFileSync(bin, "#!/bin/sh\nsleep 5\n");
  chmodSync(bin, 0o755);

  const emissions: RunEmission[] = [];
  const sink: DomainEventSink = async (e) => {
    emissions.push(e);
  };

  const orch = new LiveClaudeOrchestrator({
    sink,
    claudeBin: bin,
    timeoutMs: 150,
  });
  const cmd: RunLaunch = {
    runId: RunId("run-stall"),
    projectId: ProjectId("p"),
    cycleId: CycleId("c"),
    phaseId: PhaseId("ph"),
    step: Step("S1"),
    repoPath: process.cwd(), // absolute + existing (the adapter validates it)
  };

  // launch is non-blocking; the detached task times out + emits.
  await orch.launch(cmd);

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && emissions.length === 0) {
    await new Promise((r) => setTimeout(r, 50));
  }

  const stateChanges = emissions.filter(
    (e) => e.event.type === "RunStateChanged",
  );
  expect(stateChanges).toHaveLength(1);
  const ev = stateChanges[0]!.event;
  expect(ev.type === "RunStateChanged" && ev.to).toBe("stalled");
});

test("live adapter: a claude exit-1 emits failed WITH a reason mined from stdout", async () => {
  // Fake "claude" that exits 1 with EMPTY stderr but a stream-json error on
  // stdout — exactly the shape that produced a bare "claude exited 1:" before.
  // The adapter must surface the stdout detail in the terminal `failed` reason.
  const dir = mkdtempSync(join(tmpdir(), "aidlc-fakeclaude-"));
  const bin = join(dir, "claude");
  writeFileSync(
    bin,
    '#!/bin/sh\necho \'{"type":"result","subtype":"error","is_error":true,"result":"model not found: bogus"}\'\nexit 1\n',
  );
  chmodSync(bin, 0o755);

  const emissions: RunEmission[] = [];
  const sink: DomainEventSink = async (e) => {
    emissions.push(e);
  };

  const orch = new LiveClaudeOrchestrator({ sink, claudeBin: bin });
  const cmd: RunLaunch = {
    runId: RunId("run-fail"),
    projectId: ProjectId("p"),
    cycleId: CycleId("c"),
    phaseId: PhaseId("ph"),
    step: Step("S1"),
    repoPath: process.cwd(),
  };
  await orch.launch(cmd);

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && emissions.length === 0) {
    await new Promise((r) => setTimeout(r, 50));
  }

  const change = emissions.find((e) => e.event.type === "RunStateChanged");
  expect(change).toBeDefined();
  const ev = change!.event;
  expect(ev.type === "RunStateChanged" && ev.to).toBe("failed");
  const reason =
    ev.type === "RunStateChanged" ? (ev.reason ?? "") : "";
  // The bare "claude exited 1:" is replaced by the real stdout-mined detail.
  expect(reason).toContain("model not found: bogus");
});

// ── claudeFailureDetail (pure) ───────────────────────────────────
test("claudeFailureDetail: prefers non-empty stderr", () => {
  expect(claudeFailureDetail("boom on stderr\n", "ignored")).toBe(
    "boom on stderr",
  );
});

test("claudeFailureDetail: falls back to a stream-json result on empty stderr", () => {
  const stdout =
    '{"type":"system"}\n{"type":"result","is_error":true,"result":"auth required"}\n';
  expect(claudeFailureDetail("", stdout)).toBe("auth required");
});

test("claudeFailureDetail: falls back to the last NON-JSON text line", () => {
  expect(claudeFailureDetail("  ", "warming up\nsomething broke")).toBe(
    "something broke",
  );
});

test("claudeFailureDetail: maps error_max_turns to a sentence, NOT raw JSON", () => {
  // The exact shape that produced the 500-char JSON blob in the wild.
  const stdout =
    '{"type":"system","subtype":"init"}\n' +
    '{"type":"result","subtype":"error_max_turns","is_error":true,"num_turns":2,"total_cost_usd":0.116}\n';
  const detail = claudeFailureDetail("", stdout);
  expect(detail).toBe("max turns に達しました(エージェントが完了前に停止)(2 turns)");
  expect(detail).not.toContain("{"); // never leak raw JSON to the UI.
});

test("claudeFailureDetail: never returns a raw JSON line when extraction fails", () => {
  // A JSON line we can't extract a message from must NOT be dumped verbatim.
  const stdout = '{"type":"assistant","message":{"content":[]}}';
  expect(claudeFailureDetail("", stdout)).toBe("");
});

test("claudeFailureDetail: empty when there is no diagnostic output at all", () => {
  expect(claudeFailureDetail("", "")).toBe("");
});

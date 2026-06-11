// S8 gen→gate→eval E2E (scope success #1–3). A step that declares a verification
// contract runs as a generator; the EngineService gates its BriefOut, launches a
// separate evaluator run, then routes the evaluator's completeness verdict:
//   complete → visual_review of the evaluator output (allow-done)
//   gap+descope → the run stalls and a descope Question reaches the human
// Driven end-to-end through the real services + ScriptedOrchestrator + EngineService.
import { describe, test, expect } from "bun:test";
import { buildLoopTestApp } from "../support/harness";
import { CycleService } from "../../src/app/services/cycle-service";
import { InboxService } from "../../src/app/services/inbox-service";
import { openProject } from "../../src/domain/project/project";
import type { VisionRef, SkillRef } from "../../src/domain/project/project";
import { Step } from "../../src/domain/shared/vocab";
import { ProjectId } from "../../src/domain/shared/ids";
import { instant } from "../../src/domain/shared/primitives";
import { unwrap } from "../../src/domain/shared/result";

const PID = "p-gge";

function seedProjectWithVerification(
  ports: ReturnType<typeof buildLoopTestApp>["ports"],
): void {
  const project = unwrap(
    openProject({
      id: ProjectId(PID),
      repoPath: "/repo/target",
      vision: "vision/brief.md" as unknown as VisionRef,
      pipelineDef: [
        {
          id: Step("S1"),
          label: "S1",
          order: 0,
          skillRef: "kit/skills/aidlc-s1" as unknown as SkillRef,
          // verification contract → startPhase runs this step as a generator.
          contracts: {
            verification: { observations: ["一覧が表示される", "空状態が表示される"] },
            humanGate: { mode: "visual_review" },
          },
        },
      ],
      env: {
        modelName: "claude",
        worktreeRoot: "/wt",
        stallTimeoutMin: 30,
        maxAttempt: 3,
      },
      createdAt: unwrap(instant("2026-06-11T00:00:00.000Z")),
    }),
  );
  ports.uow.run(() => ports.repos.projects.save(project));
}

async function runToEval(
  scenario: "gen-eval-complete" | "gen-eval-descope" | "gen-eval-gap",
) {
  const harness = buildLoopTestApp(scenario);
  seedProjectWithVerification(harness.ports);
  const cycles = new CycleService(harness.ports);
  const cycle = cycles.createCycle(PID, { title: "gge", version: "v0.0.2" });
  // startPhase drives the whole gen→gate→eval chain synchronously (the scripted
  // orchestrator awaits every sink call, which re-enters the EngineService).
  await cycles.startPhase(cycle.id, "S1");
  const after = cycles.getCycle(cycle.id);
  return { harness, cycle: after };
}

describe("gen→gate→eval E2E", () => {
  test("#1 gen→eval loop: gate passes → a SEPARATE evaluator run is launched", async () => {
    const { cycle } = await runToEval("gen-eval-complete");
    const phase = cycle.phases.find((p) => (p.step as string) === "S1")!;
    const roles = phase.runs.map((r) => r.role);
    expect(phase.runs.length).toBe(2);
    expect(roles).toContain("generator");
    expect(roles).toContain("evaluator");
    // generator finished (gate passed); evaluator is the live run.
    const gen = phase.runs.find((r) => r.role === "generator")!;
    const ev = phase.runs.find((r) => r.role === "evaluator")!;
    expect(gen.state).toBe("done");
    expect(ev.state).toBe("running");
  });

  test("#5/allow-done: complete evaluator output raises a visual_review for the human", async () => {
    const { harness, cycle } = await runToEval("gen-eval-complete");
    const ev = cycle.phases[0]!.runs.find((r) => r.role === "evaluator")!;
    const open = harness.ports.repos.questions
      .listByRun(ev.id)
      .filter((q) => q.state === "open");
    expect(open.some((q) => q.kind === "visual_review")).toBe(true);
  });

  test("#2/#3 descope: a gap surfaces a descope Question and stalls the evaluator (not silent)", async () => {
    const { harness, cycle } = await runToEval("gen-eval-descope");
    const ev = cycle.phases[0]!.runs.find((r) => r.role === "evaluator")!;
    // The evaluator run is stalled with a human-readable gap reason (loud).
    expect(ev.state).toBe("stalled");
    expect(ev.failureReason ?? "").toContain("未対応要件");
    // A descope Question reached the human.
    const descopes = harness.ports.repos.questions
      .listByRun(ev.id)
      .filter((q) => q.kind === "descope" && q.state === "open");
    expect(descopes.length).toBe(1);
  });

  test("auto-rework: a gap with NO descope request stalls the evaluator loud and raises NO human card (原則#6)", async () => {
    const { harness, cycle } = await runToEval("gen-eval-gap");
    const ev = cycle.phases[0]!.runs.find((r) => r.role === "evaluator")!;
    // 申請のない gap は人間に出さず、generator の再生成が必要だと loud に stall する。
    expect(ev.state).toBe("stalled");
    expect(ev.failureReason ?? "").toContain("見送り申請なし");
    // No descope / human card is created — the requirement is NOT silently dropped,
    // but it is also NOT surfaced to the human (auto-rework is an AI-only loop).
    const cards = harness.ports.repos.questions
      .listByRun(ev.id)
      .filter((q) => q.state === "open");
    expect(cards.length).toBe(0);
  });

  test("descope → backlog: answering the descope Question creates a backlog Task", async () => {
    const { harness, cycle } = await runToEval("gen-eval-descope");
    const ev = cycle.phases[0]!.runs.find((r) => r.role === "evaluator")!;
    const descope = harness.ports.repos.questions
      .listByRun(ev.id)
      .find((q) => q.kind === "descope" && q.state === "open")!;

    await new InboxService(harness.ports).answerQuestion(descope.id, {
      verdict: "descope",
    });

    const tasks = harness.ports.repos.tasks.listByProject(ProjectId(PID));
    expect(tasks.length).toBe(1);
    expect(tasks[0]!.state).toBe("backlog");

    // No deadlock: the last gap is now an approved 見送り, so the step resolves —
    // evaluator run done, phase done, cycle done (S1 was the only phase).
    const resolved = new CycleService(harness.ports).getCycle(cycle.id);
    const evRun = resolved.phases[0]!.runs.find((r) => r.role === "evaluator")!;
    expect(evRun.state).toBe("done");
    expect(resolved.phases[0]!.state).toBe("done");
    expect(resolved.state).toBe("done");
  });
});

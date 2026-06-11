// S8 #5 — descope approval → backlog Task (S6 descope-policy D-03 / Unit-05).
// Answering a descope Question with "descope" (見送る) or "defer" (後回し) must
// turn the requirement into a backlog Task via proposeTask→acceptProposal (the
// human's verdict IS the INV-5 accept gate). Replaces the S7 D-06 fail-loud stub.
import { describe, test, expect } from "bun:test";
import { buildTestApp } from "../support/harness";
import { buildProject, buildCycle } from "./builders";
import { InboxService } from "../../src/app/services/inbox-service";
import type { QuestionPayload } from "../../src/domain/question/question";
import { raiseQuestion } from "../../src/domain/question/question";
import { QuestionId, RunId, CycleId } from "../../src/domain/shared/ids";
import { instant } from "../../src/domain/shared/primitives";
import { unwrap } from "../../src/domain/shared/result";

const PROJECT = "proj-d";
const CYCLE = "cyc-d";
const RUN = `${CYCLE}-r1`;

function seedDescopeQuestion(deferred = false): {
  ports: ReturnType<typeof buildTestApp>["ports"];
  qid: string;
} {
  const { ports } = buildTestApp();
  ports.uow.run(() => {
    ports.repos.projects.save(buildProject(PROJECT));
    ports.repos.cycles.save(buildCycle(PROJECT, CYCLE, "v0.0.2"));
  });
  const payload: QuestionPayload = {
    kind: "descope",
    requirement: "ダークモード対応",
    aiReason: "今サイクルの主軸外。次サイクルで対応推奨。",
  };
  const q = raiseQuestion({
    id: QuestionId("q-descope"),
    runId: RunId(RUN),
    cycleId: CycleId(CYCLE),
    payload,
    createdAt: unwrap(instant("2026-06-11T00:00:00.000Z")),
  });
  ports.uow.run(() => ports.repos.questions.save(q));
  return { ports, qid: q.id };
}

describe("descopeToBacklog dispatch (見送り承認→backlog)", () => {
  test('verdict "descope" creates a backlog Task from the requirement', async () => {
    const { ports, qid } = seedDescopeQuestion();
    const inbox = new InboxService(ports);

    await inbox.answerQuestion(qid, { verdict: "descope" });

    const tasks = ports.repos.tasks.listByProject(buildProject(PROJECT).id);
    expect(tasks.length).toBe(1);
    expect(tasks[0]!.title as string).toBe("ダークモード対応");
    expect(tasks[0]!.state).toBe("backlog");
  });

  test('verdict "descope" records an accepted proposal (INV-5 gate via human verdict)', async () => {
    const { ports, qid } = seedDescopeQuestion();
    const inbox = new InboxService(ports);

    await inbox.answerQuestion(qid, { verdict: "descope" });

    const proposals = ports.repos.proposals.listByProject(
      buildProject(PROJECT).id,
    );
    expect(proposals.length).toBe(1);
    expect(proposals[0]!.state).toBe("accepted");
    expect(proposals[0]!.rationale as string).toContain("次サイクル");
  });

  test('verdict "defer" (後回し) marks the backlog Task as deferred kind', async () => {
    const { ports, qid } = seedDescopeQuestion(true);
    const inbox = new InboxService(ports);

    await inbox.answerQuestion(qid, { verdict: "defer" });

    const tasks = ports.repos.tasks.listByProject(buildProject(PROJECT).id);
    expect(tasks.length).toBe(1);
    expect(tasks[0]!.kind).toContain("defer");
  });

  test("the descope Question is closed (answered) after backlog creation", async () => {
    const { ports, qid } = seedDescopeQuestion();
    const inbox = new InboxService(ports);

    await inbox.answerQuestion(qid, { verdict: "descope" });

    const q = ports.repos.questions.findById(QuestionId(qid));
    expect(q?.state).toBe("answered");
  });
});

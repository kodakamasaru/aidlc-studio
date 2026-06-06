import { test, expect, describe } from "bun:test";
import { unwrap } from "../shared/result";
import { instant } from "../shared/primitives";
import { TaskId, ProjectId, CycleId, ProposalId } from "../shared/ids";
import {
  type Task,
  addTask,
  reorderTasks,
  assignToCycle,
  completeTask,
  proposeTask,
  acceptProposal,
  rejectProposal,
  makeFinding,
} from "./task";

const at = unwrap(instant("2026-06-06T08:00:00Z"));

const task = (id: string, priority: number): Task =>
  unwrap(
    addTask({
      id: TaskId(id),
      projectId: ProjectId("p1"),
      title: `task ${id}`,
      body: "",
      kind: "feature",
      priority,
      createdAt: at,
    }),
  );

describe("addTask (INV-1)", () => {
  test("creates a backlog task; empty title rejected", () => {
    expect(task("t1", 0).state).toBe("backlog");
    expect(
      addTask({
        id: TaskId("t"),
        projectId: ProjectId("p"),
        title: "  ",
        body: "",
        kind: "x",
        priority: 0,
        createdAt: at,
      }),
    ).toEqual({ ok: false, error: "EmptyTitle" });
  });
});

describe("reorderTasks (INV-3 full order)", () => {
  test("renumbers priority by the given order", () => {
    const tasks = [task("a", 0), task("b", 1), task("c", 2)];
    const out = unwrap(reorderTasks(tasks, [TaskId("c"), TaskId("a"), TaskId("b")]));
    expect(out.map((t) => [t.id as string, t.priority])).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
  });

  test("unknown or missing id is UnknownTaskId", () => {
    const tasks = [task("a", 0), task("b", 1)];
    expect(reorderTasks(tasks, [TaskId("a"), TaskId("z")])).toEqual({
      ok: false,
      error: "UnknownTaskId",
    });
    expect(reorderTasks(tasks, [TaskId("a")])).toEqual({
      ok: false,
      error: "UnknownTaskId",
    });
  });
});

describe("assignToCycle / completeTask (INV-2)", () => {
  test("assigns a backlog task; double assign rejected", () => {
    const assigned = unwrap(assignToCycle(task("t1", 0), CycleId("c1")));
    expect(assigned.state).toBe("assigned");
    expect(assigned.assignedCycleId as string).toBe("c1");
    expect(assignToCycle(assigned, CycleId("c2"))).toEqual({
      ok: false,
      error: "TaskAlreadyAssigned",
    });
  });

  test("completeTask requires assigned", () => {
    expect(completeTask(task("t1", 0))).toEqual({ ok: false, error: "NotAssigned" });
    const assigned = unwrap(assignToCycle(task("t1", 0), CycleId("c1")));
    expect(unwrap(completeTask(assigned)).state).toBe("done");
  });
});

describe("proposals (INV-5: accept gate)", () => {
  const proposal = () =>
    proposeTask({
      id: ProposalId("pr1"),
      source: "ai",
      title: "extract util",
      body: "...",
      rationale: "DRY",
    });

  test("AI proposal is pending and does not become a Task by itself", () => {
    expect(proposal().state).toBe("pending");
  });

  test("acceptProposal turns it into a backlog Task and marks proposal accepted", () => {
    const out = unwrap(
      acceptProposal(proposal(), {
        taskId: TaskId("t9"),
        projectId: ProjectId("p1"),
        kind: "feature",
        priority: 5,
        createdAt: at,
      }),
    );
    expect(out.task.state).toBe("backlog");
    expect(out.task.title as string).toBe("extract util");
    expect(out.proposal.state).toBe("accepted");
  });

  test("accepting or rejecting a closed proposal is ProposalClosed", () => {
    const rejected = unwrap(rejectProposal(proposal()));
    expect(rejected.state).toBe("rejected");
    expect(rejectProposal(rejected)).toEqual({ ok: false, error: "ProposalClosed" });
  });
});

describe("makeFinding", () => {
  test("builds a duplicate finding with a related task", () => {
    expect(
      makeFinding({
        taskId: TaskId("t1"),
        kind: "duplicate",
        note: "same as t2",
        relatedTaskId: TaskId("t2"),
      }),
    ).toEqual({
      taskId: TaskId("t1"),
      kind: "duplicate",
      note: "same as t2",
      relatedTaskId: TaskId("t2"),
    });
  });
});

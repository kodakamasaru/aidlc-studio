// Real-DB integration tests for the SQLite persistence layer. Every test runs
// against an actual bun:sqlite ":memory:" engine (no mocks). Aggregates are
// built via domain factories (see builders.ts).
import { test, expect, describe, beforeEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { openDb } from "../../src/infra/db/open";
import { buildStore } from "../../src/infra/db/store";
import type { Store } from "../../src/infra/db/store";

import {
  ProjectId,
  CycleId,
  RunId,
  TaskId,
  QuestionId,
  LedgerEntryId,
} from "../../src/domain/shared/ids";
import {
  unreconciledCount,
  canStartNextCycleS1,
} from "../../src/domain/external-memory/external-memory";
import {
  T0,
  buildProject,
  buildCycle,
  buildTask,
  buildAssignedTask,
  buildProposal,
  buildQuestion,
  buildFact,
  buildReviewFor,
  buildArtifact,
  buildWikiDoc,
  buildLedgerEntry,
  buildConversation,
} from "./builders";

let db: Database;
let store: Store;

beforeEach(() => {
  db = openDb(":memory:");
  store = buildStore(db);
});

describe("ProjectRepo", () => {
  test("save → findById round-trips and list returns it", () => {
    const project = buildProject("p1");
    store.repos.projects.save(project);

    expect(store.repos.projects.findById(ProjectId("p1"))).toEqual(project);
    expect(store.repos.projects.list()).toEqual([project]);
  });

  test("findById returns undefined when absent", () => {
    expect(store.repos.projects.findById(ProjectId("nope"))).toBeUndefined();
  });

  test("upsert updates rather than duplicating", () => {
    const project = buildProject("p1");
    store.repos.projects.save(project);
    store.repos.projects.save({ ...project });
    expect(store.repos.projects.list()).toHaveLength(1);
  });
});

describe("CycleRepo", () => {
  test("round-trips a cycle with phases + runs", () => {
    const cycle = buildCycle("p1", "c1", "v1.0.0");
    store.repos.cycles.save(cycle);

    const loaded = store.repos.cycles.findById(CycleId("c1"));
    expect(loaded).toEqual(cycle);
    // nested arrays survived serialization
    expect(loaded?.phases).toHaveLength(2);
    expect(loaded?.phases[0]?.runs[0]?.state).toBe("done");
  });

  test("listByProject scopes by project", () => {
    store.repos.cycles.save(buildCycle("p1", "c1", "v1.0.0"));
    store.repos.cycles.save(buildCycle("p1", "c2", "v1.1.0"));
    store.repos.cycles.save(buildCycle("p2", "c3", "v1.0.0"));

    const p1 = store.repos.cycles.listByProject(ProjectId("p1"));
    expect(p1.map((c) => c.id).sort()).toEqual([CycleId("c1"), CycleId("c2")]);
  });

  test("findByProjectVersion returns the right cycle", () => {
    store.repos.cycles.save(buildCycle("p1", "c1", "v1.0.0"));
    store.repos.cycles.save(buildCycle("p1", "c2", "v2.0.0"));

    const found = store.repos.cycles.findByProjectVersion(
      ProjectId("p1"),
      "v2.0.0",
    );
    expect(found?.id).toBe(CycleId("c2"));
  });

  test("UNIQUE(projectId, version) blocks a duplicate version", () => {
    store.repos.cycles.save(buildCycle("p1", "c1", "v1.0.0"));
    expect(() =>
      store.repos.cycles.save(buildCycle("p1", "c2", "v1.0.0")),
    ).toThrow();
  });

  test("same projectId+version is allowed across different projects", () => {
    store.repos.cycles.save(buildCycle("p1", "c1", "v1.0.0"));
    expect(() =>
      store.repos.cycles.save(buildCycle("p2", "c2", "v1.0.0")),
    ).not.toThrow();
  });
});

describe("TaskRepo", () => {
  test("round-trips and saveMany persists all", () => {
    const t1 = buildTask("t1", "p1", 0);
    const t2 = buildTask("t2", "p1", 1);
    store.repos.tasks.saveMany([t1, t2]);

    expect(store.repos.tasks.findById(TaskId("t1"))).toEqual(t1);
    expect(store.repos.tasks.listByProject(ProjectId("p1"))).toHaveLength(2);
  });

  test("listByProject excludes other projects", () => {
    store.repos.tasks.save(buildTask("t1", "p1"));
    store.repos.tasks.save(buildTask("t2", "p2"));
    expect(
      store.repos.tasks.listByProject(ProjectId("p1")).map((t) => t.id),
    ).toEqual([TaskId("t1")]);
  });

  test("listByCycle returns only assigned tasks of that cycle", () => {
    store.repos.tasks.save(buildAssignedTask("t1", "p1", "c1"));
    store.repos.tasks.save(buildAssignedTask("t2", "p1", "c2"));
    store.repos.tasks.save(buildTask("t3", "p1")); // backlog, no cycle

    const c1 = store.repos.tasks.listByCycle(CycleId("c1"));
    expect(c1.map((t) => t.id)).toEqual([TaskId("t1")]);
  });
});

describe("ProposalRepo", () => {
  test("round-trips a proposal", () => {
    const proposal = buildProposal("pr1");
    store.repos.proposals.save(ProjectId("p1"), proposal);
    expect(store.repos.proposals.findById(proposal.id)).toEqual(proposal);
  });

  test("listByProject scopes proposals by project", () => {
    store.repos.proposals.save(ProjectId("p1"), buildProposal("pr1"));
    store.repos.proposals.save(ProjectId("p1"), buildProposal("pr2"));
    store.repos.proposals.save(ProjectId("p2"), buildProposal("pr3"));
    expect(store.repos.proposals.listByProject(ProjectId("p1"))).toHaveLength(2);
    expect(store.repos.proposals.listByProject(ProjectId("p2"))).toHaveLength(1);
  });
});

describe("QuestionRepo", () => {
  test("round-trips multiple payload kinds (question / visual_review / stall_retry)", () => {
    const q1 = buildQuestion("q1", "r1", "c1", {
      kind: "question",
      prompt: "why?",
    });
    const q2 = buildQuestion(
      "q2",
      "r1",
      "c1",
      {
        kind: "visual_review",
        review: buildReviewFor("r1", "c1", "t1", [
          { type: "screenshot", src: "s.png", caption: "home" },
        ]),
      },
      "t1",
    );
    const q3 = buildQuestion("q3", "r1", "c1", {
      kind: "stall_retry",
      runId: RunId("r1"),
      stalledAt: T0,
    });
    store.repos.questions.save(q1);
    store.repos.questions.save(q2);
    store.repos.questions.save(q3);

    expect(store.repos.questions.findById(q1.id)).toEqual(q1);
    expect(store.repos.questions.findById(q2.id)).toEqual(q2);
    expect(store.repos.questions.findById(q3.id)).toEqual(q3);
  });

  test("listByRun and listByCycle scope correctly", () => {
    store.repos.questions.save(
      buildQuestion("q1", "r1", "c1", { kind: "question", prompt: "a" }),
    );
    store.repos.questions.save(
      buildQuestion("q2", "r2", "c1", { kind: "question", prompt: "b" }),
    );
    store.repos.questions.save(
      buildQuestion("q3", "r3", "c2", { kind: "question", prompt: "c" }),
    );

    expect(
      store.repos.questions.listByRun(RunId("r1")).map((q) => q.id),
    ).toEqual([QuestionId("q1")]);
    expect(
      store.repos.questions.listByCycle(CycleId("c1")).map((q) => q.id).sort(),
    ).toEqual([QuestionId("q1"), QuestionId("q2")]);
  });

  test("listOpenByProject joins via cycle and excludes answered/other-project", () => {
    // cycle c1 belongs to p1, c2 belongs to p2
    store.repos.cycles.save(buildCycle("p1", "c1", "v1.0.0"));
    store.repos.cycles.save(buildCycle("p2", "c2", "v1.0.0"));

    const open = buildQuestion("q1", "r1", "c1", {
      kind: "question",
      prompt: "open",
    });
    const answered = {
      ...buildQuestion("q2", "r1", "c1", { kind: "question", prompt: "ans" }),
      state: "answered" as const,
    };
    const dismissed = {
      ...buildQuestion("q4", "r1", "c1", { kind: "question", prompt: "dis" }),
      state: "dismissed" as const,
    };
    const otherProject = buildQuestion("q3", "r9", "c2", {
      kind: "question",
      prompt: "other",
    });
    store.repos.questions.save(open);
    store.repos.questions.save(answered);
    store.repos.questions.save(dismissed);
    store.repos.questions.save(otherProject);

    const inbox = store.repos.questions.listOpenByProject(ProjectId("p1"));
    expect(inbox.map((q) => q.id)).toEqual([QuestionId("q1")]);
  });
});

describe("FactRepo", () => {
  test("round-trips a fact with revisions and listByCycle scopes", () => {
    const f1 = buildFact("f1", "c1", "q1");
    const f2 = buildFact("f2", "c2", "q2");
    store.repos.facts.save(f1);
    store.repos.facts.save(f2);

    const loaded = store.repos.facts.findById(f1.id);
    expect(loaded).toEqual(f1);
    expect(loaded?.revisions).toHaveLength(1);
    expect(
      store.repos.facts.listByCycle(CycleId("c1")).map((f) => f.id),
    ).toEqual([f1.id]);
  });
});

describe("ReviewRepo", () => {
  test("round-trips a review with several block types", () => {
    const review = buildReviewFor("r1", "c1", "t1", [
      { type: "summary", title: "S", body: "b" },
      { type: "ac-map", items: [{ ac: "a", status: "ok" }] },
      { type: "mermaid", src: "graph TD" },
      { type: "screenshot", src: "s.png", caption: "cap" },
    ]);
    store.repos.reviews.save(review);

    const found = store.repos.reviews.findByRunTask(RunId("r1"), TaskId("t1"));
    expect(found).toEqual(review);
    expect(found?.blocks).toHaveLength(4);
  });

  test("findByRunTask distinguishes task-scoped vs cycle-scoped (null)", () => {
    const taskScoped = buildReviewFor("r1", "c1", "t1", [
      { type: "summary", title: "task", body: "b" },
    ]);
    const cycleScoped = buildReviewFor("r1", "c1", undefined, [
      { type: "summary", title: "cycle", body: "b" },
    ]);
    store.repos.reviews.save(taskScoped);
    store.repos.reviews.save(cycleScoped);

    expect(
      store.repos.reviews.findByRunTask(RunId("r1"), TaskId("t1"))?.taskId,
    ).toBe(TaskId("t1"));
    expect(store.repos.reviews.findByRunTask(RunId("r1"), null)?.taskId).toBeNull();
    expect(store.repos.reviews.findByRun(RunId("r1"))).toHaveLength(2);
  });

  test("re-saving a cycle-scoped (taskId null) review for the same run UPDATES, not duplicates", () => {
    const blk = (t: string) => [{ type: "summary" as const, title: t, body: "b" }];
    store.repos.reviews.save(buildReviewFor("r1", "c1", undefined, blk("first")));
    store.repos.reviews.save(buildReviewFor("r1", "c1", undefined, blk("second")));
    // Exactly one cycle-scoped row survives (upsert on UNIQUE(runId, '')).
    expect(store.repos.reviews.findByRun(RunId("r1"))).toHaveLength(1);
    const found = store.repos.reviews.findByRunTask(RunId("r1"), null);
    expect(found?.taskId).toBeNull();
    expect(found?.blocks[0]).toMatchObject({ title: "second" });
  });

  test("listByCycle scopes by cycle", () => {
    store.repos.reviews.save(
      buildReviewFor("r1", "c1", "t1", [
        { type: "summary", title: "x", body: "y" },
      ]),
    );
    store.repos.reviews.save(
      buildReviewFor("r2", "c2", "t2", [
        { type: "summary", title: "x", body: "y" },
      ]),
    );
    expect(store.repos.reviews.listByCycle(CycleId("c1"))).toHaveLength(1);
  });
});

describe("ArtifactRepo", () => {
  test("round-trips and findByPath / listByCycle work", () => {
    const a1 = buildArtifact("c1", "aidlc-docs/s6/code.ts");
    const a2 = buildArtifact("c2", "aidlc-docs/s6/other.ts");
    store.repos.artifacts.save(a1);
    store.repos.artifacts.save(a2);

    expect(store.repos.artifacts.findByPath(a1.path)).toEqual(a1);
    expect(
      store.repos.artifacts.listByCycle(CycleId("c1")).map((a) => a.path),
    ).toEqual([a1.path]);
  });
});

describe("WikiRepo", () => {
  test("save/find by (projectId, section)", () => {
    const doc = buildWikiDoc("aidlc-docs/wiki/ubiquitous.md");
    store.repos.wiki.save(ProjectId("p1"), doc);

    expect(store.repos.wiki.find(ProjectId("p1"), "ubiquitous")).toEqual(doc);
    expect(store.repos.wiki.find(ProjectId("p2"), "ubiquitous")).toBeUndefined();
  });
});

describe("LedgerRepo", () => {
  test("listByCycle + unreconciled / canStartNextCycleS1 over persisted entries", () => {
    store.repos.ledger.save(buildLedgerEntry("l1", "c1", "carried"));
    store.repos.ledger.save(buildLedgerEntry("l2", "c1", "done"));

    const entries = store.repos.ledger.listByCycle(CycleId("c1"));
    expect(entries).toHaveLength(2);
    expect(unreconciledCount(entries)).toBe(1);
    expect(canStartNextCycleS1(entries)).toBe(false);
  });

  test("listByProject joins via cycle and scopes by project", () => {
    store.repos.cycles.save(buildCycle("p1", "c1", "v1.0.0"));
    store.repos.cycles.save(buildCycle("p2", "c2", "v1.0.0"));
    store.repos.ledger.save(buildLedgerEntry("l1", "c1", "done"));
    store.repos.ledger.save(buildLedgerEntry("l2", "c2", "done"));

    const p1 = store.repos.ledger.listByProject(ProjectId("p1"));
    expect(p1.map((e) => e.id)).toEqual([LedgerEntryId("l1")]);
    expect(canStartNextCycleS1(p1)).toBe(true);
  });
});

describe("ConversationRepo", () => {
  test("round-trips a conversation by runId", () => {
    const conv = buildConversation("r1");
    store.repos.conversations.save(ProjectId("p1"), conv);
    const loaded = store.repos.conversations.findByRun(RunId("r1"));
    expect(loaded).toEqual(conv);
    expect(loaded?.turns).toHaveLength(2);
  });
});

describe("UnitOfWork", () => {
  test("a throwing run rolls back ALL writes", () => {
    expect(() =>
      store.uow.run(() => {
        store.repos.projects.save(buildProject("p1"));
        store.repos.tasks.save(buildTask("t1", "p1"));
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(store.repos.projects.findById(ProjectId("p1"))).toBeUndefined();
    expect(store.repos.tasks.findById(TaskId("t1"))).toBeUndefined();
  });

  test("a successful run commits all writes and returns the value", () => {
    const result = store.uow.run(() => {
      store.repos.projects.save(buildProject("p1"));
      store.repos.tasks.save(buildTask("t1", "p1"));
      return "ok";
    });

    expect(result).toBe("ok");
    expect(store.repos.projects.findById(ProjectId("p1"))).toBeDefined();
    expect(store.repos.tasks.findById(TaskId("t1"))).toBeDefined();
  });
});

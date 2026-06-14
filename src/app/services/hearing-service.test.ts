/**
 * BU-3 hearing-service unit tests.
 *
 * Covers: applyHearingAnswerToContracts writes the right field for global + cycle
 * scope; enum vs free field; invalid field / invalid value → error; parseScope;
 * backward-compat (normal questions unaffected).
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { openDb } from "../../infra/db/open";
import { buildStore } from "../../infra/db/store";
import { SeqIdGen } from "../../infra/sys/fakes";
import { openProject } from "../../domain/project/project";
import type { Project, StepDef } from "../../domain/project/project";
import { ProjectId, CycleId } from "../../domain/shared/ids";
import { CANONICAL_STEPS } from "../../domain/shared/vocab";
import { createCycle, version as parseVersion } from "../../domain/cycle/cycle";
import { instant } from "../../domain/shared/primitives";
import { unwrap, isErr } from "../../domain/shared/result";
import {
  applyHearingAnswerToContracts,
  parseScope,
} from "./hearing-service";
import type { Ports } from "../ports/composition";

// ── Test fixtures ────────────────────────────────────────────────────────────

const T0 = unwrap(instant("2026-06-14T00:00:00.000Z"));

let db: Database;
let ports: Pick<Ports, "repos" | "uow">;
let projectId: string;

function buildPipeline(): readonly StepDef[] {
  return CANONICAL_STEPS.map((c, i) => ({
    id: c.id,
    label: c.label,
    order: i,
    skillRef: c.skillRef,
  }));
}

beforeEach(() => {
  db = openDb(":memory:");
  const store = buildStore(db);
  ports = { repos: store.repos, uow: store.uow };

  const pid = ProjectId("proj-1");
  const p = openProject({
    id: pid,
    repoPath: "/tmp/test-repo" as unknown as import("../../domain/project/project").RepoPath,
    vision: "brief.md" as unknown as import("../../domain/project/project").VisionRef,
    pipelineDef: buildPipeline(),
    env: {
      modelName: "claude-opus-4-8",
      worktreeRoot: ".aidlc",
      stallTimeoutMin: 10,
      maxAttempt: 3,
    },
    createdAt: T0,
  });
  if (isErr(p)) throw new Error("openProject failed: " + p.error);
  projectId = pid;
  store.uow.run(() => store.repos.projects.save(p.value));
});

function createTestCycle(): string {
  const ids = new SeqIdGen();
  const cycleId = ids.cycleId();
  const ver = unwrap(parseVersion("v0.0.1"));
  const pipeline = buildPipeline().map((sd) => ({
    phaseId: ids.phaseId(),
    step: sd.id,
    stepDef: { label: sd.label, order: sd.order, skillRef: sd.skillRef },
  }));
  const cycleResult = createCycle({
    id: cycleId,
    projectId: ProjectId(projectId),
    version: ver,
    title: "test cycle",
    taskIds: [],
    createdAt: T0,
    pipeline,
  });
  if (isErr(cycleResult)) throw new Error("createCycle failed: " + cycleResult.error);
  ports.uow.run(() => ports.repos.cycles.save(cycleResult.value));
  return cycleId;
}

// ── parseScope ───────────────────────────────────────────────────────────────

describe("parseScope", () => {
  test("parses 'global' to {kind: 'global'}", () => {
    const scope = parseScope("global");
    expect(scope.kind).toBe("global");
  });

  test("parses 'cycle:abc' to {kind: 'cycle', cycleId: 'abc'}", () => {
    const scope = parseScope("cycle:abc");
    expect(scope.kind).toBe("cycle");
    if (scope.kind === "cycle") expect(scope.cycleId).toBe("abc");
  });

  test("throws 400 for 'cycle:' (empty cycleId)", () => {
    expect(() => parseScope("cycle:")).toThrow();
  });

  test("throws 400 for unknown scope format", () => {
    expect(() => parseScope("unknown")).toThrow();
  });
});

// ── Global scope ─────────────────────────────────────────────────────────────

describe("applyHearingAnswerToContracts — global scope", () => {
  test("writes humanGate.mode=visual_review to project.pipelineDef S1", () => {
    applyHearingAnswerToContracts(
      {
        scope: "global",
        projectId,
        target: { step: "S1", field: "humanGate.mode" },
        choiceId: "visual_review",
      },
      ports,
    );
    const updated = ports.repos.projects.findById(ProjectId(projectId));
    const s1 = updated?.pipelineDef.find((sd) => sd.id === "S1");
    expect(s1?.contracts?.humanGate?.mode).toBe("visual_review");
  });

  test("writes escalation.onStall=retry to project.pipelineDef", () => {
    applyHearingAnswerToContracts(
      {
        scope: "global",
        projectId,
        target: { step: "S1", field: "escalation.onStall" },
        choiceId: "retry",
      },
      ports,
    );
    const updated = ports.repos.projects.findById(ProjectId(projectId));
    const s1 = updated?.pipelineDef.find((sd) => sd.id === "S1");
    expect(s1?.contracts?.escalation?.onStall).toBe("retry");
  });

  test("writes escalation.maxRetry=5 from note", () => {
    applyHearingAnswerToContracts(
      {
        scope: "global",
        projectId,
        target: { step: "S1", field: "escalation.maxRetry" },
        note: "5",
      },
      ports,
    );
    const updated = ports.repos.projects.findById(ProjectId(projectId));
    const s1 = updated?.pipelineDef.find((sd) => sd.id === "S1");
    expect(s1?.contracts?.escalation?.maxRetry).toBe(5);
  });

  test("appends verification.observations", () => {
    applyHearingAnswerToContracts(
      {
        scope: "global",
        projectId,
        target: { step: "S1", field: "verification.observations" },
        note: "成果物が揃っているか確認",
      },
      ports,
    );
    const updated = ports.repos.projects.findById(ProjectId(projectId));
    const s1 = updated?.pipelineDef.find((sd) => sd.id === "S1");
    expect(s1?.contracts?.verification?.observations).toContain("成果物が揃っているか確認");
  });

  test("writes output.profileKind from choiceId", () => {
    applyHearingAnswerToContracts(
      {
        scope: "global",
        projectId,
        target: { step: "S1", field: "output.profileKind" },
        choiceId: "briefing",
      },
      ports,
    );
    const updated = ports.repos.projects.findById(ProjectId(projectId));
    const s1 = updated?.pipelineDef.find((sd) => sd.id === "S1");
    expect(s1?.contracts?.output?.profileKind).toBe("briefing");
  });

  test("throws 404 when project not found", () => {
    expect(() =>
      applyHearingAnswerToContracts(
        {
          scope: "global",
          projectId: "nonexistent",
          target: { step: "S1", field: "humanGate.mode" },
          choiceId: "visual_review",
        },
        ports,
      ),
    ).toThrow();
  });

  test("throws 404 when step not in pipeline", () => {
    expect(() =>
      applyHearingAnswerToContracts(
        {
          scope: "global",
          projectId,
          target: { step: "ZNOTEXIST", field: "humanGate.mode" },
          choiceId: "visual_review",
        },
        ports,
      ),
    ).toThrow();
  });
});

// ── Cycle scope ───────────────────────────────────────────────────────────────

describe("applyHearingAnswerToContracts — cycle scope", () => {
  test("writes humanGate.mode=device_check to cycle S1 phase snapshot", () => {
    const cycleId = createTestCycle();
    applyHearingAnswerToContracts(
      {
        scope: `cycle:${cycleId}`,
        projectId,
        target: { step: "S1", field: "humanGate.mode" },
        choiceId: "device_check",
      },
      ports,
    );
    const updatedCycle = ports.repos.cycles.findById(CycleId(cycleId));
    const s1Phase = updatedCycle?.phases.find((p) => p.step === "S1");
    expect(s1Phase?.stepDef?.contracts?.humanGate?.mode).toBe("device_check");
  });

  test("writes escalation.onStall=human to cycle snapshot", () => {
    const cycleId = createTestCycle();
    applyHearingAnswerToContracts(
      {
        scope: `cycle:${cycleId}`,
        projectId,
        target: { step: "S1", field: "escalation.onStall" },
        choiceId: "human",
      },
      ports,
    );
    const updatedCycle = ports.repos.cycles.findById(CycleId(cycleId));
    const s1Phase = updatedCycle?.phases.find((p) => p.step === "S1");
    expect(s1Phase?.stepDef?.contracts?.escalation?.onStall).toBe("human");
  });

  test("does NOT touch project.pipelineDef when writing cycle scope", () => {
    const cycleId = createTestCycle();
    applyHearingAnswerToContracts(
      {
        scope: `cycle:${cycleId}`,
        projectId,
        target: { step: "S1", field: "humanGate.mode" },
        choiceId: "none",
      },
      ports,
    );
    const proj = ports.repos.projects.findById(ProjectId(projectId));
    const s1 = proj?.pipelineDef.find((sd) => sd.id === "S1");
    // Project pipeline MUST remain unchanged
    expect(s1?.contracts?.humanGate).toBeUndefined();
  });

  test("throws 404 when cycle not found", () => {
    expect(() =>
      applyHearingAnswerToContracts(
        {
          scope: "cycle:nonexistent",
          projectId,
          target: { step: "S1", field: "humanGate.mode" },
          choiceId: "visual_review",
        },
        ports,
      ),
    ).toThrow();
  });
});

// ── Invalid field ─────────────────────────────────────────────────────────────

describe("applyHearingAnswerToContracts — invalid field", () => {
  test("throws 400 when field is not in ALLOWED_TARGET_FIELDS", () => {
    expect(() =>
      applyHearingAnswerToContracts(
        {
          scope: "global",
          projectId,
          target: { step: "S1", field: "output.unknownField" },
          choiceId: "foo",
        },
        ports,
      ),
    ).toThrow();
  });
});

// ── Invalid values ────────────────────────────────────────────────────────────

describe("applyHearingAnswerToContracts — invalid values", () => {
  test("throws when humanGate.mode is an invalid enum value", () => {
    expect(() =>
      applyHearingAnswerToContracts(
        {
          scope: "global",
          projectId,
          target: { step: "S1", field: "humanGate.mode" },
          choiceId: "invalid_mode",
        },
        ports,
      ),
    ).toThrow();
  });

  test("throws when escalation.onStall is an invalid enum value", () => {
    expect(() =>
      applyHearingAnswerToContracts(
        {
          scope: "global",
          projectId,
          target: { step: "S1", field: "escalation.onStall" },
          choiceId: "jump",
        },
        ports,
      ),
    ).toThrow();
  });

  test("throws when escalation.maxRetry is not an integer", () => {
    expect(() =>
      applyHearingAnswerToContracts(
        {
          scope: "global",
          projectId,
          target: { step: "S1", field: "escalation.maxRetry" },
          note: "not-a-number",
        },
        ports,
      ),
    ).toThrow();
  });

  test("throws when output.profileKind has invalid chars", () => {
    expect(() =>
      applyHearingAnswerToContracts(
        {
          scope: "global",
          projectId,
          target: { step: "S1", field: "output.profileKind" },
          choiceId: "bad value with spaces!",
        },
        ports,
      ),
    ).toThrow();
  });

  test("throws when no value provided for humanGate.mode", () => {
    expect(() =>
      applyHearingAnswerToContracts(
        {
          scope: "global",
          projectId,
          target: { step: "S1", field: "humanGate.mode" },
          // neither choiceId nor note
        },
        ports,
      ),
    ).toThrow();
  });
});

import { test, expect, describe } from "bun:test";
import { unwrap } from "../shared/result";
import { instant } from "../shared/primitives";
import { Step } from "../shared/vocab";
import { ProjectId } from "../shared/ids";
import {
  type EnvConfig,
  type StepDef,
  type Project,
  type SkillRef,
  type VisionRef,
  openProject,
  setVision,
  readConfig,
  readPipeline,
  customizePipeline,
} from "./project";

const at = unwrap(instant("2026-06-06T08:00:00Z"));

const env: EnvConfig = {
  modelName: "claude-opus-4-8",
  worktreeRoot: ".worktrees",
  stallTimeoutMin: 10,
  maxAttempt: 3,
};

const step = (id: string, order: number): StepDef => ({
  id: Step(id),
  label: `step ${id}`,
  order,
  skillRef: `kit/skills/aidlc-${id}` as SkillRef,
});

const pipeline = [step("S5", 0), step("S6", 1), step("S7", 2)];

const open = (overrides: Partial<Parameters<typeof openProject>[0]> = {}) =>
  openProject({
    id: ProjectId("p1"),
    repoPath: "/repo",
    vision: "brief.md" as VisionRef,
    pipelineDef: pipeline,
    env,
    createdAt: at,
    ...overrides,
  });

describe("openProject (INV-1/INV-2)", () => {
  test("creates a project from valid env + pipeline", () => {
    const p = unwrap(open());
    expect(p.pipelineDef).toHaveLength(3);
    expect(readConfig(p).maxAttempt).toBe(3);
  });

  test("empty repoPath is EmptyRepoPath", () => {
    expect(open({ repoPath: "  " })).toEqual({ ok: false, error: "EmptyRepoPath" });
  });

  test("invalid env (maxAttempt < 1) is MissingRequiredEnv", () => {
    expect(open({ env: { ...env, maxAttempt: 0 } })).toEqual({
      ok: false,
      error: "MissingRequiredEnv",
    });
  });

  test("empty pipeline is EmptyPipeline", () => {
    expect(open({ pipelineDef: [] })).toEqual({ ok: false, error: "EmptyPipeline" });
  });

  test("duplicate step id is DuplicateStep", () => {
    expect(open({ pipelineDef: [step("S5", 0), step("S5", 1)] })).toEqual({
      ok: false,
      error: "DuplicateStep",
    });
  });
});

describe("readPipeline / customizePipeline (US-27)", () => {
  test("readPipeline returns the per-PJ step definitions", () => {
    const p = unwrap(open());
    expect(readPipeline(p).map((s) => s.id as string)).toEqual(["S5", "S6", "S7"]);
  });

  test("customizePipeline swaps the pipeline when valid", () => {
    const p = unwrap(open());
    const custom = unwrap(customizePipeline(p, [step("A", 0), step("B", 1)]));
    expect(custom.pipelineDef.map((s) => s.id as string)).toEqual(["A", "B"]);
  });

  test("customizePipeline rejects empty pipeline", () => {
    const p = unwrap(open());
    expect(customizePipeline(p, [])).toEqual({ ok: false, error: "EmptyPipeline" });
  });
});

describe("setVision", () => {
  test("updates the vision ref immutably", () => {
    const p0: Project = unwrap(open());
    const p1 = setVision(p0, "brief-v2.md" as VisionRef);
    expect(p1.vision as string).toBe("brief-v2.md");
    expect(p0.vision as string).toBe("brief.md");
  });
});

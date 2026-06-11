import { test, expect, describe } from "bun:test";
import { Step } from "../shared/vocab";
import { openProject, type OpenProjectCmd, type StepDef } from "./project";
import {
  resolveContracts,
  DEFAULT_STEP_CONTRACTS,
  type StepContracts,
} from "./step-contracts";
import { ProjectId } from "../shared/ids";
import { unwrap } from "../shared/result";

const env = {
  modelName: "claude-opus-4-8",
  worktreeRoot: "/tmp/wt",
  stallTimeoutMin: 10,
  maxAttempt: 3,
};

const baseStep = (over: Partial<StepDef> = {}): StepDef => ({
  id: Step("S7"),
  label: "Domain Code",
  order: 6,
  skillRef: "aidlc-s7-domain-code" as StepDef["skillRef"],
  ...over,
});

const contracts: StepContracts = {
  output: { profileKind: "domain-code", artifactGlob: "src/domain/**" },
  verification: { observations: ["framework import なし", "純粋関数のみ"] },
  humanGate: { mode: "none" },
  escalation: { onStall: "retry", maxRetry: 3 },
};

describe("StepDef contracts/execMode are optional (backward compatible)", () => {
  test("openProject accepts a StepDef without contracts/execMode (従来動作)", () => {
    const cmd: OpenProjectCmd = {
      id: ProjectId("p1"),
      repoPath: "/repo",
      vision: "v1" as OpenProjectCmd["vision"],
      pipelineDef: [baseStep()],
      env,
      createdAt: "2026-06-11T00:00:00Z" as OpenProjectCmd["createdAt"],
    };
    const project = unwrap(openProject(cmd));
    expect(project.pipelineDef[0]!.contracts).toBeUndefined();
    expect(project.pipelineDef[0]!.execMode).toBeUndefined();
  });

  test("openProject preserves contracts/execMode when present", () => {
    const cmd: OpenProjectCmd = {
      id: ProjectId("p1"),
      repoPath: "/repo",
      vision: "v1" as OpenProjectCmd["vision"],
      pipelineDef: [baseStep({ contracts, execMode: "parallel" })],
      env,
      createdAt: "2026-06-11T00:00:00Z" as OpenProjectCmd["createdAt"],
    };
    const project = unwrap(openProject(cmd));
    expect(project.pipelineDef[0]!.contracts).toEqual(contracts);
    expect(project.pipelineDef[0]!.execMode).toBe("parallel");
  });
});

describe("resolveContracts (override > default registry)", () => {
  test("pipelineDef override wins over the default registry", () => {
    const registry: Record<string, StepContracts> = {
      S7: { humanGate: { mode: "visual_review" } },
    };
    const resolved = resolveContracts(baseStep({ contracts }), registry);
    expect(resolved).toEqual(contracts);
  });

  test("falls back to the default registry when no override", () => {
    const registry: Record<string, StepContracts> = {
      S7: { humanGate: { mode: "device_check" } },
    };
    const resolved = resolveContracts(baseStep(), registry);
    expect(resolved?.humanGate?.mode).toBe("device_check");
  });

  test("returns undefined when neither override nor registry has it", () => {
    expect(resolveContracts(baseStep())).toBeUndefined();
    expect(DEFAULT_STEP_CONTRACTS).toEqual({});
  });
});

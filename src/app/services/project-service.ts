// project-service — minimal project bootstrap (v0). Cycles require a projectId,
// so this endpoint exists to create the workspace from a repo path + optional
// model. Full project-config UI is v0.0.x; here we synthesize sane defaults for
// the pipeline + env from the single canonical source CANONICAL_STEPS (US-02).
import path from "node:path";
import fs from "node:fs";
import type { Ports } from "../ports/composition";
import { fail } from "./errors";
import {
  openProject,
  customizePipeline,
  readPipeline,
  type Project,
  type StepDef,
  type EnvConfig,
  type VisionRef,
} from "../../domain/project/project";
import type { StepContracts } from "../../domain/project/step-contracts";
import { CANONICAL_STEPS, Step, sameStep } from "../../domain/shared/vocab";
import { ProjectId } from "../../domain/shared/ids";
import { isErr } from "../../domain/shared/result";

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_WORKTREE_ROOT = ".aidlc-worktrees";
const DEFAULT_STALL_TIMEOUT_MIN = 10;
const DEFAULT_MAX_ATTEMPT = 3;
// Vision (brief) ref is required by the domain but not supplied at bootstrap in
// v0; default to the conventional brief path. setVision (v0.0.x) can override.
const DEFAULT_VISION = "aidlc-brief.md" as unknown as VisionRef;

export interface CreateProjectInput {
  readonly repoPath: string;
  readonly name?: string;
  readonly modelName?: string;
}

/**
 * Build the default pipeline from the single canonical source (US-02): each StepDef
 * derives id + 平易ラベル + 実 dir skillRef from CANONICAL_STEPS. No more fake
 * `aidlc-${step}` skillRef and no `label = step` 死蔵.
 */
const defaultPipeline = (): readonly StepDef[] =>
  CANONICAL_STEPS.map((c, index) => ({
    id: c.id,
    label: c.label,
    order: index,
    skillRef: c.skillRef,
  }));

const buildEnv = (modelName: string): EnvConfig => ({
  modelName,
  worktreeRoot: DEFAULT_WORKTREE_ROOT,
  stallTimeoutMin: DEFAULT_STALL_TIMEOUT_MIN,
  maxAttempt: DEFAULT_MAX_ATTEMPT,
});

export class ProjectService {
  constructor(private readonly ports: Ports) {}

  createProject(input: CreateProjectInput): Project {
    // repoPath becomes the worktree base for the live spawner, so reject a path
    // that is not absolute or does not exist on disk before it can reach it.
    if (!path.isAbsolute(input.repoPath) || !fs.existsSync(input.repoPath)) {
      throw fail(400, "InvalidRepoPath");
    }

    const modelName =
      input.modelName !== undefined && input.modelName.trim().length > 0
        ? input.modelName
        : DEFAULT_MODEL;

    const result = openProject({
      id: this.ports.ids.projectId(),
      repoPath: input.repoPath,
      vision: DEFAULT_VISION,
      pipelineDef: defaultPipeline(),
      env: buildEnv(modelName),
      createdAt: this.ports.clock.now(),
    });
    if (isErr(result)) throw fail(400, result.error);

    const project = result.value;
    this.ports.uow.run(() => this.ports.repos.projects.save(project));
    return project;
  }

  getProject(projectId: string): Project {
    const project = this.ports.repos.projects.findById(ProjectId(projectId));
    if (!project) throw fail(404, "ProjectNotFound");
    return project;
  }

  listProjects(): readonly Project[] {
    return this.ports.repos.projects.list();
  }

  /**
   * US-08 (AC-7): グローバル既定パイプラインを任意の StepDef 列で全置換する(人間起点の操作)。
   *
   * - 追加・削除・並べ替え・独自工程(CANONICAL_STEPS に無い id)・instruction をすべて受け付ける。
   * - 内部は `customizePipeline`(非空・id 一意チェック)を通すため、空や重複は ProjectError になる。
   * - 既存サイクルへの影響なし(Phase は作成時点の stepDef snapshot を持つ / S6 INV-S2 と同方針)。
   *
   * `updateStepContracts` との違い: 1 工程だけでなく、工程列全体を一度に差し替える。
   */
  replaceProjectPipeline(projectIdRaw: string, steps: readonly StepDef[]): Project {
    const project = this.getProject(projectIdRaw);
    const result = customizePipeline(project, steps);
    if (isErr(result)) throw fail(400, result.error);
    const next = result.value;
    this.ports.uow.run(() => this.ports.repos.projects.save(next));
    return next;
  }

  /**
   * US-06 (scope I): edit one step's contracts from the UI. Replaces that
   * StepDef's `contracts` in the project's pipelineDef (re-validating via
   * customizePipeline) and persists. The change applies to the NEXT cycle/phase
   * launched (existing cycles snapshot their phases at creation, so running
   * cycles are unaffected). Returns the updated Project.
   */
  updateStepContracts(
    projectIdRaw: string,
    stepIdRaw: string,
    contracts: StepContracts,
  ): Project {
    const project = this.getProject(projectIdRaw);
    const stepId = Step(stepIdRaw);
    const current = readPipeline(project);
    if (!current.some((sd) => sameStep(sd.id, stepId))) {
      throw fail(404, "StepNotInPipeline");
    }
    const updated: StepDef[] = current.map((sd) =>
      sameStep(sd.id, stepId) ? { ...sd, contracts } : sd,
    );
    const result = customizePipeline(project, updated);
    if (isErr(result)) throw fail(400, result.error);
    const next = result.value;
    this.ports.uow.run(() => this.ports.repos.projects.save(next));
    return next;
  }
}

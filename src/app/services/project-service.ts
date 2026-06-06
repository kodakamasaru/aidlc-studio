// project-service — minimal project bootstrap (v0). Cycles require a projectId,
// so this endpoint exists to create the workspace from a repo path + optional
// model. Full project-config UI is v0.0.x; here we synthesize sane defaults for
// the pipeline + env from the shared DEFAULT_STEPS.
import path from "node:path";
import fs from "node:fs";
import type { Ports } from "../ports/composition";
import { fail } from "./errors";
import {
  openProject,
  type Project,
  type StepDef,
  type EnvConfig,
  type VisionRef,
  type SkillRef,
} from "../../domain/project/project";
import { DEFAULT_STEPS } from "../../domain/shared/vocab";
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

/** Build the default pipeline from DEFAULT_STEPS: skillRef = `aidlc-${step}`. */
const defaultPipeline = (): readonly StepDef[] =>
  DEFAULT_STEPS.map((step, index) => ({
    id: step,
    label: step as string,
    order: index,
    skillRef: `aidlc-${step}` as unknown as SkillRef,
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
}

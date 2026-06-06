/**
 * 集約: Project(コンテキストルート)(S5 project.md)。Backlog と Cycle 群を束ねる境界。
 *
 * 純粋(D-03)。パイプラインの定義(pipelineDef)は Project が per-PJ 保持、実体(phases)は Cycle が所有。
 * RepoPath / モデル名等は env 由来(INV-1)。RepoNotFound(FS 検証)は S7 のアダプタ責務。
 */

import { type Result, ok, err } from "../shared/result";
import type { Instant, Text } from "../shared/primitives";
import type { Step } from "../shared/vocab";
import type { ProjectId } from "../shared/ids";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** 対象リポの場所(env から注入。絶対パス埋め込み禁止 = セルフホスト要件)。 */
export type RepoPath = Brand<string, "RepoPath">;
/** Vision(brief)への参照(内容は外部記憶側)。 */
export type VisionRef = Brand<string, "VisionRef">;
/** 対応する kit/skills(aidlc-sN)or PJ 独自スキルへの参照。 */
export type SkillRef = Brand<string, "SkillRef">;

/** モデル名 / worktreeRoot / stall タイムアウト / 最大 attempt 等の横断設定(全集約が read)。 */
export type EnvConfig = {
  readonly modelName: string;
  readonly worktreeRoot: string;
  readonly stallTimeoutMin: number;
  readonly maxAttempt: number; // 既定 3
};

/** 1 工程の定義(意味・並び・対応スキル)。per-PJ 可変(US-27)。 */
export type StepDef = {
  readonly id: Step;
  readonly label: Text;
  readonly order: number;
  readonly skillRef: SkillRef;
};

export type Project = {
  readonly id: ProjectId;
  readonly repoPath: RepoPath;
  readonly vision: VisionRef;
  readonly pipelineDef: readonly StepDef[];
  readonly env: EnvConfig;
  readonly createdAt: Instant;
};

export type ProjectError =
  | "MissingRequiredEnv"
  | "EmptyRepoPath"
  | "EmptyPipeline"
  | "DuplicateStep";

const validEnv = (env: EnvConfig): boolean =>
  env.modelName.trim().length > 0 &&
  env.worktreeRoot.trim().length > 0 &&
  Number.isInteger(env.stallTimeoutMin) &&
  env.stallTimeoutMin >= 1 &&
  Number.isInteger(env.maxAttempt) &&
  env.maxAttempt >= 1;

/** pipelineDef は非空 + StepDef の id が一意(INV-2)。 */
const validatePipeline = (
  steps: readonly StepDef[],
): Result<readonly StepDef[], ProjectError> => {
  if (steps.length === 0) return err("EmptyPipeline");
  const ids = new Set<string>();
  for (const s of steps) {
    if (ids.has(s.id)) return err("DuplicateStep");
    ids.add(s.id);
  }
  return ok(steps);
};

export type OpenProjectCmd = {
  readonly id: ProjectId;
  readonly repoPath: string;
  readonly vision: VisionRef;
  readonly pipelineDef: readonly StepDef[];
  readonly env: EnvConfig;
  readonly createdAt: Instant;
};

/**
 * openProject: env 完全性 + pipeline 妥当性を検証して Project を作る。
 * RepoNotFound(実在 FS チェック)は S7 のアダプタが起動時に行う(ここは形式検証のみ)。
 */
export const openProject = (cmd: OpenProjectCmd): Result<Project, ProjectError> => {
  if (cmd.repoPath.trim().length === 0) return err("EmptyRepoPath");
  if (!validEnv(cmd.env)) return err("MissingRequiredEnv");
  const pipeline = validatePipeline(cmd.pipelineDef);
  if (!pipeline.ok) return pipeline;
  return ok({
    id: cmd.id,
    repoPath: cmd.repoPath as RepoPath,
    vision: cmd.vision,
    pipelineDef: pipeline.value,
    env: cmd.env,
    createdAt: cmd.createdAt,
  });
};

/** setVision: Vision 参照を差し替える。 */
export const setVision = (project: Project, vision: VisionRef): Project => ({
  ...project,
  vision,
});

/** readConfig: 横断設定(全集約が参照)。 */
export const readConfig = (project: Project): EnvConfig => project.env;

/** readPipeline: createCycle が phases 生成に使う工程定義。 */
export const readPipeline = (project: Project): readonly StepDef[] =>
  project.pipelineDef;

/** customizePipeline(US-27 / v0.0.x): pipelineDef を更新(非空・一意 id)。 */
export const customizePipeline = (
  project: Project,
  steps: readonly StepDef[],
): Result<Project, ProjectError> => {
  const pipeline = validatePipeline(steps);
  return pipeline.ok
    ? ok({ ...project, pipelineDef: pipeline.value })
    : pipeline;
};

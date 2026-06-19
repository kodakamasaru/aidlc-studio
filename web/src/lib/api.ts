// Typed fetch client for the Hono studio backend (same-origin /api).
// Response envelope is {success:true,data} | {success:false,error}; success
// unwraps to data, failure throws ApiError(status, code). The TS types here
// mirror the backend domain JSON shapes (ids/instants/text serialize to string).
import { logError } from "./log";

// ── Wire types (mirror src/domain JSON shapes) ───────────────

// US-08: ReconstructionProposal (mirrors src/wire/aidlc-wire.ts shapes)
export type ReconstructionDiff = "keep" | "add" | "delete" | "current";

export interface ReconstructionStep {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly skillRef: string;
  readonly instruction: string;
  readonly diff: ReconstructionDiff;
  readonly reason?: string;
}

export interface ReconstructionProposal {
  readonly scope: "cycle" | "global";
  readonly steps: readonly ReconstructionStep[];
}

export type RunState = "running" | "stalled" | "done" | "failed";
export type PhaseState = "pending" | "running" | "review" | "done";
export type CycleState = "planned" | "active" | "paused" | "done";
/** S6 run-role: generator = 成果物を作る / evaluator = 検証する。欠落 = 従来動作。 */
export type RunRole = "generator" | "evaluator";

export interface Run {
  readonly id: string;
  readonly attempt: number;
  readonly state: RunState;
  readonly role?: RunRole;
  readonly startedAt: string;
  readonly endedAt?: string;
  /** Human-readable reason when the run reached failed/stalled. */
  readonly failureReason?: string;
}

export interface Phase {
  readonly id: string;
  readonly step: string;
  readonly order: number;
  readonly state: PhaseState;
  readonly runs: readonly Run[];
  /**
   * S6 phase-step-snapshot: the step config pinned onto this phase at cycle
   * creation (a copy of the global StepDef taken then). A cycle's settings are
   * THIS snapshot — fixed at creation — not the live project.pipelineDef.
   */
  readonly stepDef?: StepDefSnapshot;
}

/** Mirror of the domain StepDefSnapshot (pinned at cycle creation). */
export interface StepDefSnapshot {
  readonly label: string;
  readonly order: number;
  readonly skillRef: string;
  readonly contracts?: StepContracts;
}

export interface Cycle {
  readonly id: string;
  readonly projectId: string;
  readonly version: string;
  readonly title: string;
  readonly taskIds: readonly string[];
  readonly state: CycleState;
  readonly createdAt: string;
  readonly phases: readonly Phase[];
}

export type HumanGateMode = "visual_review" | "device_check" | "none";
export type EscalationKind = "retry" | "backtrack" | "human";

/** Mirror of the domain StepContracts VO (all sub-contracts optional). */
export interface StepContracts {
  readonly output?: { readonly profileKind?: string; readonly artifactGlob?: string };
  readonly verification?: { readonly observations: readonly string[] };
  readonly humanGate?: { readonly mode: HumanGateMode; readonly note?: string };
  readonly escalation?: {
    readonly onStall: EscalationKind;
    readonly backtrackTo?: string;
    readonly maxRetry?: number;
  };
}

export interface StepDef {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly skillRef: string;
  readonly contracts?: StepContracts;
}

export interface Project {
  readonly id: string;
  readonly repoPath: string;
  readonly vision: string;
  readonly pipelineDef: readonly StepDef[];
  readonly env: {
    readonly modelName: string;
    readonly worktreeRoot: string;
    readonly stallTimeoutMin: number;
    readonly maxAttempt: number;
  };
  readonly createdAt: string;
}

// ── Review block-stream (discriminated by `type`) ────────────
export type ReviewBlock =
  | { readonly type: "summary"; readonly title: string; readonly body: string }
  | {
      readonly type: "ac-map";
      readonly items: readonly { readonly ac: string; readonly status: string }[];
    }
  | { readonly type: "mermaid"; readonly src: string }
  | { readonly type: "screenshot"; readonly src: string; readonly caption: string }
  | { readonly type: "test"; readonly passed: number; readonly total: number; readonly detail?: string }
  | {
      readonly type: "coverage";
      readonly pct: number;
      readonly byFile?: readonly { readonly path: string; readonly pct: number }[];
    }
  | { readonly type: "risk"; readonly level: "low" | "med" | "high"; readonly note: string }
  | {
      readonly type: "diff";
      readonly summary: string;
      readonly files: readonly { readonly path: string; readonly add: number; readonly del: number }[];
    }
  | { readonly type: "video"; readonly src: string; readonly poster: string }
  // Forward-compat: unknown block types must degrade gracefully.
  | { readonly type: string; readonly [key: string]: unknown };

/** Completeness verdict carried on an evaluator Review (requirements ↔ addressed). */
export interface CompletenessBlock {
  readonly requirements: readonly { readonly key: string; readonly text: string }[];
  readonly addressed: readonly string[];
}

/**
 * BU-2: A decision from the aidlc-result envelope (§C7.4).
 * Additive optional — absent on pre-BU-2 reviews.
 */
export interface ResultDecision {
  readonly id: string;
  readonly decision: string;
  readonly reason: string;
}

export interface Review {
  readonly runId: string;
  readonly cycleId: string;
  readonly step: string;
  readonly taskId: string | null;
  readonly blocks: readonly ReviewBlock[];
  readonly producedAt: string;
  /** evaluator 成果のとき completeness table を描画する元データ(scope K)。 */
  readonly completeness?: CompletenessBlock;
  /**
   * BU-2 (v0.0.4 / 加法 optional): aidlc-result エンベロープから搬送された
   * 成果物パス一覧(aidlc-docs 相対パス)。欠落=従来動作。
   */
  readonly artifacts?: readonly string[];
  /**
   * BU-2 (v0.0.4 / 加法 optional): aidlc-result エンベロープから搬送された
   * AI が独自に決めた事項(D-NN)一覧。欠落=従来動作。
   */
  readonly decisions?: readonly ResultDecision[];
}

export type QuestionKind =
  | "question"
  | "visual_review"
  | "device_check"
  | "decision"
  | "backtrack"
  | "stall_retry"
  | "descope"
  // US-08 F-1: 再構成提案の受信箱カード。
  | "reconstruction";

export type QuestionState = "open" | "answered" | "dismissed";

export interface QuestionOption {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly recommended?: boolean;
}

export type QuestionPayload =
  | {
      readonly kind: "question";
      readonly prompt: string;
      readonly options?: readonly QuestionOption[];
    }
  | { readonly kind: "visual_review"; readonly review: Review }
  | { readonly kind: "device_check"; readonly instructions: string }
  | { readonly kind: "decision"; readonly statement: string }
  | { readonly kind: "backtrack"; readonly toStep: string; readonly proposal: string }
  | { readonly kind: "stall_retry"; readonly runId: string; readonly stalledAt: string }
  | {
      readonly kind: "descope";
      readonly requirement: string;
      readonly aiReason: string;
      readonly recommendedStep?: string;
      readonly requirementKey?: string;
    }
  // US-08 F-1: 再構成提案カード。summary は受信箱での 1 行説明。
  | { readonly kind: "reconstruction"; readonly summary: string };

export interface Question {
  readonly id: string;
  readonly runId: string;
  readonly cycleId: string;
  readonly taskId: string | null;
  readonly kind: QuestionKind;
  readonly state: QuestionState;
  readonly payload: QuestionPayload;
  readonly createdAt: string;
}

export interface Fact {
  readonly id: string;
  readonly verdict: string;
  readonly [key: string]: unknown;
}

export interface AnswerResult {
  readonly question: Question;
  readonly fact: Fact;
}

export type Verdict =
  | "answer"
  | "approve"
  | "reject"
  | "confirm"
  // descope 4-choice (S6 descope-policy): つくる / 見送る / 後回し / 前のステップからやり直す.
  | "rework"
  | "descope"
  | "defer"
  | "rewind";

export interface AnswerBody {
  readonly verdict: Verdict;
  readonly body?: string;
  readonly backtrackTo?: string;
  readonly reason?: string;
}

export interface CreateCycleBody {
  readonly title: string;
  /** Optional: omit to let the server auto-assign the next version (patch +1). */
  readonly version?: string;
  readonly taskIds?: readonly string[];
}

export interface CreateProjectBody {
  readonly repoPath: string;
  readonly name?: string;
  readonly modelName?: string;
}

/**
 * BU-3: Result returned by POST /api/hearing/launch.
 * cycle-scope: {scope, cycleId, runId, step} — web navigates to cycle thread.
 * global-scope: {scope:"global", cycleId:"__global_settings__", runId, step}
 *   — web opens the conversation thread for the system cycle (global hearing).
 */
export type HearingLaunchResult = {
  readonly scope: string;
  readonly cycleId: string;
  readonly runId: string;
  readonly step: string;
};

// ── Error ────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    options?: { readonly cause?: unknown },
  ) {
    super(`API ${status}: ${code}`, options);
    this.name = "ApiError";
  }
}

type Envelope<T> = { success: true; data: T } | { success: false; error: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (err) {
    logError(`api ${path}: network error`, err);
    throw new ApiError(0, "NetworkError", { cause: err });
  }

  let envelope: Envelope<T>;
  try {
    envelope = (await res.json()) as Envelope<T>;
  } catch (err) {
    logError(`api ${path}: malformed response (status ${res.status})`, err);
    throw new ApiError(res.status, "MalformedResponse", { cause: err });
  }

  if (!envelope.success) {
    throw new ApiError(res.status, envelope.error);
  }
  return envelope.data;
}

const jsonBody = (data: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(data),
});

// ── Endpoints ────────────────────────────────────────────────
export const api = {
  listProjects: (): Promise<Project[]> => request("/projects"),
  getProject: (projectId: string): Promise<Project> =>
    request(`/projects/${encodeURIComponent(projectId)}`),
  createProject: (body: CreateProjectBody): Promise<Project> =>
    request("/projects", jsonBody(body)),

  listCycles: (projectId: string): Promise<Cycle[]> =>
    request(`/projects/${encodeURIComponent(projectId)}/cycles`),
  createCycle: (projectId: string, body: CreateCycleBody): Promise<Cycle> =>
    request(`/projects/${encodeURIComponent(projectId)}/cycles`, jsonBody(body)),
  getCycle: (cycleId: string): Promise<Cycle> =>
    request(`/cycles/${encodeURIComponent(cycleId)}`),

  startPhase: (cycleId: string, step: string): Promise<Cycle> =>
    request(
      `/cycles/${encodeURIComponent(cycleId)}/phases/${encodeURIComponent(step)}/start`,
      { method: "POST" },
    ),
  retryRun: (cycleId: string, runId: string): Promise<Cycle> =>
    request(
      `/cycles/${encodeURIComponent(cycleId)}/runs/${encodeURIComponent(runId)}/retry`,
      { method: "POST" },
    ),
  // Re-run a phase a backtrack rewound to "running" (US-13). Distinct from
  // startPhase, which only begins a PENDING phase.
  relaunchPhase: (cycleId: string, step: string): Promise<Cycle> =>
    request(
      `/cycles/${encodeURIComponent(cycleId)}/phases/${encodeURIComponent(step)}/relaunch`,
      { method: "POST" },
    ),

  listInbox: (projectId: string): Promise<Question[]> =>
    request(`/projects/${encodeURIComponent(projectId)}/inbox`),
  // Cycle-scoped open questions — SCR-02 polls this to detect "waiting on human".
  getCycleInbox: (cycleId: string): Promise<Question[]> =>
    request(`/cycles/${encodeURIComponent(cycleId)}/inbox`),
  getQuestion: (questionId: string): Promise<Question> =>
    request(`/questions/${encodeURIComponent(questionId)}`),
  answerQuestion: (questionId: string, body: AnswerBody): Promise<AnswerResult> =>
    request(`/questions/${encodeURIComponent(questionId)}/answer`, jsonBody(body)),

  // US-06 (scope I): edit a step's contracts. PATCH so it reads as an in-place
  // update of one step within the project's pipeline.
  updateStepContracts: (
    projectId: string,
    stepId: string,
    contracts: StepContracts,
  ): Promise<Project> =>
    request(
      `/projects/${encodeURIComponent(projectId)}/steps/${encodeURIComponent(stepId)}/contracts`,
      { method: "PATCH", body: JSON.stringify(contracts) },
    ),

  // full-spec: ステップの指示・全文(スキル本文)。対応スキルが無ければ content="".
  getStepSkill: (
    step: string,
  ): Promise<{ readonly skill: string | null; readonly content: string }> =>
    request(`/steps/${encodeURIComponent(step)}/skill`),

  // BU-3: config-hearing run launcher. scope="global" | "cycle:{id}".
  // cycle-scope: returns {scope, cycleId, runId, step}; web navigates to thread.
  // global-scope: returns {scope:"global", cycleId, runId, step}; web opens system cycle thread.
  // projectId is required for scope="global" (scopes the system cycle).
  launchHearing: (scope: string, projectId?: string): Promise<HearingLaunchResult> =>
    request("/hearing/launch", jsonBody({ scope, ...(projectId ? { projectId } : {}) })),

  // US-08: サイクル向け再構成提案を取得。S1 確定後に自動保存される。未生成なら ApiError(404).
  getReconstructionProposal: (cycleId: string): Promise<ReconstructionProposal> =>
    request(`/cycles/${encodeURIComponent(cycleId)}/reconstruction-proposal`),

  // US-08: 承認された工程列でサイクルの pending ステップを置換。
  // diff!=="delete" の ReconstructionStep を StepDef 形式({id,label,order,skillRef,instruction})
  // に写して送る。
  applyCycleReconstruction: (cycleId: string, steps: readonly ReconstructionStep[]): Promise<Cycle> =>
    request(`/cycles/${encodeURIComponent(cycleId)}/reconstruct`, jsonBody({ steps })),

  // US-08 会話で修正: 人間のフィードバックで再構成を再提案させる。新しい提案は非同期で
  // emit されるので、呼び出し側は getReconstructionProposal を polling して差分を待つ。
  reproposeReconstruction: (cycleId: string, feedback: string): Promise<{ reproposed: boolean }> =>
    request(`/cycles/${encodeURIComponent(cycleId)}/reconstruct/repropose`, jsonBody({ feedback })),

  // US-08 AC-7: グローバル既定パイプラインを全置換。
  replaceProjectPipeline: (projectId: string, steps: readonly ReconstructionStep[]): Promise<Project> =>
    request(`/projects/${encodeURIComponent(projectId)}/pipeline`, jsonBody({ steps })),

  // US-06 対話式編集: 要望から契約の提案を取得(適用はしない / 承認時に updateStepContracts)。
  proposeStepContracts: (
    projectId: string,
    stepId: string,
    requestText: string,
  ): Promise<{ readonly current: StepContracts; readonly proposed: StepContracts }> =>
    request(
      `/projects/${encodeURIComponent(projectId)}/steps/${encodeURIComponent(stepId)}/propose`,
      { method: "POST", body: JSON.stringify({ request: requestText }) },
    ),
};

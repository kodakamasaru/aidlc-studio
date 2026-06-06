// Typed fetch client for the Hono studio backend (same-origin /api).
// Response envelope is {success:true,data} | {success:false,error}; success
// unwraps to data, failure throws ApiError(status, code). The TS types here
// mirror the backend domain JSON shapes (ids/instants/text serialize to string).
import { logError } from "./log";

// ── Wire types (mirror src/domain JSON shapes) ───────────────
export type RunState = "running" | "stalled" | "done" | "failed";
export type PhaseState = "pending" | "running" | "review" | "done";
export type CycleState = "planned" | "active" | "paused" | "done";

export interface Run {
  readonly id: string;
  readonly attempt: number;
  readonly state: RunState;
  readonly startedAt: string;
  readonly endedAt?: string;
}

export interface Phase {
  readonly id: string;
  readonly step: string;
  readonly order: number;
  readonly state: PhaseState;
  readonly runs: readonly Run[];
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

export interface StepDef {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly skillRef: string;
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

export interface Review {
  readonly runId: string;
  readonly cycleId: string;
  readonly step: string;
  readonly taskId: string | null;
  readonly blocks: readonly ReviewBlock[];
  readonly producedAt: string;
}

export type QuestionKind =
  | "question"
  | "visual_review"
  | "device_check"
  | "decision"
  | "backtrack"
  | "stall_retry";

export type QuestionState = "open" | "answered" | "dismissed";

export type QuestionPayload =
  | { readonly kind: "question"; readonly prompt: string }
  | { readonly kind: "visual_review"; readonly review: Review }
  | { readonly kind: "device_check"; readonly instructions: string }
  | { readonly kind: "decision"; readonly statement: string }
  | { readonly kind: "backtrack"; readonly toStep: string; readonly proposal: string }
  | { readonly kind: "stall_retry"; readonly runId: string; readonly stalledAt: string };

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

export type Verdict = "answer" | "approve" | "reject" | "confirm";

export interface AnswerBody {
  readonly verdict: Verdict;
  readonly body?: string;
  readonly backtrackTo?: string;
  readonly reason?: string;
}

export interface CreateCycleBody {
  readonly title: string;
  readonly version: string;
  readonly taskIds?: readonly string[];
}

export interface CreateProjectBody {
  readonly repoPath: string;
  readonly name?: string;
  readonly modelName?: string;
}

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

  listInbox: (projectId: string): Promise<Question[]> =>
    request(`/projects/${encodeURIComponent(projectId)}/inbox`),
  // Cycle-scoped open questions — SCR-02 polls this to detect "waiting on human".
  getCycleInbox: (cycleId: string): Promise<Question[]> =>
    request(`/cycles/${encodeURIComponent(cycleId)}/inbox`),
  getQuestion: (questionId: string): Promise<Question> =>
    request(`/questions/${encodeURIComponent(questionId)}`),
  answerQuestion: (questionId: string, body: AnswerBody): Promise<AnswerResult> =>
    request(`/questions/${encodeURIComponent(questionId)}/answer`, jsonBody(body)),
};

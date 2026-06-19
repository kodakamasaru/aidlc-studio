// Test builders — assemble fully-populated domain aggregates via the domain
// factory functions, unwrapping Results with `unwrap`. Ids are plain branded
// strings so each test can pin scope (projectId / cycleId) explicitly.
import { unwrap } from "../../src/domain/shared/result";
import { instant, nonEmptyText } from "../../src/domain/shared/primitives";
import type { Instant, NonEmptyText } from "../../src/domain/shared/primitives";
import { Step } from "../../src/domain/shared/vocab";
import {
  ProjectId,
  CycleId,
  PhaseId,
  RunId,
  TaskId,
  QuestionId,
  FactId,
  ProposalId,
} from "../../src/domain/shared/ids";

import { openProject } from "../../src/domain/project/project";
import type { Project, VisionRef, SkillRef } from "../../src/domain/project/project";
import { createCycle, startPhase, advanceRun, version } from "../../src/domain/cycle/cycle";
import type { Cycle } from "../../src/domain/cycle/cycle";
import { addTask, assignToCycle, proposeTask } from "../../src/domain/task/task";
import type { Task, TaskProposal } from "../../src/domain/task/task";
import { raiseQuestion } from "../../src/domain/question/question";
import type { Question, QuestionPayload } from "../../src/domain/question/question";
import { append } from "../../src/domain/facts/facts";
import type { Fact } from "../../src/domain/facts/facts";
import { buildReview } from "../../src/domain/review/review";
import type { Review, ReviewBlock } from "../../src/domain/review/review";
import {
  indexArtifact,
  docPath,
} from "../../src/domain/external-memory/external-memory";
import type {
  ArtifactRef,
  WikiDoc,
} from "../../src/domain/external-memory/external-memory";

export const T0: Instant = unwrap(instant("2026-01-01T00:00:00.000Z"));
export const T1: Instant = unwrap(instant("2026-01-02T00:00:00.000Z"));

export const text = (s: string): NonEmptyText => unwrap(nonEmptyText(s));

export function buildProject(id: string): Project {
  const vision = "vision/brief.md" as unknown as VisionRef;
  const skill = "kit/skills/aidlc-s1" as unknown as SkillRef;
  return unwrap(
    openProject({
      id: ProjectId(id),
      repoPath: "/repo/target",
      vision,
      pipelineDef: [
        { id: Step("S1"), label: "Inception", order: 0, skillRef: skill },
        { id: Step("S6"), label: "Construction", order: 1, skillRef: skill },
      ],
      env: {
        modelName: "claude",
        worktreeRoot: "/wt",
        stallTimeoutMin: 30,
        maxAttempt: 3,
      },
      createdAt: T0,
    }),
  );
}

/** Cycle with a started + done S1 phase (so phases + runs are populated). */
export function buildCycle(
  projectId: string,
  cycleId: string,
  ver: string,
  taskIds: readonly string[] = [],
): Cycle {
  const created = unwrap(
    createCycle({
      id: CycleId(cycleId),
      projectId: ProjectId(projectId),
      version: unwrap(version(ver)),
      title: `cycle ${ver}`,
      taskIds: taskIds.map(TaskId),
      createdAt: T0,
      pipeline: [
        { phaseId: PhaseId(`${cycleId}-p1`), step: Step("S1") },
        { phaseId: PhaseId(`${cycleId}-p2`), step: Step("S6") },
      ],
    }),
  );
  const started = unwrap(
    startPhase(created, {
      step: Step("S1"),
      runId: RunId(`${cycleId}-r1`),
      startedAt: T0,
    }),
  );
  return unwrap(
    advanceRun(started, { runId: RunId(`${cycleId}-r1`), to: "done", at: T1 }),
  );
}

export function buildTask(id: string, projectId: string, priority = 0): Task {
  return unwrap(
    addTask({
      id: TaskId(id),
      projectId: ProjectId(projectId),
      title: `task ${id}`,
      body: "body",
      kind: "feature",
      priority,
      createdAt: T0,
    }),
  );
}

export function buildAssignedTask(
  id: string,
  projectId: string,
  cycleId: string,
): Task {
  return unwrap(assignToCycle(buildTask(id, projectId), CycleId(cycleId)));
}

export function buildProposal(id: string): TaskProposal {
  return proposeTask({
    id: ProposalId(id),
    source: "ai",
    title: `proposal ${id}`,
    body: "body",
    rationale: "why",
  });
}

export function buildQuestion(
  id: string,
  runId: string,
  cycleId: string,
  payload: QuestionPayload,
  taskId?: string,
): Question {
  return raiseQuestion({
    id: QuestionId(id),
    runId: RunId(runId),
    cycleId: CycleId(cycleId),
    ...(taskId !== undefined ? { taskId: TaskId(taskId) } : {}),
    payload,
    createdAt: T0,
  });
}

export function buildFact(id: string, cycleId: string, questionId: string): Fact {
  return unwrap(
    append({
      id: FactId(id),
      questionId: QuestionId(questionId),
      cycleId: CycleId(cycleId),
      by: "human",
      verdict: "approve",
      statement: "decided",
      at: T0,
    }),
  );
}

export function buildReviewFor(
  runId: string,
  cycleId: string,
  taskId: string | undefined,
  blocks: readonly ReviewBlock[],
): Review {
  return buildReview({
    runId: RunId(runId),
    cycleId: CycleId(cycleId),
    step: Step("S6"),
    ...(taskId !== undefined ? { taskId: TaskId(taskId) } : {}),
    blocks,
    producedAt: T0,
  });
}

export function buildArtifact(cycleId: string, rawPath: string): ArtifactRef {
  return indexArtifact({
    cycleId: CycleId(cycleId),
    step: Step("S6"),
    path: unwrap(docPath(rawPath)),
    kind: "code",
    updatedAt: T0,
  });
}

export function buildWikiDoc(rawPath: string): WikiDoc {
  return { section: "ubiquitous", path: unwrap(docPath(rawPath)), updatedAt: T0 };
}

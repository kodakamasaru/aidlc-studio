/**
 * 集約: Backlog(Task)(S5 task.md)。Task = 開発要求(Question とは別概念)。
 *
 * 純粋(D-03)。AI 出力(TaskProposal / ValidationFinding)は別集約で、accept ゲートを通って
 * 初めて Task 化(INV-5: 生成=AI / 判断=人間)。id・時刻は外部注入(D-04)。
 */

import { type Result, ok, err } from "../shared/result";
import {
  type Instant,
  type NonEmptyText,
  type Text,
  nonEmptyText,
} from "../shared/primitives";
import type { TaskId, ProjectId, CycleId, ProposalId } from "../shared/ids";

/** S2 引き継ぎの Task 種別カテゴリ(自由語彙)。 */
export type TaskKind = string;

export type TaskState = "backlog" | "assigned" | "done";

export type Task = {
  readonly id: TaskId;
  readonly projectId: ProjectId;
  readonly title: NonEmptyText;
  readonly body: Text;
  readonly kind: TaskKind;
  readonly priority: number; // Backlog 内の明示順序(0 始まり)
  readonly state: TaskState;
  readonly assignedCycleId?: CycleId; // assigned のみ
  readonly createdAt: Instant;
};

export type TaskProposal = {
  readonly id: ProposalId;
  readonly source: "ai" | "human";
  readonly title: Text;
  readonly body: Text;
  readonly rationale: Text;
  readonly state: "pending" | "accepted" | "rejected";
};

export type ValidationFinding = {
  readonly taskId: TaskId;
  readonly kind: "duplicate" | "stale";
  readonly note: Text;
  readonly relatedTaskId?: TaskId;
};

export type TaskError =
  | "EmptyTitle"
  | "TaskAlreadyAssigned"
  | "UnknownTaskId"
  | "NotAssigned"
  | "ProposalClosed";

export type AddTaskCmd = {
  readonly id: TaskId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly body: Text;
  readonly kind: TaskKind;
  readonly priority: number;
  readonly createdAt: Instant;
};

/** addTask: Backlog に Task を積む(backlog)。INV-1: title 非空。 */
export const addTask = (cmd: AddTaskCmd): Result<Task, TaskError> => {
  const title = nonEmptyText(cmd.title);
  if (!title.ok) return err("EmptyTitle");
  return ok({
    id: cmd.id,
    projectId: cmd.projectId,
    title: title.value,
    body: cmd.body,
    kind: cmd.kind,
    priority: cmd.priority,
    state: "backlog",
    createdAt: cmd.createdAt,
  });
};

/**
 * reorderTasks: orderedIds の並びで priority を再採番(INV-3: 全順序)。
 * 集合と orderedIds は同一集合でなければならない(UnknownTaskId / 欠落も UnknownTaskId)。
 */
export const reorderTasks = (
  tasks: readonly Task[],
  orderedIds: readonly TaskId[],
): Result<readonly Task[], TaskError> => {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  if (orderedIds.length !== tasks.length) return err("UnknownTaskId");
  const reordered: Task[] = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const t = byId.get(orderedIds[i]!);
    if (!t) return err("UnknownTaskId");
    reordered.push({ ...t, priority: i });
  }
  return ok(reordered);
};

/** assignToCycle: backlog の Task のみ assigned に(INV-2: 二重割り当て禁止)。 */
export const assignToCycle = (
  task: Task,
  cycleId: CycleId,
): Result<Task, TaskError> =>
  task.state !== "backlog"
    ? err("TaskAlreadyAssigned")
    : ok({ ...task, state: "assigned", assignedCycleId: cycleId });

/** completeTask: assigned → done(Cycle 完了で)。 */
export const completeTask = (task: Task): Result<Task, TaskError> =>
  task.state !== "assigned"
    ? err("NotAssigned")
    : ok({ ...task, state: "done" });

// ── AI 提案 / 妥当性指摘(別集約。accept ゲート前) ─────────────
export type ProposeTaskCmd = {
  readonly id: ProposalId;
  readonly source: "ai" | "human";
  readonly title: Text;
  readonly body: Text;
  readonly rationale: Text;
};

/** proposeTask / suggestAssignment: pending な提案を起こす(直接 Task にはならない)。 */
export const proposeTask = (cmd: ProposeTaskCmd): TaskProposal => ({
  id: cmd.id,
  source: cmd.source,
  title: cmd.title,
  body: cmd.body,
  rationale: cmd.rationale,
  state: "pending",
});

export type AcceptProposalCmd = {
  readonly taskId: TaskId;
  readonly projectId: ProjectId;
  readonly kind: TaskKind;
  readonly priority: number;
  readonly createdAt: Instant;
};

/**
 * acceptProposal(人間判断): pending な提案を accept し Task を生成(INV-5)。
 * 提案は accepted に、Task は backlog で生まれる。
 */
export const acceptProposal = (
  proposal: TaskProposal,
  cmd: AcceptProposalCmd,
): Result<{ readonly task: Task; readonly proposal: TaskProposal }, TaskError> => {
  if (proposal.state !== "pending") return err("ProposalClosed");
  const title = nonEmptyText(proposal.title);
  if (!title.ok) return err("EmptyTitle");
  const task: Task = {
    id: cmd.taskId,
    projectId: cmd.projectId,
    title: title.value,
    body: proposal.body,
    kind: cmd.kind,
    priority: cmd.priority,
    state: "backlog",
    createdAt: cmd.createdAt,
  };
  return ok({ task, proposal: { ...proposal, state: "accepted" } });
};

/** rejectProposal: pending な提案を rejected に。 */
export const rejectProposal = (
  proposal: TaskProposal,
): Result<TaskProposal, TaskError> =>
  proposal.state !== "pending"
    ? err("ProposalClosed")
    : ok({ ...proposal, state: "rejected" });

export type FindingCmd = {
  readonly taskId: TaskId;
  readonly kind: "duplicate" | "stale";
  readonly note: Text;
  readonly relatedTaskId?: TaskId;
};

/** validateTasks の 1 件分の妥当性指摘を起こす(重複/陳腐化)。 */
export const makeFinding = (cmd: FindingCmd): ValidationFinding => ({
  taskId: cmd.taskId,
  kind: cmd.kind,
  note: cmd.note,
  ...(cmd.relatedTaskId !== undefined ? { relatedTaskId: cmd.relatedTaskId } : {}),
});

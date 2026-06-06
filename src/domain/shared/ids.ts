/**
 * Branded ID 型(S6 D-05)。異種 id の取り違えを型で防ぐ。
 * 採番はドメインで行わない(S6 D-04)。値は S7 のアダプタが与え、ここでは型付けだけする。
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ProjectId = Brand<string, "ProjectId">;
export type CycleId = Brand<string, "CycleId">;
export type PhaseId = Brand<string, "PhaseId">;
export type RunId = Brand<string, "RunId">;
export type TaskId = Brand<string, "TaskId">;
export type QuestionId = Brand<string, "QuestionId">;
export type FactId = Brand<string, "FactId">;
export type ProposalId = Brand<string, "ProposalId">;
export type LedgerEntryId = Brand<string, "LedgerEntryId">;

/** 外部採番された id 文字列をその brand に型付けする(検証はしない / 純粋)。 */
export const ProjectId = (s: string): ProjectId => s as ProjectId;
export const CycleId = (s: string): CycleId => s as CycleId;
export const PhaseId = (s: string): PhaseId => s as PhaseId;
export const RunId = (s: string): RunId => s as RunId;
export const TaskId = (s: string): TaskId => s as TaskId;
export const QuestionId = (s: string): QuestionId => s as QuestionId;
export const FactId = (s: string): FactId => s as FactId;
export const ProposalId = (s: string): ProposalId => s as ProposalId;
export const LedgerEntryId = (s: string): LedgerEntryId => s as LedgerEntryId;

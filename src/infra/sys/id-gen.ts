// UuidIdGen — production IdGen. Each method returns a fresh crypto.randomUUID()
// wrapped by the matching domain brand constructor. Id minting lives in infra,
// never in the domain (S6 D-04 / S7 D-05).
import type { IdGen } from "../../app/ports/sys";
import type {
  ProjectId,
  CycleId,
  PhaseId,
  RunId,
  TaskId,
  QuestionId,
  FactId,
  ProposalId,
  LedgerEntryId,
} from "../../domain/shared/ids";
import {
  ProjectId as makeProjectId,
  CycleId as makeCycleId,
  PhaseId as makePhaseId,
  RunId as makeRunId,
  TaskId as makeTaskId,
  QuestionId as makeQuestionId,
  FactId as makeFactId,
  ProposalId as makeProposalId,
  LedgerEntryId as makeLedgerEntryId,
} from "../../domain/shared/ids";

export class UuidIdGen implements IdGen {
  projectId(): ProjectId {
    return makeProjectId(crypto.randomUUID());
  }
  cycleId(): CycleId {
    return makeCycleId(crypto.randomUUID());
  }
  phaseId(): PhaseId {
    return makePhaseId(crypto.randomUUID());
  }
  runId(): RunId {
    return makeRunId(crypto.randomUUID());
  }
  taskId(): TaskId {
    return makeTaskId(crypto.randomUUID());
  }
  questionId(): QuestionId {
    return makeQuestionId(crypto.randomUUID());
  }
  factId(): FactId {
    return makeFactId(crypto.randomUUID());
  }
  proposalId(): ProposalId {
    return makeProposalId(crypto.randomUUID());
  }
  ledgerEntryId(): LedgerEntryId {
    return makeLedgerEntryId(crypto.randomUUID());
  }
}

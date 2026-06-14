// buildStore — composition of every SQLite repo + the UnitOfWork against one
// shared bun:sqlite connection. Returned to the composition root / tests as the
// persistence half of `Ports`.
import type { Database } from "bun:sqlite";
import type { Repos } from "../../app/ports/composition";
import type { UnitOfWork } from "../../app/ports/unit-of-work";

import { SqliteUnitOfWork } from "./unit-of-work";
import { SqliteProjectRepo } from "./project-repo";
import { SqliteCycleRepo } from "./cycle-repo";
import { SqliteTaskRepo } from "./task-repo";
import { SqliteProposalRepo } from "./proposal-repo";
import { SqliteQuestionRepo } from "./question-repo";
import { SqliteFactRepo } from "./fact-repo";
import { SqliteReviewRepo } from "./review-repo";
import { SqliteArtifactRepo } from "./artifact-repo";
import { SqliteWikiRepo } from "./wiki-repo";
import { SqliteSessionRepo } from "./session-repo";

export interface Store {
  readonly repos: Repos;
  readonly uow: UnitOfWork;
}

export function buildStore(db: Database): Store {
  const repos: Repos = {
    projects: new SqliteProjectRepo(db),
    cycles: new SqliteCycleRepo(db),
    tasks: new SqliteTaskRepo(db),
    proposals: new SqliteProposalRepo(db),
    questions: new SqliteQuestionRepo(db),
    facts: new SqliteFactRepo(db),
    reviews: new SqliteReviewRepo(db),
    artifacts: new SqliteArtifactRepo(db),
    wiki: new SqliteWikiRepo(db),
    sessions: new SqliteSessionRepo(db),
  };
  return { repos, uow: new SqliteUnitOfWork(db) };
}

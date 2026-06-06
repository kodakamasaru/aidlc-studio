// event-applier — the app-layer DomainEventSink (S7 D-04). The orchestrator
// adapter never writes the DB; it pushes context-tagged DomainEvents here. apply()
// normalizes one emission into aggregate writes inside ONE UnitOfWork transaction,
// then (post-commit) fires best-effort notifications for any raised question.
//
// bun:sqlite transactions are synchronous and cannot nest: apply() opens exactly
// one uow.run and performs all writes there; notify runs AFTER it commits.
import type { Ports } from "../ports/composition";
import type { RunEmission, RunContext } from "../ports/orchestrator";
import {
  raiseQuestion,
  type Question,
} from "../../domain/question/question";
import { buildReview } from "../../domain/review/review";
import { advanceRun } from "../../domain/cycle/cycle";
import {
  docPath,
  indexArtifact,
} from "../../domain/external-memory/external-memory";
import type { DomainEvent } from "../../domain/events/events";
import { isOk, isErr } from "../../domain/shared/result";
import { logError } from "../../infra/log";

type ApplierPorts = Pick<Ports, "clock" | "ids" | "uow" | "repos" | "notify">;

export class EventApplier {
  constructor(private readonly ports: ApplierPorts) {}

  async apply(emission: RunEmission): Promise<void> {
    const { ctx, event } = emission;
    // Questions raised this emission, flushed to notify AFTER commit.
    const raised: Question[] = [];

    // uow.run is synchronous (bun:sqlite); its return value is intentionally unused.
    this.ports.uow.run(() => {
      this.persist(ctx, event, raised);
    });

    // notify is best-effort: it never breaks the run.
    for (const q of raised) {
      try {
        await this.ports.notify.questionRaised(q);
      } catch {
        // swallow — notification is v0.0.x and out of the run's critical path.
      }
    }
  }

  private persist(
    ctx: RunContext,
    event: DomainEvent,
    raised: Question[],
  ): void {
    const { clock, ids, repos } = this.ports;
    switch (event.type) {
      case "RunStateChanged": {
        // running is already set at startPhase; only terminal/stall transitions
        // advance the cycle here.
        if (event.to === "running") return;
        const cycle = repos.cycles.findById(ctx.cycleId);
        if (!cycle) {
          // defensive: cycle missing → nothing to advance, but make it visible.
          logError("RunStateChanged: cycle not found", {
            cycleId: ctx.cycleId,
            runId: ctx.runId,
          });
          return;
        }
        const advanced = advanceRun(cycle, {
          runId: ctx.runId,
          to: event.to,
          at: clock.now(),
        });
        if (isOk(advanced)) repos.cycles.save(advanced.value);
        else logError("RunStateChanged: advanceRun failed", advanced.error);
        return;
      }
      case "QuestionRaised": {
        const q = raiseQuestion({
          id: ids.questionId(),
          runId: ctx.runId,
          cycleId: ctx.cycleId,
          ...(event.taskId !== undefined ? { taskId: event.taskId } : {}),
          payload: event.payload,
          createdAt: clock.now(),
        });
        repos.questions.save(q);
        raised.push(q);
        return;
      }
      case "ResultEmitted": {
        const review = buildReview({
          runId: ctx.runId,
          cycleId: ctx.cycleId,
          step: ctx.step,
          ...(event.taskId !== undefined ? { taskId: event.taskId } : {}),
          blocks: event.blocks,
          producedAt: clock.now(),
        });
        repos.reviews.save(review);
        // US-13: a step's output is presented to the human as a visual-review
        // card. Guard against duplicates: a redelivered/retried ResultEmitted for
        // the same (runId, taskId) must not stack a second open review card. The
        // review row itself upserts on UNIQUE(runId, taskId), so only the card is
        // at risk of duplication.
        // Cycle-scoped reviews carry no task; persisted as null, the event as
        // undefined. Normalize both to undefined so null === undefined matches.
        const eventTask = event.taskId ?? undefined;
        const existingOpenReview = repos.questions
          .listByRun(ctx.runId)
          .some(
            (existing) =>
              existing.state === "open" &&
              existing.kind === "visual_review" &&
              (existing.taskId ?? undefined) === eventTask,
          );
        if (existingOpenReview) return;
        const q = raiseQuestion({
          id: ids.questionId(),
          runId: ctx.runId,
          cycleId: ctx.cycleId,
          ...(event.taskId !== undefined ? { taskId: event.taskId } : {}),
          payload: { kind: "visual_review", review },
          createdAt: clock.now(),
        });
        repos.questions.save(q);
        raised.push(q);
        return;
      }
      case "ArtifactEmitted": {
        const dp = docPath(event.path);
        if (isErr(dp)) {
          // a bad path must not kill the run, but must be visible.
          logError("ArtifactEmitted: bad docPath", { path: event.path });
          return;
        }
        repos.artifacts.save(
          indexArtifact({
            cycleId: ctx.cycleId,
            step: ctx.step,
            path: dp.value,
            kind: event.kind,
            updatedAt: clock.now(),
          }),
        );
        return;
      }
      case "WikiUpdated": {
        const dp = docPath(`wiki/${event.section}.md`);
        if (isErr(dp)) {
          logError("WikiUpdated: bad docPath", { section: event.section });
          return;
        }
        repos.wiki.save(ctx.projectId, {
          section: event.section,
          path: dp.value,
          updatedAt: clock.now(),
        });
        return;
      }
    }
  }
}

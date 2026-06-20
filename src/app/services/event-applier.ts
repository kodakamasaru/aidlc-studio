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
  RECONSTRUCTION_READY_SUMMARY,
  type Question,
} from "../../domain/question/question";
import { buildReview } from "../../domain/review/review";
import { advanceRun } from "../../domain/cycle/cycle";
import { evidenceGateBlockReason } from "./evidence-gate-check";
import {
  docPath,
  indexArtifact,
} from "../../domain/external-memory/external-memory";
import type { DomainEvent } from "../../domain/events/events";
import { isOk, isErr } from "../../domain/shared/result";
import { logError } from "../../infra/log";

type ApplierPorts = Pick<
  Ports,
  "clock" | "ids" | "uow" | "repos" | "notify" | "evidence"
>;

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

  /**
   * True when the run that emitted this event carries a role (generator/
   * evaluator) — i.e. it is part of a gen→gate→eval step the EngineService drives.
   * Role-less runs return false so the legacy auto visual_review still fires.
   */
  private isRoleBearingRun(ctx: RunContext): boolean {
    const cycle = this.ports.repos.cycles.findById(ctx.cycleId);
    if (!cycle) return false;
    for (const phase of cycle.phases) {
      const run = phase.runs.find((r) => r.id === ctx.runId);
      if (run) return run.role !== undefined;
    }
    return false;
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
        // US-01 live-evidence hard gate (role-less path): a technical step
        // (contracts.requiresLiveEvidence) that self-reports done is REJECTED
        // unless its live evidence exists. Block → stall (loud, retriable) so the
        // human never sees a "done" technical step without live evidence on disk.
        if (event.to === "done") {
          const blockReason = evidenceGateBlockReason(this.ports, cycle, ctx);
          if (blockReason !== undefined) {
            const stalled = advanceRun(cycle, {
              runId: ctx.runId,
              to: "stalled",
              at: clock.now(),
              reason: blockReason,
            });
            if (isOk(stalled)) repos.cycles.save(stalled.value);
            else logError("RunStateChanged: evidence-gate stall failed", stalled.error);
            return;
          }
        }
        const advanced = advanceRun(cycle, {
          runId: ctx.runId,
          to: event.to,
          at: clock.now(),
          ...(event.reason !== undefined ? { reason: event.reason } : {}),
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
          // BU-3: thread config-hearing target so inbox-service can write
          // the answer into StepContracts after the human responds (§C7.6).
          ...(event.target !== undefined ? { target: event.target } : {}),
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
          // Carry the evaluator's completeness verdict so the visual_review can
          // render a completeness table (scope K). Absent for generator/role-less.
          ...(event.completeness !== undefined
            ? { completeness: event.completeness }
            : {}),
          // BU-2: carry aidlc-result envelope artifacts + decisions so the web
          // ReviewDetail can render "成果物" and "AI が決めたこと" sections.
          ...(event.artifacts !== undefined ? { artifacts: event.artifacts } : {}),
          ...(event.decisions !== undefined ? { decisions: event.decisions } : {}),
        });
        repos.reviews.save(review);
        // S8 gen→gate→eval: role-bearing runs (generator/evaluator) are driven by
        // the EngineService, which decides whether/when to raise a visual_review
        // (only on the evaluator's allow-done). So the applier raises the legacy
        // auto visual_review ONLY for role-less runs (v0.0.1 single-run flow) —
        // keeping that path byte-for-byte unchanged (backward compatible).
        if (this.isRoleBearingRun(ctx)) return;
        // US-01 live-evidence hard gate (role-less review path): a technical step
        // (requiresLiveEvidence) must not be PRESENTED to the human as ready-for-
        // review without live evidence. Block → stall the run (loud, retriable)
        // and raise NO review card, so "human がレビューする時点で証拠が揃っている".
        {
          const cycle = repos.cycles.findById(ctx.cycleId);
          if (cycle) {
            const blockReason = evidenceGateBlockReason(this.ports, cycle, ctx);
            if (blockReason !== undefined) {
              const stalled = advanceRun(cycle, {
                runId: ctx.runId,
                to: "stalled",
                at: clock.now(),
                reason: blockReason,
              });
              if (isOk(stalled)) repos.cycles.save(stalled.value);
              else logError("ResultEmitted: evidence-gate stall failed", stalled.error);
              return;
            }
          }
        }
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
      case "ReconstructionProposalEmitted": {
        // US-08: persist the proposal keyed by cycleId. One slot per cycle;
        // latest write wins (re-emission on retry overwrites cleanly).
        repos.reconstructionProposals.save(ctx.cycleId, event.proposal);

        // US-08 F-1 / S10: surface the reconstruction inbox card with the "ready"
        // wording. The F-17 gate card was raised UP FRONT (before this run finished)
        // with a PENDING title that does NOT invite confirmation — there was nothing
        // to confirm yet. Now the proposal exists, so FLIP that same card's title to
        // RECONSTRUCTION_READY_SUMMARY (re-save by id; the repo upserts ON CONFLICT)
        // and notify. We must NOT early-return on the existing card (the old guard
        // did) — that left it stuck on the misleading "確認してください" wording forever.
        const existingOpen = repos.questions
          .listByCycle(ctx.cycleId)
          .find(
            (existing) =>
              existing.state === "open" && existing.kind === "reconstruction",
          );
        const q: Question = existingOpen
          ? {
              ...existingOpen,
              payload: {
                kind: "reconstruction",
                summary: RECONSTRUCTION_READY_SUMMARY,
              },
            }
          : raiseQuestion({
              id: ids.questionId(),
              runId: ctx.runId,
              cycleId: ctx.cycleId,
              payload: {
                kind: "reconstruction",
                summary: RECONSTRUCTION_READY_SUMMARY,
              },
              createdAt: clock.now(),
            });
        repos.questions.save(q);
        raised.push(q);
        return;
      }
    }
  }
}

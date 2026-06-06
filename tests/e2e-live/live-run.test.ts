// Real-AI integration test (S7 Phase 5b). This exercises the REAL locally
// installed Claude Code CLI through the REAL app layer against a REAL bun:sqlite
// DB — additive to, and NOT replacing, the deterministic suite. It is excluded
// from the default `test` script; run it via `bun run test:live`.
//
// Flow: createProject → createCycle → startPhase(S1) launches the live adapter,
// which spawns `claude -p` in the repo, parses its stream-json, emits
// ResultEmitted+done through the EventApplier sink, which persists a Review and
// raises a visual_review Question. We poll the cycle until the run is terminal,
// then assert real model text was persisted and surfaced as a reviewable card.
import { test, expect, describe } from "bun:test";
import { openDb } from "../../src/infra/db/open";
import { buildStore } from "../../src/infra/db/store";
import { SystemClock } from "../../src/infra/sys/clock";
import { UuidIdGen } from "../../src/infra/sys/id-gen";
import { EventApplier } from "../../src/app/services/event-applier";
import { LiveClaudeOrchestrator } from "../../src/infra/orchestrator/live";
import { ProjectService } from "../../src/app/services/project-service";
import { CycleService } from "../../src/app/services/cycle-service";
import { InboxService } from "../../src/app/services/inbox-service";
import type { Ports } from "../../src/app/ports/composition";
import type { DomainEventSink } from "../../src/app/ports/orchestrator";
import type { NotifyPort } from "../../src/app/ports/notify";
import type { Cycle } from "../../src/domain/cycle/cycle";
import { RunId } from "../../src/domain/shared/ids";

const REPO_ROOT = "/Users/mac/ghq/github.com/kodakamasaru/aidlc-studio";
const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 150_000;
const SCRIPTED_CONSTANT = "Deterministic scripted result.";

const claudeBin = Bun.which("claude");

const noopNotify: NotifyPort = {
  questionRaised(): void {
    /* no-op */
  },
};

/** Latest run across all phases of the cycle (the one startPhase just created). */
function latestRun(cycle: Cycle): { id: string; state: string } | undefined {
  let latest: { id: string; state: string } | undefined;
  for (const phase of cycle.phases) {
    for (const run of phase.runs) {
      latest = { id: run.id as string, state: run.state as string };
    }
  }
  return latest;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const suite = claudeBin ? describe : describe.skip;

suite("LiveClaudeOrchestrator — real local Claude run", () => {
  test(
    "real claude run → done → Review + visual_review Question persisted",
    async () => {
      // Real ports bundle over a real in-memory bun:sqlite engine.
      const db = openDb(":memory:");
      const store = buildStore(db);
      const clock = new SystemClock();
      const ids = new UuidIdGen();

      const applier = new EventApplier({
        clock,
        ids,
        uow: store.uow,
        repos: store.repos,
        notify: noopNotify,
      });
      const sink: DomainEventSink = (e) => applier.apply(e);

      const orchestrator = new LiveClaudeOrchestrator({ sink });

      const ports: Ports = {
        clock,
        ids,
        uow: store.uow,
        repos: store.repos,
        orchestrator,
        notify: noopNotify,
      };

      const projects = new ProjectService(ports);
      const cycles = new CycleService(ports);
      const inbox = new InboxService(ports);

      // createProject → createCycle → startPhase(first step).
      const project = projects.createProject({ repoPath: REPO_ROOT });
      const firstStep = project.pipelineDef[0]!.id as string;
      const cycle = cycles.createCycle(project.id as string, {
        title: "live-run",
        version: "v0.0.1",
      });

      // startPhase awaits the live launch, which runs claude to completion and
      // emits ResultEmitted+done before resolving — so the run is already
      // terminal once this returns. We still poll defensively.
      await cycles.startPhase(cycle.id as string, firstStep);

      // Poll the persisted cycle until the latest run reaches a terminal state.
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let run = latestRun(cycles.getCycle(cycle.id as string));
      while (
        run !== undefined &&
        run.state !== "done" &&
        run.state !== "failed" &&
        Date.now() < deadline
      ) {
        await sleep(POLL_INTERVAL_MS);
        run = latestRun(cycles.getCycle(cycle.id as string));
      }

      expect(run).toBeDefined();
      // Real claude must have succeeded (NOT failed/stalled/timeout).
      expect(run!.state).toBe("done");

      // A Review was persisted from the real ResultEmitted with non-empty,
      // non-scripted real model text.
      const reviews = store.repos.reviews.findByRun(RunId(run!.id));
      expect(reviews.length).toBeGreaterThan(0);
      const summary = reviews
        .flatMap((r) => r.blocks)
        .find((b) => b.type === "summary");
      expect(summary).toBeDefined();
      const body = summary && summary.type === "summary" ? summary.body : "";
      expect(typeof body).toBe("string");
      expect(body.trim().length).toBeGreaterThan(10); // real sentence, not empty.
      expect(body).not.toBe(SCRIPTED_CONSTANT); // proves it is real model text.
      // Surface the persisted real sentence for the test report.
      console.error(`[live-run] persisted model sentence: ${body}`);

      // The sink raised a visual_review Question from the real ResultEmitted.
      const open = inbox.listInbox(project.id as string);
      const visualReview = open.find((q) => q.payload.kind === "visual_review");
      expect(visualReview).toBeDefined();
    },
    POLL_TIMEOUT_MS + 30_000,
  );
});

if (!claudeBin) {
  // Make the skip reason explicit in the runner output.
  console.error(
    "[live-run] SKIPPED: `claude` binary not found on PATH (Bun.which).",
  );
}

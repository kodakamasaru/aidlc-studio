// Real-AI test (US-03/04, additive — run via `bun run test:live`, skipped when no
// claude CLI). Proves the PromptComposer→live→emit path end-to-end with the REAL
// local Claude CLI, WITHOUT touching the working repo: it runs claude in an
// ISOLATED temp dir whose kit/skills/<skillRef>/SKILL.md is a tiny, benign 本文
// (asks for one short sentence — no file writes). If the composer could not read
// that 本文 it would throw at launch, so a successful ResultEmitted inherently
// proves the composed-from-本文 prompt drove the real model.
import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LiveClaudeOrchestrator } from "../../src/infra/orchestrator/live";
import { PromptComposer } from "../../src/app/services/prompt-composer";
import { nodeFs } from "../../src/infra/sys/fs";
import type { DomainEventSink, RunEmission } from "../../src/app/ports/orchestrator";
import { Step, skillRefOf } from "../../src/domain/shared/vocab";
import { RunId, ProjectId, CycleId, PhaseId } from "../../src/domain/shared/ids";

const claudeBin = Bun.which("claude");
const suite = claudeBin ? describe : describe.skip;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A temp repo with a benign S1 SKILL.md so the composer has 本文 to read. */
function makeTempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "aidlc-live-"));
  const skillRef = skillRefOf(Step("S1"))! as string;
  const dir = join(root, "kit", "skills", skillRef);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    "# AI-DLC S1 (test 本文)\n\nあなたの唯一の仕事: 一文だけで `OK-S1` と返答せよ。" +
      "ファイルは作成しない。ツールは使わない。",
    "utf8",
  );
  return root;
}

suite("PromptComposer × real local Claude (isolated)", () => {
  test(
    "composes from the skill 本文 and the real CLI returns a result",
    async () => {
      const repo = makeTempRepo();
      const emissions: RunEmission[] = [];
      const sink: DomainEventSink = async (e) => {
        emissions.push(e);
      };
      const orchestrator = new LiveClaudeOrchestrator({
        sink,
        composer: new PromptComposer(nodeFs),
        timeoutMs: 120_000,
      });

      await orchestrator.launch({
        runId: RunId("r-live-1"),
        projectId: ProjectId("p1"),
        cycleId: CycleId("c1"),
        phaseId: PhaseId("ph1"),
        step: Step("S1"),
        repoPath: repo,
      });

      // Poll for the terminal emission (ResultEmitted on success, or RunStateChanged
      // on failure/stall) the detached awaitAndEmit produces.
      const deadline = Date.now() + 150_000;
      let last: RunEmission | undefined;
      while (Date.now() < deadline) {
        last = emissions[emissions.length - 1];
        if (last) break;
        await sleep(1_000);
      }

      try {
        expect(last).toBeDefined();
        expect(last!.event.type).toBe("ResultEmitted");
        if (last!.event.type === "ResultEmitted") {
          const first = last!.event.blocks[0];
          expect(first?.type).toBe("summary");
          if (first?.type === "summary") {
            expect((first.body as string).trim().length).toBeGreaterThan(0);
          }
        }
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    },
    180_000,
  );
});

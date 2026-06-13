// Real-AI test (US-04 + US-05, additive — `bun run test:live`, skipped without the
// claude CLI). Proves the EVALUATOR live run goes end-to-end with the REAL local
// Claude (the gap the user flagged at S10): a real evaluator run
//   → emits a parseable `completeness` verdict (US-04: extractCompleteness succeeds)
//   → emits a verify-ui `screenshot` review block (US-05).
// Isolated: a temp repo (benign SKILL.md) + a real Playwright capture of a data: URL,
// so it touches neither the working repo nor a running app.
import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LiveClaudeOrchestrator } from "../../src/infra/orchestrator/live";
import { PromptComposer } from "../../src/app/services/prompt-composer";
import { PlaywrightCapturer } from "../../src/infra/screenshot/playwright-capturer";
import { nodeFs } from "../../src/infra/sys/fs";
import type { DomainEventSink, RunEmission } from "../../src/app/ports/orchestrator";
import { Step, skillRefOf } from "../../src/domain/shared/vocab";
import { RunId, ProjectId, CycleId, PhaseId } from "../../src/domain/shared/ids";
import type { Text } from "../../src/domain/shared/primitives";

const claudeBin = Bun.which("claude");
const suite = claudeBin ? describe : describe.skip;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function makeTempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "aidlc-eval-"));
  const dir = join(root, "kit", "skills", skillRefOf(Step("S1"))! as string);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    "# AI-DLC S1 評価(test 本文)\n\n生成物が各要件を満たすか検証する。" +
      "プロンプト末尾の指示どおり、最後に requirements/addressed の JSON を 1 つだけ出力せよ。",
    "utf8",
  );
  return root;
}

suite("Evaluator live run × real Claude (isolated): completeness + screenshot", () => {
  test(
    "real evaluator emits a parseable completeness verdict AND a screenshot block",
    async () => {
      const repo = makeTempRepo();
      const shotsDir = mkdtempSync(join(tmpdir(), "aidlc-eval-shots-"));
      const emissions: RunEmission[] = [];
      const sink: DomainEventSink = async (e) => {
        emissions.push(e);
      };
      const orchestrator = new LiveClaudeOrchestrator({
        sink,
        composer: new PromptComposer(nodeFs),
        // US-05: a real Playwright capture of a stable data: URL (no running app).
        capturer: new PlaywrightCapturer({ timeoutMs: 60_000 }),
        verifyUrl: "data:text/html,<h1 style='font-size:64px'>verify-ui</h1>",
        shotsDir,
        shotUrlBase: "/api/screenshots",
        timeoutMs: 120_000,
      });

      await orchestrator.launchEval({
        runId: RunId("r-eval-1"),
        projectId: ProjectId("p1"),
        cycleId: CycleId("c1"),
        phaseId: PhaseId("ph1"),
        step: Step("S1"),
        generatorRunId: RunId("r-gen-1"),
        verification: ["一覧が表示される", "空状態が表示される"] as unknown as Text[],
        repoPath: repo,
      });

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
          // US-04: the real evaluator's verdict parsed into a CompletenessBlock.
          expect(last!.event.completeness).toBeDefined();
          expect(Array.isArray(last!.event.completeness?.requirements)).toBe(true);
          // US-05: a verify-ui screenshot block, served from the real captured png.
          const shot = last!.event.blocks.find((b) => b.type === "screenshot");
          expect(shot).toBeDefined();
          if (shot?.type === "screenshot") {
            expect(shot.src as string).toContain("/api/screenshots/");
          }
        }
      } finally {
        rmSync(repo, { recursive: true, force: true });
        rmSync(shotsDir, { recursive: true, force: true });
      }
    },
    180_000,
  );
});

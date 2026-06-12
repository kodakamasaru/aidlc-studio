// Real-capture test (US-05, additive — run via `bun run test:live`, skipped when
// Playwright isn't installed). Proves the PlaywrightCapturer actually drives the
// Playwright CLI (Bun.spawn) and writes a real png to disk. Captures a stable
// data: URL (no running app needed) so it's reproducible; the full live run →
// review-block path is exercised by the deterministic screenshot-block test + the
// manual app-capture validation recorded in s8-integration.md.
import { test, expect, describe } from "bun:test";
import { mkdtempSync, existsSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PlaywrightCapturer } from "../../src/infra/screenshot/playwright-capturer";

const hasPlaywright = Bun.which("bunx") !== null;
const suite = hasPlaywright ? describe : describe.skip;

suite("PlaywrightCapturer — real screenshot (isolated)", () => {
  test(
    "captures a page to a real png on disk",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "aidlc-shot-"));
      const out = join(dir, "r1.png");
      const capturer = new PlaywrightCapturer({ timeoutMs: 60_000 });
      try {
        const result = await capturer.capture({
          url: "data:text/html,<h1 style='font-size:64px'>verify-ui</h1>",
          outPath: out,
        });
        expect(result.ok).toBe(true);
        expect(existsSync(out)).toBe(true);
        expect(statSync(out).size).toBeGreaterThan(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    90_000,
  );
});

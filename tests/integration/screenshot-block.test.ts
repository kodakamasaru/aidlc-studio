// US-05 — deterministic checks for the verify-ui screenshot review block mapping:
// a successful capture → a `screenshot` block whose src is the served URL of the
// real png; a failed capture → an empty-src block carrying the reason (placeholder,
// NOT a silent empty / 原則④). The real Playwright capture is the additive live test.
import { test, expect, describe } from "bun:test";
import { screenshotBlockFrom } from "../../src/infra/orchestrator/live";
import type { CaptureResult } from "../../src/app/ports/screenshot";

describe("screenshotBlockFrom (US-05)", () => {
  test("ok capture → screenshot block with the served URL src", () => {
    const ok: CaptureResult = { ok: true, path: "/abs/.verify-screenshots/r1.png" };
    const block = screenshotBlockFrom(ok, "/api/screenshots", "r1.png");
    expect(block.type).toBe("screenshot");
    if (block.type === "screenshot") {
      expect(block.src).toBe("/api/screenshots/r1.png"); // root-relative → web renders it
      expect((block.caption as string).length).toBeGreaterThan(0);
    }
  });

  test("failed capture → placeholder block (empty src) carrying the reason", () => {
    const fail: CaptureResult = { ok: false, reason: "playwright exited 1: timeout" };
    const block = screenshotBlockFrom(fail, "/api/screenshots", "r1.png");
    expect(block.type).toBe("screenshot");
    if (block.type === "screenshot") {
      expect(block.src).toBe(""); // empty → web ScreenshotFigure shows placeholder
      expect(block.caption as string).toContain("取得失敗");
      expect(block.caption as string).toContain("timeout"); // reason surfaced, not silent
    }
  });
});

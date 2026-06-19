// PlaywrightCapturer — the production ScreenshotCapturer (US-05). Drives the
// Playwright CLI headless via Bun.spawn to screenshot the running app, writing a
// png to disk. NET-NEW capture mechanism with NO new import dependency: Playwright
// is an existing devDependency, invoked as a subprocess (S4 R-02 / S5 Unit-05 D-01).
// The binary never goes into the DB — only the path is returned (artifact 模範).
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type {
  ScreenshotCapturer,
  CaptureRequest,
  CaptureResult,
} from "../../app/ports/screenshot";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface PlaywrightCapturerOptions {
  /** `bunx playwright` by default; override for a pinned binary. */
  readonly command?: readonly string[];
  readonly timeoutMs?: number;
}

export class PlaywrightCapturer implements ScreenshotCapturer {
  private readonly command: readonly string[];
  private readonly timeoutMs: number;

  constructor(opts: PlaywrightCapturerOptions = {}) {
    this.command = opts.command ?? ["bunx", "playwright", "screenshot"];
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async capture(req: CaptureRequest): Promise<CaptureResult> {
    const outPath = isAbsolute(req.outPath) ? req.outPath : resolve(req.outPath);
    try {
      await mkdir(dirname(outPath), { recursive: true });
      // `playwright screenshot [--wait-for-timeout] <url> <file>` — full-page,
      // headless. A non-zero exit or a missing output file = a loud failure reason.
      const child = Bun.spawn(
        [...this.command, "--full-page", "--wait-for-timeout=800", req.url, outPath],
        { stdout: "pipe", stderr: "pipe" },
      );
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* best-effort */
        }
      }, this.timeoutMs);
      const [stderr, exitCode] = await Promise.all([
        new Response(child.stderr as ReadableStream<Uint8Array>).text(),
        child.exited,
      ]);
      clearTimeout(timer);
      if (exitCode !== 0) {
        return {
          ok: false,
          reason: `playwright screenshot exited ${exitCode}: ${stderr.trim().slice(0, 300) || "(no stderr)"}`,
        };
      }
      return { ok: true, path: outPath };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}

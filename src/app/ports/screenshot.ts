// ScreenshotCapturer — the verify-ui capture boundary (v0.0.3 US-05). A live run's
// evaluator captures a real screenshot of the running app as visual evidence, so a
// human can approve WITHOUT reading code (原則③ / 視覚確認). The image is referenced
// by PATH only (artifact 模範 / US-01 boundary): the capturer writes a png to disk
// and returns its path; the binary never goes into the DB or a DomainEvent.
//
// Injected so the live adapter stays testable: production drives Playwright
// (Bun.spawn), tests use a fake that returns a pinned path / failure.

export interface CaptureRequest {
  /** URL of the running app to screenshot (verify-ui subject). */
  readonly url: string;
  /** Absolute output path for the png (under aidlc-docs/…/screenshots per US-05). */
  readonly outPath: string;
}

/** Capture result: ok with the written path, or a loud failure reason (no silent empty / 原則④). */
export type CaptureResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: string };

export interface ScreenshotCapturer {
  capture(req: CaptureRequest): Promise<CaptureResult>;
}

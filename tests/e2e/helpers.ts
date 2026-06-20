// Shared E2E helpers: stable screenshot paths under aidlc-docs/s7/screenshots/
// (the S7 visual deliverable, named to match the s2.5 state names), plus a few
// flows reused across specs (first-run repo setup).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url)); // tests/e2e
export const REPO_ROOT = join(here, "..", "..");
export const SHOTS_DIR = join(REPO_ROOT, "aidlc-docs", "s7", "screenshots");
// S9 (Validation) visual evidence for v0.0.2, kept separate from the v0.0.1 S7
// shots so the S9 deliverable is self-contained. Each name is keyed to the US
// it proves (us-06 / us-02 / us-03 / us-07).
export const SHOTS_DIR_S9 = join(
  REPO_ROOT,
  "aidlc-docs",
  "v0.0.2",
  "s9",
  "screenshots",
);

// An absolute, existing directory to register as the project repo (D-06: the
// repo IS the project). The repo root itself is the safest always-present path.
export const EXISTING_REPO_PATH = REPO_ROOT;

/**
 * Full-page screenshot into the S7 deliverable dir under a stable name.
 * `animations: "disabled"` fast-forwards CSS animations (e.g. the review
 * block-stream's staggered fade-slide-up entrance) to their END state, so the
 * artifact always shows the settled screen rather than a mid-entrance frame.
 */
export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SHOTS_DIR, name),
    fullPage: true,
    animations: "disabled",
  });
}

/** Same as `shot`, but writes into the v0.0.2 S9 evidence dir. */
export async function shotS9(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SHOTS_DIR_S9, name),
    fullPage: true,
    animations: "disabled",
  });
}

export const SHOTS_DIR_S9V004 = join(
  REPO_ROOT,
  "aidlc-docs",
  "v0.0.4",
  "s9",
  "screenshots",
);

/** Same as `shot`, but writes into the v0.0.4 S9 evidence dir. */
export async function shotS9v004(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SHOTS_DIR_S9V004, name),
    fullPage: true,
    animations: "disabled",
  });
}

export const SHOTS_DIR_S9V005 = join(
  REPO_ROOT,
  "aidlc-docs",
  "v0.0.5",
  "s9",
  "screenshots",
);

/** Same as `shot`, but writes into the v0.0.5 S9 evidence dir. */
export async function shotS9v005(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SHOTS_DIR_S9V005, name),
    fullPage: true,
    animations: "disabled",
  });
}

/**
 * Resolve the first-run state: if the repo-setup form is showing (no project
 * yet), register `EXISTING_REPO_PATH` so the app advances into the cycle list.
 * Idempotent — when a project already exists the form is absent and this no-ops.
 */
export async function ensureProject(page: Page): Promise<void> {
  const repoInput = page.getByLabel("リポジトリパス");
  if (await repoInput.isVisible().catch(() => false)) {
    await repoInput.fill(EXISTING_REPO_PATH);
    await page.getByRole("button", { name: "リポジトリを登録" }).click();
    // After registration the cycle-list "新規 Cycle" affordance appears (the
    // empty list renders both a topbar button and an empty-state CTA → .first()).
    await expect(
      page.getByRole("button", { name: /新規サイクル|最初のサイクルを作る/ }).first(),
    ).toBeVisible();
  }
}

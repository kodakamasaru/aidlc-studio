// stalled.spec.ts — the stalled + retry surface (SCR-02).
//
// Targets the stall-first server (absolute http://127.0.0.1:8892) whose
// ScriptedOrchestrator stalls the run on launch. We register a project + cycle
// and start the first phase through the UI; SCR-02 must show the stalled state
// with a retry affordance (scr-02.stalled). Clicking retry starts a fresh
// attempt — under stall-first a retry raises a question, so the run goes back to
// running and a Q card appears.
import { test, expect } from "@playwright/test";
import { ensureProject, shot } from "./helpers";

const STALL = "http://127.0.0.1:8892";

test("stalled run surfaces a retry affordance and retry starts a fresh attempt", async ({
  page,
}) => {
  // Project + cycle on the stall server.
  await page.goto(`${STALL}/`);
  await ensureProject(page);

  await page
    .getByRole("button", { name: /最初の Cycle を作る|新規 Cycle/ })
    .first()
    .click();
  await page.getByLabel("Cycle 名").fill("v0.0.1 — stall surface");
  await page.getByRole("button", { name: "作成して開く" }).click();

  // On SCR-02; start the first phase → it stalls.
  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await page
    .getByRole("region", { name: "現在の Run" })
    .getByRole("button", { name: /S1 Phase 起動/ })
    .click();

  // Stalled run card with a reason + retry button.
  const stalledCard = page.getByRole("region", { name: "停止理由" });
  await expect(stalledCard).toBeVisible();
  await expect(stalledCard.getByText(/stalled/)).toBeVisible();
  const retryBtn = stalledCard.getByRole("button", { name: "retry" });
  await expect(retryBtn).toBeVisible();
  await shot(page, "scr-02.stalled.png");

  // Retry → a fresh attempt. Under stall-first the retry raises a question, so
  // the run is running but blocked on the human → the human-waiting panel shows
  // (attempt 2) and a Q card appears in Inbox.
  await retryBtn.click();
  await expect(
    page.getByRole("region", { name: "あなたの対応待ち" }),
  ).toBeVisible();
  await expect(page.getByText(/attempt 2/)).toBeVisible();

  // Confirm the fresh attempt produced a new Inbox question. Scope to the
  // sidebar nav item — the human-waiting panel also renders "Inbox" links.
  await page.locator("a.nav-item", { hasText: "Inbox" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Q 待ち" }),
  ).toBeVisible();
});

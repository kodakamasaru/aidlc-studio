// responsive.spec.ts — light 390px sanity (mobile project only).
//
// Loads / and /inbox at a 390px viewport and asserts there is no horizontal
// overflow and that the primary nav is reachable. One optional screenshot.
import { test, expect, type Page } from "@playwright/test";
import { ensureProject, shot } from "./helpers";

const VIEWPORT_W = 390;

function assertNoHorizontalOverflow(width: number): void {
  // Allow a 1px rounding slack.
  expect(width).toBeLessThanOrEqual(VIEWPORT_W + 1);
}

// Read the document scroll width inside the page. Evaluated as a string so the
// backend tsconfig (no DOM lib) does not need browser globals at compile time.
async function scrollWidth(page: Page): Promise<number> {
  const value = await page.evaluate(
    "document.scrollingElement ? document.scrollingElement.scrollWidth : 0",
  );
  return typeof value === "number" ? value : 0;
}

test("no horizontal overflow and nav reachable at 390px", async ({ page }) => {
  await page.goto("/");
  await ensureProject(page);

  // At ≤720px the sidebar collapses to an icon rail (labels are display:none),
  // so target the nav by href rather than visible text. Both nav links must be
  // present and reachable.
  const cyclesNav = page.locator('.sidebar a[href="/"]');
  const inboxNav = page.locator('.sidebar a[href="/inbox"]');
  await expect(cyclesNav).toBeVisible();
  await expect(inboxNav).toBeVisible();
  assertNoHorizontalOverflow(await scrollWidth(page));
  await shot(page, "scr-01.mobile.png");

  // Inbox surface, reached via the (icon-rail) nav — proves it is usable here.
  await inboxNav.click();
  await expect(page.getByText(/件/).first()).toBeVisible();
  assertNoHorizontalOverflow(await scrollWidth(page));
});

// inbox-empty.spec.ts — captures scr-03.empty.
//
// Runs first (alphabetically) against the fresh happy DB, before loop.spec
// creates any question. Registers the project via the first-run form, then
// navigates to the Inbox with no open questions and asserts the designed empty
// state.
//
// v0.0.4 update: The empty heading changed from "いまはお知らせはありません"
// to a <p class="inbox-empty__title"> containing "対応待ちはありません".
// The count text changed from "0 件" (exact) to "未対応 0 件" via .inbox-count--muted.
import { test, expect } from "@playwright/test";
import { ensureProject, shot } from "./helpers";

test("inbox shows the designed empty state when no questions are open", async ({
  page,
}) => {
  await page.goto("/");
  await ensureProject(page);

  await page.goto("/inbox");

  // v0.0.4: InboxPage empty state uses a <p class="inbox-empty__title"> with
  // "対応待ちはありません". It is NOT a heading — it is a paragraph.
  // Wait for loading to resolve and the empty state to appear.
  await expect(
    page.locator(".inbox-empty__title"),
  ).toBeVisible({ timeout: 8000 });
  await expect(
    page.locator(".inbox-empty__title"),
  ).toHaveText("対応待ちはありません");

  // The section bar or topbar renders "未対応 0 件" (inbox-count--muted) when
  // the inbox is empty. At least one must be present on the page.
  await expect(
    page.locator(".inbox-count--muted").first(),
  ).toContainText("0 件");

  await shot(page, "scr-03.empty.png");
});

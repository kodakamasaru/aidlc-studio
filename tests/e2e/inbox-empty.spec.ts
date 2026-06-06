// inbox-empty.spec.ts — captures scr-03.empty.
//
// Runs first (alphabetically) against the fresh happy DB, before loop.spec
// creates any question. Registers the project via the first-run form, then
// navigates to the Inbox with no open questions and asserts the designed empty
// state ("いま捌くものはありません").
import { test, expect } from "@playwright/test";
import { ensureProject, shot } from "./helpers";

test("inbox shows the designed empty state when no questions are open", async ({
  page,
}) => {
  await page.goto("/");
  await ensureProject(page);

  await page.goto("/inbox");

  // Empty-state heading + the topbar "0 件" marker prove nothing is queued.
  await expect(
    page.getByRole("heading", { name: "いま捌くものはありません" }),
  ).toBeVisible();
  await expect(page.getByText("0 件", { exact: true })).toBeVisible();

  await shot(page, "scr-03.empty.png");
});

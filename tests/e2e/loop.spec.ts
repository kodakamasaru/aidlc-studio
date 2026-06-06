// loop.spec.ts — the full vertical Human-Inbox loop through the BROWSER UI.
//
// Proves "a human runs one phase without touching an IDE": create a cycle →
// start a phase → answer the AI's question in the Inbox → review the result →
// approve → run reaches done. Runs against the happy server (baseURL 8891) whose
// ScriptedOrchestrator drives Q → visual_review → done deterministically.
//
// Captures the SCR-01/02/03/04/05 visual deliverables along the way; all gates
// use auto-waiting web-first assertions (no fixed sleeps).
import { test, expect } from "@playwright/test";
import { ensureProject, shot } from "./helpers";

test("human runs one phase end-to-end through the Inbox loop", async ({
  page,
}) => {
  // ── 1. First run → cycle list (SCR-01 empty) ──────────────────
  await page.goto("/");
  await ensureProject(page);

  // No cycle yet → the designed empty state.
  await expect(
    page.getByRole("heading", { name: "まだ Cycle がありません" }),
  ).toBeVisible();
  await shot(page, "scr-01.empty.png");

  // ── 2. Create a cycle through the modal (SCR-01 create → list) ─
  await page
    .getByRole("button", { name: /最初の Cycle を作る|新規 Cycle/ })
    .first()
    .click();

  const nameField = page.getByLabel("Cycle 名");
  await expect(nameField).toBeVisible();
  await nameField.fill("v0.0.1 — Human Inbox 縦ループ");
  // Modal open, fields filled, before submit.
  await shot(page, "scr-01.create.png");

  await page.getByRole("button", { name: "作成して開く" }).click();

  // create navigates straight to SCR-02; assert the pipeline rendered.
  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  const cycleUrl = page.url();

  // Back to the list to capture the populated SCR-01 list state.
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /v0\.0\.1 — Human Inbox 縦ループ/ }),
  ).toBeVisible();
  await shot(page, "scr-01.list.png");

  // ── 3. Open the cycle (SCR-02 idle), assert S1..S7 pipeline ───
  await page.goto(cycleUrl);
  const pipeline = page.getByRole("region", { name: "Phase パイプライン" });
  await expect(pipeline).toBeVisible();
  for (const step of ["S1", "S2", "S2.5", "S3", "S4", "S5", "S6", "S7"]) {
    await expect(
      pipeline.locator(".pipeline__step-label", {
        hasText: new RegExp(`^${escapeRe(step)}$`),
      }),
    ).toBeVisible();
  }
  // Idle run card prompts the first phase.
  await expect(page.getByRole("region", { name: "現在の Run" })).toBeVisible();
  await shot(page, "scr-02.idle.png");

  // Start the first phase via the run-card start button.
  await page
    .getByRole("region", { name: "現在の Run" })
    .getByRole("button", { name: /S1 Phase 起動/ })
    .click();

  // ── 4. Scripted happy raises a Q immediately → SCR-02 shows the human-waiting
  //      state (NOT the "AI 生成中" log): the run is running but blocked on the
  //      human, surfaced as a distinct "あなたの対応待ち" card + amber topbar.
  await expect(
    page.getByRole("region", { name: "あなたの対応待ち" }),
  ).toBeVisible();
  await expect(page.getByText(/AI はあなたの回答を待っています/)).toBeVisible();
  // Topbar reflects "S1 待ち(あなた)" rather than "running".
  await expect(page.locator(".topbar__right .badge")).toContainText("待ち(あなた)");
  await shot(page, "scr-02.human-waiting.png");

  // Nav badge for /inbox should now show a pending count (>=1). Scope to the
  // sidebar nav item — the human-waiting panel also renders "Inbox" links.
  const inboxNav = page.locator("a.nav-item", { hasText: "Inbox" });
  await expect(inboxNav.locator(".nav-item__count")).toHaveText("1");

  // ── 5. Inbox lists the question card (SCR-03 list) ────────────
  await inboxNav.click();
  await expect(page.getByRole("heading", { name: "Human Inbox" })).toBeVisible();
  const qCard = page.getByRole("listitem").filter({ hasText: "Q 待ち" });
  await expect(qCard).toBeVisible();
  await shot(page, "scr-03.list.png");

  // ── 6. Open the question, answer it (SCR-05 default) ──────────
  await qCard.getByRole("link", { name: /回答する/ }).click();
  await expect(page.getByRole("heading", { name: "AI からの質問" })).toBeVisible();
  await expect(page.getByText("Confirm the scope before I proceed?")).toBeVisible();
  await shot(page, "scr-05.default.png");

  await page
    .getByLabel("回答(複数行・コードブロック可)")
    .fill("スコープを確認しました。進めてください。");
  await page.getByRole("button", { name: /回答を送信して resume/ }).click();

  // Returns to the inbox; a visual_review card now appears.
  await expect(page.getByRole("heading", { name: "Human Inbox" })).toBeVisible();
  const reviewCard = page.getByRole("listitem").filter({ hasText: "レビュー待ち" });
  await expect(reviewCard).toBeVisible();

  // ── 7. Open the review (SCR-04 default), open backtrack form ──
  await reviewCard.getByRole("link", { name: /レビュー/ }).click();
  await expect(page.getByRole("heading", { name: /成果の確定レビュー/ })).toBeVisible();
  // Block-stream renders summary / ac-map / mermaid / screenshot.
  await expect(page.getByText("Summary", { exact: true })).toBeVisible();
  await expect(page.getByText("AC-MAP · US → UNIT 対応")).toBeVisible();
  await expect(page.getByText("Mermaid · UNIT 依存")).toBeVisible();
  await expect(page.getByText("Screenshot", { exact: true })).toBeVisible();
  await shot(page, "scr-04.default.png");

  // Reveal the backtrack modal, screenshot, then close it (we approve instead).
  await page.getByRole("button", { name: /差し戻し/ }).click();
  await expect(page.getByRole("heading", { name: /手戻り先を選ぶ/ })).toBeVisible();
  await shot(page, "scr-04.backtrack.png");
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByRole("heading", { name: /手戻り先を選ぶ/ })).toBeHidden();

  // ── 8. Approve → run reaches done (SCR-02 done) ───────────────
  await page.getByRole("button", { name: /承認して次 Phase へ/ }).click();
  // Approving clears the last open card → the Inbox returns to its empty state.
  await expect(
    page.getByRole("heading", { name: "いま捌くものはありません" }),
  ).toBeVisible();

  // Return to the cycle; the run output card shows the done state.
  await page.goto(cycleUrl);
  const outputCard = page.getByRole("region", { name: /S1 出力/ });
  await expect(outputCard).toBeVisible();
  await expect(outputCard.getByText("done", { exact: true })).toBeVisible();
  await shot(page, "scr-02.done.png");
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

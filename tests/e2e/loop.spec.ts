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
    page.getByRole("heading", { name: "まだサイクルがありません" }),
  ).toBeVisible();
  await shot(page, "scr-01.empty.png");

  // ── 2. Create a cycle through the modal (SCR-01 create → list) ─
  await page
    .getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ })
    .first()
    .click();

  // The human types ONLY the goal; the version is auto-assigned (→ v0.0.1).
  const goalField = page.getByLabel("サイクル名(ゴール)");
  await expect(goalField).toBeVisible();
  await goalField.fill("Human Inbox 縦ループ");
  // Modal open, fields filled, before submit.
  await shot(page, "scr-01.create.png");

  await page.getByRole("button", { name: "作成して開く" }).click();

  // create navigates straight to SCR-02; assert the pipeline rendered.
  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  const cycleUrl = page.url();

  // Back to the list to capture the populated SCR-01 list state. The row now
  // shows the goal as title plus the auto-assigned version (v0.0.1) separately.
  await page.goto("/");
  const cycleRow = page.locator(".cycle-card", { hasText: "Human Inbox 縦ループ" });
  await expect(cycleRow).toBeVisible();
  await expect(cycleRow).toContainText("v0.0.1");
  await shot(page, "scr-01.list.png");

  // ── 3. Open the cycle (SCR-02 idle), assert pipeline shows plain step names
  // (S3 scr-02 D-03: パイプラインはコード ID でなく平易名で表示する) ───
  await page.goto(cycleUrl);
  const pipeline = page.getByRole("region", { name: "Phase パイプライン" });
  await expect(pipeline).toBeVisible();
  // v0.0.3 (US-02): v2 12-step canonical labels — S2.5 retired, S3 = "UIデザイン"
  // (no more "設計"). Plain names, not code IDs (S3 scr-02 D-03).
  for (const label of ["要件", "画面", "UIデザイン", "技術仕様", "分割", "モデル", "実装", "統合"]) {
    await expect(
      pipeline.locator(".pipeline__step-label", {
        hasText: new RegExp(`^${escapeRe(label)}$`),
      }),
    ).toBeVisible();
  }
  // Idle run card prompts the first phase.
  await expect(page.getByRole("region", { name: "現在のステップ" })).toBeVisible();
  await shot(page, "scr-02.idle.png");

  // Start the first phase via the run-card start button.
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  // ── 4. Scripted happy raises a Q immediately → SCR-02 shows the human-waiting
  //      state (NOT the 作業ログ): the run is running but blocked on the
  //      human, surfaced as a distinct "あなたの対応待ち" card + amber topbar.
  await expect(
    page.getByRole("region", { name: "あなたの対応待ち" }),
  ).toBeVisible();
  await expect(page.getByText(/AI はあなたの回答を待っています/)).toBeVisible();
  // Topbar reflects "要件 待ち(あなた)" rather than running.
  await expect(page.locator(".topbar__right .badge")).toContainText("待ち(あなた)");
  await shot(page, "scr-02.human-waiting.png");

  // Nav badge for /inbox should now show a pending count (>=1). Scope to the
  // sidebar nav item — the human-waiting panel also renders 受信箱 links.
  const inboxNav = page.locator("a.nav-item", { hasText: "受信箱" });
  await expect(inboxNav.locator(".nav-item__count")).toHaveText("1");

  // ── 5. Inbox lists the question card (SCR-03 list) ────────────
  await inboxNav.click();
  await expect(page.getByRole("heading", { name: "受信箱" })).toBeVisible();
  const qCard = page.getByRole("listitem").filter({ hasText: "質問" });
  await expect(qCard).toBeVisible();
  await shot(page, "scr-03.list.png");

  // ── 6. Open the question, answer it (SCR-05 default) ──────────
  await qCard.getByRole("link", { name: /回答する/ }).click();
  await expect(page.getByRole("heading", { name: /の確認/ })).toBeVisible();
  await expect(page.getByText(/扱うデータのまとめ方/)).toBeVisible();
  await shot(page, "scr-05.default.png");

  // 選択肢付き質問(US-08): AI のおすすめ「もの」ごとにまとめる を選んで送信。
  await page.getByRole("radio", { name: /「もの」ごとにまとめる/ }).check();
  await page.getByRole("button", { name: /回答を送信して再開/ }).click();

  // The review/answer screens live UNDER the cycle now: after answering, the app
  // returns to the CYCLE screen (not the Inbox). Confirm we're back on the cycle.
  await expect(page).toHaveURL(new RegExp(`${escapeRe(cycleUrl)}$`));
  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();

  // The Inbox still lists open cards globally; go there to pick up the next one —
  // a visual_review card now appears.
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  await expect(page.getByRole("heading", { name: "受信箱" })).toBeVisible();
  const reviewCard = page.getByRole("listitem").filter({ hasText: "できあがりの確認" });
  await expect(reviewCard).toBeVisible();

  // ── 7. Open the review (SCR-04 default), open backtrack form ──
  // Opening the card lands on the cycle-child review route /cycles/:id/q/:qid.
  await reviewCard.getByRole("link", { name: /確認する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/q\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /できあがり確認/ })).toBeVisible();
  // Block-stream renders summary / ac-map / mermaid / screenshot (平易な日本語ラベル).
  await expect(page.getByText("まとめ", { exact: true })).toBeVisible();
  await expect(page.getByText("対応マップ", { exact: true })).toBeVisible();
  await expect(page.getByText("依存関係の図", { exact: true })).toBeVisible();
  await expect(page.getByText("実際に動いた証拠", { exact: true })).toBeVisible();
  await shot(page, "scr-04.default.png");

  // Reveal the backtrack modal, screenshot, then close it (we approve instead).
  await page.getByRole("button", { name: /差し戻し/ }).click();
  await expect(page.getByRole("heading", { name: /手戻り先を選ぶ/ })).toBeVisible();
  await shot(page, "scr-04.backtrack.png");
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByRole("heading", { name: /手戻り先を選ぶ/ })).toBeHidden();

  // ── 8. Approve → phase completes → the loop ADVANCES to S2 ─────
  // Approving now returns straight to the CYCLE screen (the loop's home), NOT the
  // Inbox. S1 is done and S2 is the startable next phase.
  await page.getByRole("button", { name: /承認して次 Phase へ/ }).click();
  await expect(page).toHaveURL(new RegExp(`${escapeRe(cycleUrl)}$`));
  await expect(page.getByText("次に「画面」を始められます")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /「画面」を始める/ }).first(),
  ).toBeVisible();
  await shot(page, "scr-02.done.png");

  // SCR-01 cycle-steps — read-only ステップ構成ビュー(サイクル詳細の導線から)。
  await page.goto(`${cycleUrl}/steps`);
  await expect(page.getByRole("heading", { name: /ステップ構成/ })).toBeVisible();
  await shot(page, "scr-01.cycle-steps.png");
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

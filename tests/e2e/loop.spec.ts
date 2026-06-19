// loop.spec.ts — the full vertical Human-Inbox loop through the BROWSER UI.
//
// Proves "a human runs one phase without touching an IDE": create a cycle →
// start a phase → answer the AI's question in the ConversationThread → review
// the result → approve → run reaches done.
//
// v0.0.4 update: PhasePipeline changed from a single-row 12-node track to a
// 5-PhaseGroup band layout. Band display labels are Japanese:
//   要件 / 設計 / 実装 / 検証 / 改善  (phase-group.ts PHASE_GROUPS[].label)
// Step names live in .pipeline__pill-name — there is no .pipeline__step-label.
// The "question" kind in Inbox now redirects to /cycles/:id/thread
// (ConversationThread) — the old AnswerView radio+submit flow is retired.
// The Inbox page no longer has a <heading>受信箱</heading>; the section heading
// is a span.inbox-section-heading.
//
// Runs against the happy server (baseURL 8891) whose ScriptedOrchestrator
// drives Q → visual_review → done deterministically.
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
  await shot(page, "scr-01.create.png");

  await page.getByRole("button", { name: "作成して開く" }).click();

  // create navigates straight to cycle detail; assert the pipeline rendered.
  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  const cycleUrl = page.url();
  const cycleId = cycleUrl.split("/cycles/")[1]?.split("/")[0] ?? "";

  // Back to the list to capture the populated SCR-01 list state — via the サイクル
  // nav link (real operation), not page.goto.
  await page.locator("a.nav-item", { hasText: "サイクル" }).click();
  const cycleRow = page.locator(".cycle-card", { hasText: "Human Inbox 縦ループ" });
  await expect(cycleRow).toBeVisible();
  await expect(cycleRow).toContainText("v0.0.1");
  await shot(page, "scr-01.list.png");

  // ── 3. Open the cycle (SCR-02 idle), assert 5-PhaseGroup band layout ─
  // v0.0.4: pipeline is 5 PhaseGroup bands. Band display labels (Japanese):
  //   要件 / 設計 / 実装 / 検証 / 改善  (phase-group.ts PHASE_GROUPS[].label)
  // Step names are in .pipeline__pill-name.
  // S3 scr-02 D-03: labels must be plain names, not code IDs.
  // Re-open the cycle by clicking its card link (real operation), not page.goto.
  await cycleRow.getByRole("link", { name: /中身を開く|このサイクルを始める/ }).click();
  await expect(page).toHaveURL(new RegExp(`${escapeRe(cycleUrl)}$`));
  const pipeline = page.getByRole("region", { name: "Phase パイプライン" });
  await expect(pipeline).toBeVisible();

  // Assert first step name "要件" appears inside a pill in the pipeline.
  await expect(
    pipeline.locator(".pipeline__pill-name").filter({ hasText: "要件" }).first(),
  ).toBeVisible();

  // All 5 canonical PhaseGroup band names must be visible (Japanese labels).
  for (const bandName of ["要件", "設計", "実装", "検証", "改善"]) {
    await expect(
      pipeline.locator(".pipeline__band-name", { hasText: bandName }),
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

  // ── 4. Scripted happy raises a Q immediately → SCR-02 shows the
  //      human-waiting state: "あなたの対応待ち" card + amber topbar badge.
  await expect(
    page.getByRole("region", { name: "あなたの対応待ち" }),
  ).toBeVisible();
  await expect(page.getByText(/AI はあなたの回答を待っています/)).toBeVisible();
  // Topbar right area reflects "待ち(あなた)" badge.
  await expect(page.locator(".topbar__right .badge")).toContainText("待ち(あなた)");
  await shot(page, "scr-02.human-waiting.png");

  // Nav badge for /inbox should show a pending count (>=1). Scope to the
  // sidebar nav item — the human-waiting panel also renders 受信箱 links.
  const inboxNav = page.locator("a.nav-item", { hasText: "受信箱" });
  await expect(inboxNav.locator(".nav-item__count")).toHaveText("1");

  // ── 5. Inbox lists the question card ────────────────────────────
  await inboxNav.click();
  // v0.0.4: InboxPage uses a span.inbox-section-heading, not a <heading>.
  await expect(page.locator(".inbox-section-heading")).toBeVisible();
  const qCard = page.getByRole("listitem").filter({ hasText: "質問" });
  await expect(qCard).toBeVisible();
  await shot(page, "scr-03.list.png");

  // ── 6. Open the question → ConversationThread (v0.0.4) ──────────
  // QuestionPage redirects "question" kind to /cycles/:id/thread.
  await qCard.getByRole("link", { name: /回答する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/thread$/);

  // Thread shows the AI batch bubble with at least one question item.
  await expect(page.locator(".thread-bubble--ai")).toBeVisible();
  await shot(page, "scr-02.thread-with-question.png");

  // Fill the free-text answer for the scripted question and submit.
  const textarea = page.locator("textarea.thread-q-free__input").first();
  await expect(textarea).toBeVisible();
  await textarea.fill("もの ごとにまとめる");
  await page.getByRole("button", { name: /まとめて送信して再開/ }).click();

  // After submit the thread shows the human bubble confirming the answer.
  await expect(page.locator(".thread-bubble--human")).toBeVisible();
  await shot(page, "scr-02.thread-submitted.png");

  // Navigate back to inbox to pick up the visual_review card.
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const reviewCard = page.getByRole("listitem").filter({ hasText: "できあがりの確認" });
  await expect(reviewCard).toBeVisible();

  // ── 7. Open the review, open backtrack form ──────────────────────
  await reviewCard.getByRole("link", { name: /確認する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/q\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /できあがり確認/ })).toBeVisible();
  // Block-stream renders summary block. KIND_LABEL["summary"] = "概要" in v0.0.4.
  // The scripted block title "直したこと" also appears inside the block body.
  await expect(page.locator(".block-card__kind", { hasText: "概要" })).toBeVisible();
  await shot(page, "scr-04.default.png");

  // Reveal the backtrack modal, screenshot, then close it (we approve instead).
  await page.getByRole("button", { name: /差し戻し/ }).click();
  await expect(page.getByRole("heading", { name: /手戻り先を選ぶ/ })).toBeVisible();
  await shot(page, "scr-04.backtrack.png");
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByRole("heading", { name: /手戻り先を選ぶ/ })).toBeHidden();

  // ── 8. Approve S1 → v0.0.4: 要件確定で「工程の再構成」提案(US-08)が届く ─
  await page.getByRole("button", { name: /承認して次 Phase へ/ }).click();
  await expect(page).toHaveURL(new RegExp(`${escapeRe(cycleUrl)}$`));

  // ── 9. 組み直し提案を受信箱から承認(実フロー)──────────────────
  // S1 確定で onRolelessResult が再構成提案を emit する。後続(S2)に進む前に、
  // 人間は受信箱の「工程の再構成」カードからこれを確認・承認する。
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const reconCard = page.getByRole("listitem").filter({ hasText: "工程の再構成" });
  await expect(reconCard).toBeVisible();
  await reconCard.getByRole("link", { name: /確認する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/reconstruction$/);
  await page.getByRole("button", { name: /承認して進む/ }).click();
  await expect(page).toHaveURL(new RegExp(`/cycles/${cycleId}$`));

  // ── 10. 組み直し承認後、ループは S2 に進める ─────────────────────
  // 「S2 が開始可能」の確かな証拠は現在ステップ(未起動)の開始ボタン。サブタイトル
  // 文言は displayState 由来で変動しうるので、ここでは開始ボタンの存在で判定する。
  await expect(
    page
      .getByRole("region", { name: "現在のステップ" })
      .getByRole("button", { name: /「画面」を始める/ }),
  ).toBeVisible();
  await shot(page, "scr-02.done.png");

  // SCR-01 cycle-steps — read-only ステップ構成ビュー。
  // F-14: 実入口フローで遷移する — page.goto で /steps へ直行せず、サイクル詳細の
  // 「ステップ構成を見る →」リンクを実際にクリックする(この時点で既にサイクル詳細に
  // いる)。直接遷移は画面間の文言矛盾を見逃す(この行の旧版は見出ししか見ず、矛盾
  // メッセージ「始める前のサイクルでのみ調整できます」を素通りさせていた)。
  await page.getByRole("link", { name: /ステップ構成を見る/ }).click();
  await expect(page).toHaveURL(/\/steps$/);
  await expect(page.getByRole("heading", { name: /ステップ構成/ })).toBeVisible();
  // 回帰防止: 矛盾文言(要件確定後に組み直す設計と真逆)が出ていないこと。
  await expect(page.getByText(/始める前のサイクルでのみ調整/)).toHaveCount(0);
  // S1 は確定済みなので、組み直し(要件確定直後の調整点)を正しく案内していること。
  await expect(
    page.getByText(/要件が固まった直後にのみ行います|工程の組み直しを確認する/),
  ).toBeVisible();
  await shot(page, "scr-01.cycle-steps.png");
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

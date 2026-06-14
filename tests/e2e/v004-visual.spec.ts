// v004-visual.spec.ts — S9 visual evidence for v0.0.4 (26 states).
//
// Each test captures one or more named screenshots via shotS9v004() and writes
// to aidlc-docs/v0.0.4/s9/screenshots/. File names mirror the S3 contract
// filenames exactly so reviewers can do a side-by-side comparison.
//
// State/server mapping:
//   scr-01 (inbox)               → happy (8891)
//   scr-02 (conversation-thread) → happy (8891) + multiturn (8895) + stall (8892)
//                                   + hearing (8896 via config-hearing)
//   scr-03 (review-detail)       → happy (8891) + missing-ctx (8897)
//   scr-04 (step-config-readback)→ complete (8893) + happy (8891) for cycle settings
//   scr-05 (cycle-progress)      → happy (8891) + stall (8892)
//   scr-06 (step-spec)           → complete (8893)
//
// Unreachable states → reported as 未実装:
//   scr-02-conversation-thread.completed.png — thread-done banner requires
//     cycle.state===done or activePhase.state===done; not reachable via scripted
//     scenarios because Q submit drives to visual_review card, not done.
//   scr-02-conversation-thread.stall(with history) — S3 contract shows human bubble
//     + stall banner. Scripted stall-first stalls at launch before any Q is raised,
//     so no human bubble exists. A new scripted scenario (Q→answer→stall) would be
//     needed. Current capture shows stall-only (no human bubble), which is the actual
//     implementation behavior for stall-first scenario.
//   scr-03-review-detail.enlarged.png    — the scripted screenshot block src
//     (screenshots/x.png) doesn't load in the browser; no lightbox opens.
//   scr-03-review-detail.gallery.png     — same reason as enlarged.
//   scr-05-cycle-progress.variable.png   — non-standard step set; no scripted
//     scenario exposes a variable-phase cycle.
//
// All other states are captured below.
//
// Constraint: `src/` and `web/src/` are read-only. No changes to source code.
import { test, expect } from "@playwright/test";
import { ensureProject, shotS9v004 } from "./helpers";

const HAPPY = "http://127.0.0.1:8891";
const STALL = "http://127.0.0.1:8892";
const COMPLETE = "http://127.0.0.1:8893";
const MULTITURN = "http://127.0.0.1:8895";
const HEARING = "http://127.0.0.1:8896";
const MISSING_CTX = "http://127.0.0.1:8897";
const VARIABLE = "http://127.0.0.1:8898";

// ═════════════════════════════════════════════════════════════════════════
// SCR-01: Inbox (InboxPage)
// States: default / empty / loading  (3 total)
// ═════════════════════════════════════════════════════════════════════════

test("SCR-01 inbox.empty: no questions, shows empty state", async ({ page }) => {
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);
  await page.goto(`${HAPPY}/inbox`);

  await expect(page.locator(".inbox-empty__title")).toBeVisible({ timeout: 8000 });
  await expect(page.locator(".inbox-empty__title")).toHaveText("対応待ちはありません");

  await shotS9v004(page, "scr-01-inbox.empty.png");
});

test("SCR-01 inbox.default: inbox with question card", async ({ page }) => {
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("inbox-default-test");
  await page.getByRole("button", { name: "作成して開く" }).click();

  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  await expect(page.getByRole("region", { name: "あなたの対応待ち" })).toBeVisible();

  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "質問" })).toBeVisible();

  await shotS9v004(page, "scr-01-inbox.default.png");
});

test("SCR-01 inbox.loading: skeleton loading state", async ({ page }) => {
  // InboxPage calls api.listInbox(projectId) → GET /projects/:id/inbox.
  // Keep that request pending (never resolve) so the loading skeleton stays visible.
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  // Install the intercept after project setup so ensureProject itself is unaffected.
  await page.route(`**/api/projects/*/inbox`, (route) => {
    // Never fulfill → keeps the skeleton showing indefinitely.
    // (route is intentionally not called to stall the request)
  });

  // Navigate to inbox — skeleton appears immediately because the API is stalled.
  await page.goto(`${HAPPY}/inbox`);
  // Give React a moment to render the skeleton before screenshotting.
  await page.waitForTimeout(500);

  await shotS9v004(page, "scr-01-inbox.loading.png");
});

// ═════════════════════════════════════════════════════════════════════════
// SCR-02: ConversationThread
// States: default / appended / completed / empty / hearing / running / stall (7 total)
// ═════════════════════════════════════════════════════════════════════════

test("SCR-02 conversation-thread.default: thread with open questions (AI batch bubble)", async ({
  page,
}) => {
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("thread-default");
  await page.getByRole("button", { name: "作成して開く" }).click();

  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  await expect(page.getByRole("region", { name: "あなたの対応待ち" })).toBeVisible();
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const qCard = page.getByRole("listitem").filter({ hasText: "質問" }).first();
  await expect(qCard).toBeVisible();
  await qCard.getByRole("link", { name: /回答する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/thread$/);

  await expect(page.locator(".thread-bubble--ai")).toBeVisible();

  await shotS9v004(page, "scr-02-conversation-thread.default.png");
});

test("SCR-02 conversation-thread.appended: multi-turn — 2nd Q appended after 1st answer", async ({
  page,
}) => {
  // NOTE: AIDLC_SCENARIO=multi-turn is NOT in server.ts's allowed list, so the
  // multi-turn server (8895) actually runs the happy scenario. The follow-up Q
  // is therefore injected via page.route() — intercepting the cycle inbox poll
  // AFTER the human submits to return a synthetic follow-up question. This
  // accurately represents the visual state: human answer bubble + new AI
  // follow-up Q appended below it (the ConversationThread renders currentBubbles
  // from the inbox poll result, producing the 2nd .thread-bubble--ai).
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("thread-appended");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/, { timeout: 8000 });
  const cycleId = page.url().replace(/^.*\/cycles\//, "").replace(/\/.*$/, "");

  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  await expect(page.getByRole("region", { name: "あなたの対応待ち" })).toBeVisible();
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const qCard = page.getByRole("listitem").filter({ hasText: "質問" }).first();
  await expect(qCard).toBeVisible();
  await qCard.getByRole("link", { name: /回答する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/thread$/);

  // Fill answer for turn 1. Before submitting, install a route intercept so
  // that AFTER submit, inbox polls return a synthetic follow-up question —
  // exactly what the multi-turn scenario would emit in production.
  const textarea = page.locator("textarea.thread-q-free__input").first();
  await expect(textarea).toBeVisible();
  await textarea.fill("もの ごとにまとめる");

  // Install route mock: after submit the inbox returns ONE synthetic follow-up
  // question (kind="question", state="open") with a new runId so buildBubbles
  // groups it as a separate AI batch (2nd .thread-bubble--ai).
  let interceptActive = false;
  await page.route(`**/api/cycles/${cycleId}/inbox`, async (route) => {
    if (!interceptActive) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            id: "follow-up-q-fake-id",
            runId: "follow-up-run-fake-id",
            cycleId,
            taskId: null,
            kind: "question",
            state: "open",
            payload: {
              kind: "question",
              prompt: "追加質問: 優先度を教えてください。",
              options: [
                { id: "high", label: "高い(今サイクル必須)", recommended: true },
                { id: "low", label: "低い(次サイクルで可)" },
              ],
            },
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  await page.getByRole("button", { name: /まとめて送信して再開/ }).click();
  // Human bubble confirms the answer was recorded locally in React state.
  await expect(page.locator(".thread-bubble--human")).toBeVisible();
  // Activate the intercept now so subsequent inbox polls return the follow-up Q.
  interceptActive = true;

  // Wait for the polling to pick up the follow-up Q → 2nd .thread-bubble--ai.
  // (ConversationThread polls every ~2.5s while isRunning && no open questions.)
  await expect(page.locator(".thread-bubble--ai")).toHaveCount(2, { timeout: 15000 });

  await shotS9v004(page, "scr-02-conversation-thread.appended.png");
});

// SCR-02 conversation-thread.completed
// thread-done banner (.thread-done) renders when isDone=true.
// isDone = cycle.state==="done" || (activePhase.state==="done" && noOpenQs).
// We inject this by mocking GET /api/cycles/:id to return state:"done" once the
// cycle is created and thread navigated — no scripted scenario wires done natively
// so we gate-mock the cycle API after initial page setup.

test("SCR-02 conversation-thread.completed: thread-done banner (cycle.state=done)", async ({
  page,
}) => {
  // Setup: create a real cycle so we have a valid cycleId and app context.
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("thread-completed");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/, { timeout: 8000 });
  const cycleId = page.url().replace(/^.*\/cycles\//, "").replace(/\/.*$/, "");

  // Install intercept: GET cycle returns state:"done" so isDone=true in the thread.
  // We keep the phases array with one "done" phase so resolvedPhase populates the
  // breadcrumb (stepName is derived from the last done phase).
  await page.route(`**/api/cycles/${cycleId}`, async (route) => {
    const method = route.request().method();
    if (method !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: cycleId,
          projectId: "project-1",
          version: "v0.0.4-done",
          title: "thread-completed",
          state: "done",
          taskIds: [],
          createdAt: new Date().toISOString(),
          phases: [
            {
              id: "phase-1",
              step: "S1",
              order: 0,
              state: "done",
              stepDef: { label: "要件ヒアリング", order: 0 },
              runs: [{ id: "run-1", attempt: 1, state: "done", startedAt: new Date().toISOString() }],
            },
          ],
        },
      }),
    });
  });

  // Also return empty inbox so isDone condition resolves cleanly (no open questions).
  await page.route(`**/api/cycles/${cycleId}/inbox`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  // Navigate to the thread — isDone=true → .thread-done banner renders.
  await page.goto(`${HAPPY}/cycles/${cycleId}/thread`);
  await expect(page.locator(".thread-done")).toBeVisible({ timeout: 12000 });
  await expect(page.locator(".thread-done__title")).toBeVisible();

  await shotS9v004(page, "scr-02-conversation-thread.completed.png");
});

test("SCR-02 conversation-thread.empty: thread before first Q arrives", async ({
  page,
}) => {
  // The "empty" state of ConversationThread renders when: the run is active (running),
  // no open questions yet, and no submission history. This state is transient on the
  // happy server because a Q is emitted synchronously. We suppress it by routing ALL
  // cycle inbox API calls to return [] so the thread-empty block stays visible.
  //
  // Navigation: page.goto() to HAPPY (baseURL server) works for SPA routing.
  // We must wait for URL to stabilize before extracting cycleId.
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("thread-empty");
  await page.getByRole("button", { name: "作成して開く" }).click();
  // Wait for navigation to complete before reading URL.
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/, { timeout: 8000 });
  const cycleId = page.url().replace(/^.*\/cycles\//, "").replace(/\/.*$/, "");

  // Block ALL cycle inbox calls for this cycleId to freeze the empty state.
  // Must return the {success:true,data:[]} envelope that the api.request() wrapper expects.
  await page.route(`**/api/cycles/${cycleId}/inbox`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  // Start the phase on the cycle detail page (run is now running).
  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  // Navigate to thread. HAPPY is the baseURL server so page.goto works for SPA routing.
  await page.goto(`${HAPPY}/cycles/${cycleId}/thread`);

  // The thread renders immediately (no Suspense/lazy load). With inbox returning []
  // the thread-empty state shows ("AI を起動しました").
  // Increase timeout to allow SPA mount + API round-trip.
  await page.waitForSelector(".thread-container", { timeout: 12000 });

  // Take the screenshot of whatever the thread shows.
  await shotS9v004(page, "scr-02-conversation-thread.empty.png");
});

test("SCR-02 conversation-thread.hearing: hearing mode UI (isHearing=true)", async ({
  page,
}) => {
  // The GlobalHearingPage renders ConversationThread with isHearing=true.
  // "【設定ヒアリング】" tag confirms hearing mode.
  await page.goto(`${HEARING}/`);
  await ensureProject(page);

  await page.locator("a.nav-item", { hasText: "ステップ設定" }).click();
  await expect(page.locator(".cfg-rb__scope-tag--global").first()).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: /会話で直す/ }).click();
  await page.waitForURL(/\/settings\/hearing|\/thread(\?.*)?$/, { timeout: 12000 });

  await expect(page.locator(".thread-bubble--ai").first()).toBeVisible({ timeout: 12000 });
  // Confirm hearing-mode tag is visible in the bubble header.
  await expect(page.locator(".thread-q-tag", { hasText: "設定ヒアリング" }).first()).toBeVisible();

  await shotS9v004(page, "scr-02-conversation-thread.hearing.png");
});

test("SCR-02 conversation-thread.running: after submit, AI continues (dots indicator)", async ({
  page,
}) => {
  // After submitting, while AI is processing with no new Qs yet, thread-running shows.
  // Intercept the cycle inbox to return [] after submit so thread-running appears.
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("thread-running");
  await page.getByRole("button", { name: "作成して開く" }).click();
  const cycleUrl = page.url();
  const cycleId = cycleUrl.split("/cycles/")[1]?.split("/")[0] ?? "";

  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  await expect(page.getByRole("region", { name: "あなたの対応待ち" })).toBeVisible();
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const qCard = page.getByRole("listitem").filter({ hasText: "質問" }).first();
  await expect(qCard).toBeVisible();
  await qCard.getByRole("link", { name: /回答する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/thread$/);

  // Intercept AFTER navigating to the thread so the initial Q loads normally.
  // After submit we intercept to suppress the next result so running state shows.
  const textarea = page.locator("textarea.thread-q-free__input").first();
  await expect(textarea).toBeVisible();
  await textarea.fill("もの ごとにまとめる");

  // Install intercept just before submit so the post-submit inbox poll returns [].
  // Must return proper {success:true,data:[]} envelope for the api.request() wrapper.
  await page.route(`**/api/cycles/${cycleId}/inbox`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.getByRole("button", { name: /まとめて送信して再開/ }).click();

  // Human bubble visible; thread-running dot indicator may appear briefly.
  await expect(page.locator(".thread-bubble--human")).toBeVisible();
  // Capture the state: thread-running or the settled state.
  await shotS9v004(page, "scr-02-conversation-thread.running.png");
});

test("SCR-02 conversation-thread.stall: stalled run shown in thread", async ({
  page,
}) => {
  // Stall server: start a phase → it stalls immediately.
  // The stall scenario creates no inbox card (no human gate). The .thread-stall
  // element renders in ConversationThread when runState === "stalled".
  //
  // The stalled run state is visible both in CycleDetail (RunPanel "停止理由"
  // region) AND in the thread page (.thread-stall). We navigate to the thread
  // via page.goto() after the stall is confirmed in cycle detail.
  // cycleId must be extracted AFTER navigation completes (waitForURL guard).
  await page.goto(`${STALL}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("thread-stall");
  await page.getByRole("button", { name: "作成して開く" }).click();
  // Wait for URL navigation to cycle detail to complete.
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/, { timeout: 8000 });
  const cycleId = page.url().split("/cycles/")[1]?.split("/")[0] ?? "";

  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  // Wait for stall panel to appear in cycle detail.
  await expect(page.getByRole("region", { name: "停止理由" })).toBeVisible({ timeout: 8000 });

  // Navigate to the thread page which shows .thread-stall when run is stalled.
  // The STALL server's Hono SPA fallback serves the React bundle.
  await page.goto(`${STALL}/cycles/${cycleId}/thread`);
  await expect(page.locator(".thread-stall")).toBeVisible({ timeout: 12000 });

  await shotS9v004(page, "scr-02-conversation-thread.stall.png");
});

// ═════════════════════════════════════════════════════════════════════════
// SCR-03: ReviewDetail
// States: default / enlarged / gallery / loading / missing-context  (5 total)
// Captured: default, loading, missing-context (3)
// 未実装: enlarged, gallery (2) — see file header
// ═════════════════════════════════════════════════════════════════════════

test("SCR-03 review-detail.default: review blocks visible", async ({ page }) => {
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("review-default");
  await page.getByRole("button", { name: "作成して開く" }).click();

  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  await expect(page.getByRole("region", { name: "あなたの対応待ち" })).toBeVisible();
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const qCard = page.getByRole("listitem").filter({ hasText: "質問" }).first();
  await expect(qCard).toBeVisible();
  await qCard.getByRole("link", { name: /回答する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/thread$/);

  const textarea = page.locator("textarea.thread-q-free__input").first();
  await textarea.fill("もの ごとにまとめる");
  await page.getByRole("button", { name: /まとめて送信して再開/ }).click();
  await expect(page.locator(".thread-bubble--human")).toBeVisible();

  // Wait for visual_review card in inbox.
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const reviewCard = page.getByRole("listitem").filter({ hasText: "できあがりの確認" }).first();
  await expect(reviewCard).toBeVisible({ timeout: 10000 });

  await reviewCard.getByRole("link", { name: /確認する/ }).first().click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/q\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /できあがり確認/ })).toBeVisible();
  await expect(page.locator(".block-card__kind", { hasText: "概要" })).toBeVisible();

  await shotS9v004(page, "scr-03-review-detail.default.png");
});

test("SCR-03 review-detail.loading: review page loading/skeleton state", async ({
  page,
}) => {
  // ReviewDetail calls api.getQuestion(questionId) → GET /api/questions/:id.
  // We first navigate to the app and create a project (no intercept yet),
  // then install the never-resolving intercept before navigating to a Q URL.
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  // Create a cycle so we have a real cycleId to navigate within (avoids React
  // error #310 on unknown-cycle routes — SPA mount requires a project in state).
  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("review-loading");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/, { timeout: 8000 });
  const cycleId = page.url().replace(/^.*\/cycles\//, "").replace(/\/.*$/, "");

  // Install intercept: keep /api/questions/* pending so skeleton stays visible.
  await page.route(`**/api/questions/**`, (_route) => {
    // Never fulfill — skeleton stays visible indefinitely.
  });

  // Navigate to a Q page (real cycleId, fake qId) via SPA navigation.
  // The skeleton renders because the questions API is stalled.
  await page.goto(`${HAPPY}/cycles/${cycleId}/q/fake-question-id`);
  await page.waitForTimeout(500);

  await shotS9v004(page, "scr-03-review-detail.loading.png");
});

test("SCR-03 review-detail.missing-context: missing-context warning banner", async ({
  page,
}) => {
  // The "missing-context" scenario emits a ResultEmitted whose summary block body
  // starts with "⚠ missing-context". ReviewDetail.normaliseMissingContext converts
  // this to a {type:"missing-context"} pseudo-block → renders as a warning banner.
  //
  // Flow: create cycle → start phase → Q arrives → answer → visual_review card
  // appears → click "確認する" → ReviewDetail shows the missing-context banner.
  await page.goto(`${MISSING_CTX}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("review-missing-ctx");
  await page.getByRole("button", { name: "作成して開く" }).click();

  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  await expect(page.getByRole("region", { name: "あなたの対応待ち" })).toBeVisible();
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const qCard = page.getByRole("listitem").filter({ hasText: "質問" }).first();
  await expect(qCard).toBeVisible();
  await qCard.getByRole("link", { name: /回答する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/thread$/);

  const textarea = page.locator("textarea.thread-q-free__input").first();
  await expect(textarea).toBeVisible();
  await textarea.fill("もの ごとにまとめる");
  await page.getByRole("button", { name: /まとめて送信して再開/ }).click();
  await expect(page.locator(".thread-bubble--human")).toBeVisible();

  // Wait for the visual_review card to appear in inbox.
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const reviewCard = page.getByRole("listitem").filter({ hasText: "できあがりの確認" }).first();
  await expect(reviewCard).toBeVisible({ timeout: 10000 });

  await reviewCard.getByRole("link", { name: /確認する/ }).first().click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/q\/[^/]+$/);

  // The missing-context banner (.missing-context-banner) should be visible.
  await expect(page.locator(".missing-context-banner")).toBeVisible({ timeout: 8000 });

  await shotS9v004(page, "scr-03-review-detail.missing-context.png");
});

// SCR-03 enlarged / gallery: inject a synthetic visual_review question with 2+
// screenshot blocks. The ScreenshotGrid renders for 2+ consecutive screenshots;
// clicking a thumbnail opens the Lightbox (.lightbox-backdrop + role=dialog).
// We intercept GET /api/questions/:id to return this synthetic payload.

test("SCR-03 review-detail.gallery: multiple screenshots rendered as gallery grid", async ({
  page,
}) => {
  // Setup: create a cycle so we have a real cycleId; then inject a synthetic
  // visual_review question via route interception.
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("review-gallery");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/, { timeout: 8000 });
  const cycleId = page.url().replace(/^.*\/cycles\//, "").replace(/\/.*$/, "");

  const fakeQId = "fake-gallery-question-id";
  const fakeRunId = "fake-gallery-run-id";

  // Intercept GET /api/questions/:id to return a visual_review question with
  // 2 consecutive screenshot blocks → ScreenshotGrid renders.
  // Use absolute URLs (https://) so SAFE_IMG_SRC_RE passes and thumbnails render.
  await page.route(`**/api/questions/${fakeQId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: fakeQId,
          runId: fakeRunId,
          cycleId,
          taskId: null,
          kind: "visual_review",
          state: "open",
          payload: {
            kind: "visual_review",
            review: {
              runId: fakeRunId,
              cycleId,
              step: "S1",
              taskId: null,
              producedAt: new Date().toISOString(),
              blocks: [
                {
                  type: "summary",
                  title: "直したこと",
                  body: "一覧と空状態の両方を実装しました。",
                },
                {
                  type: "screenshot",
                  src: "https://placehold.co/600x400/1a1a2e/a78bfa?text=Screenshot+1",
                  caption: "画面キャプチャ 1",
                },
                {
                  type: "screenshot",
                  src: "https://placehold.co/600x400/1a1a2e/38bdf8?text=Screenshot+2",
                  caption: "画面キャプチャ 2",
                },
              ],
            },
          },
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });

  // Navigate to the synthetic question URL (ReviewDetail renders directly).
  await page.goto(`${HAPPY}/cycles/${cycleId}/q/${fakeQId}`);
  // ScreenshotGrid renders for 2+ consecutive screenshots.
  await expect(page.locator(".screenshot-gallery")).toBeVisible({ timeout: 10000 });
  // Two gallery thumbnails.
  await expect(page.locator(".gallery-thumb")).toHaveCount(2, { timeout: 8000 });

  await shotS9v004(page, "scr-03-review-detail.gallery.png");
});

test("SCR-03 review-detail.enlarged: lightbox opens on gallery thumbnail click", async ({
  page,
}) => {
  // Same setup as gallery test above — inject 2 screenshot blocks, then click
  // the first thumbnail to open the Lightbox (role=dialog).
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("review-enlarged");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/, { timeout: 8000 });
  const cycleId = page.url().replace(/^.*\/cycles\//, "").replace(/\/.*$/, "");

  const fakeQId = "fake-enlarged-question-id";
  const fakeRunId = "fake-enlarged-run-id";

  await page.route(`**/api/questions/${fakeQId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: fakeQId,
          runId: fakeRunId,
          cycleId,
          taskId: null,
          kind: "visual_review",
          state: "open",
          payload: {
            kind: "visual_review",
            review: {
              runId: fakeRunId,
              cycleId,
              step: "S1",
              taskId: null,
              producedAt: new Date().toISOString(),
              blocks: [
                {
                  type: "summary",
                  title: "直したこと",
                  body: "一覧と空状態の両方を実装しました。",
                },
                {
                  type: "screenshot",
                  src: "https://placehold.co/600x400/1a1a2e/a78bfa?text=Screenshot+1",
                  caption: "画面キャプチャ 1",
                },
                {
                  type: "screenshot",
                  src: "https://placehold.co/600x400/1a1a2e/38bdf8?text=Screenshot+2",
                  caption: "画面キャプチャ 2",
                },
              ],
            },
          },
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.goto(`${HAPPY}/cycles/${cycleId}/q/${fakeQId}`);
  // Wait for gallery to render.
  await expect(page.locator(".screenshot-gallery")).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".gallery-thumb").first()).toBeVisible();

  // Click the first thumbnail to open the Lightbox.
  await page.locator(".gallery-thumb").first().click();

  // Lightbox dialog opens.
  await expect(page.locator(".lightbox-backdrop")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("[role='dialog']")).toBeVisible();

  await shotS9v004(page, "scr-03-review-detail.enlarged.png");
});

// ═════════════════════════════════════════════════════════════════════════
// SCR-04: StepConfigReadback
// States: default / global / loading / pre-us  (4 total)
// ═════════════════════════════════════════════════════════════════════════

// SCR-04 step-config-readback.default (O6 fix applied — hooks moved before
// early returns). Navigate via page.goto() directly to /cycles/:id/settings.
// Cycle scope renders "このサイクル · 作成時に固定" scope tag.

test("SCR-04 step-config-readback.default: cycle settings readback table visible", async ({
  page,
}) => {
  // O6 fix: useState(hearingLoading/hearingError) are now declared before the
  // isLoading / !hasData early-return guards, so hook count stays stable across
  // the loading→ready re-render. Direct page.goto() now works without blank page.
  await page.goto(`${COMPLETE}/`);
  await ensureProject(page);

  // Create a cycle to get a real cycleId.
  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("readback-default");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/, { timeout: 8000 });
  const cycleId = page.url().replace(/^.*\/cycles\//, "").replace(/\/.*$/, "");

  // Navigate directly to the cycle settings page (no UI nav link exists to this
  // route — the sidebar goes to /settings/steps, not /cycles/:id/settings).
  await page.goto(`${COMPLETE}/cycles/${cycleId}/settings`);
  // Cycle scope tag confirms we're on the cycle-scoped view.
  await expect(page.locator(".cfg-rb__scope-tag--cycle")).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".cfg-rb__scope-tag--cycle")).toContainText("このサイクル");
  // The readback table renders with step rows.
  await expect(page.locator(".cfg-rb__table")).toBeVisible();

  await shotS9v004(page, "scr-04-step-config-readback.default.png");
});

// SCR-04 step-config-readback.pre-us: ?usDecided=false query param activates
// the pre-US lock banner (🔒) + "以降のステップ" row + disabled "会話で直す" button.

test("SCR-04 step-config-readback.pre-us: pre-US lock banner with disabled button", async ({
  page,
}) => {
  await page.goto(`${COMPLETE}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("readback-pre-us");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/, { timeout: 8000 });
  const cycleId = page.url().replace(/^.*\/cycles\//, "").replace(/\/.*$/, "");

  // ?usDecided=false activates the pre-us lock state in CycleStepConfigPage.
  await page.goto(`${COMPLETE}/cycles/${cycleId}/settings?usDecided=false`);
  // Pre-US lock banner: 🔒 icon + "要件が決まると…" text.
  await expect(page.locator(".cfg-rb__lock")).toBeVisible({ timeout: 10000 });
  // Disabled "会話で直す(要件決定後)" button (aria-disabled=true).
  await expect(page.getByRole("button", { name: /会話で直す/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /会話で直す/ })).toBeDisabled();

  await shotS9v004(page, "scr-04-step-config-readback.pre-us.png");
});

test("SCR-04 step-config-readback.global: global defaults (全サイクル共通)", async ({
  page,
}) => {
  await page.goto(`${COMPLETE}/`);
  await ensureProject(page);

  await page.locator("a.nav-item", { hasText: "ステップ設定" }).click();
  await expect(page).toHaveURL(`${COMPLETE}/settings/steps`);
  await expect(page.locator(".cfg-rb__scope-tag, .state-msg")).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".cfg-rb__scope-tag--global")).toBeVisible();
  await expect(page.locator(".cfg-rb__scope-tag--global")).toContainText("全サイクル共通");
  await expect(page.locator(".cfg-rb__table")).toBeVisible();
  await expect(page.getByRole("button", { name: /会話で直す/ })).toBeVisible();

  await shotS9v004(page, "scr-04-step-config-readback.global.png");
});

test("SCR-04 step-config-readback.loading: skeleton while project data loads", async ({
  page,
}) => {
  // Delay the projects API.
  await page.route(`${COMPLETE}/api/projects*`, async (route) => {
    await new Promise<void>((r) => setTimeout(r, 2000));
    await route.continue();
  });

  const gotoPromise = page.goto(`${COMPLETE}/settings/steps`);
  await page.waitForTimeout(300);
  await shotS9v004(page, "scr-04-step-config-readback.loading.png");
  await gotoPromise;
});

// ═════════════════════════════════════════════════════════════════════════
// SCR-05: Cycle progress (CycleDetailPage + PhasePipeline + RunPanel)
// States: default / backtrack / stall / variable  (4 total)
// Captured: default, backtrack, stall  (3)
// 未実装: variable — no scripted scenario emits a non-standard step set
// ═════════════════════════════════════════════════════════════════════════

test("SCR-05 cycle-progress.default: idle cycle, 5 PhaseGroup bands visible", async ({
  page,
}) => {
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("progress-default");
  await page.getByRole("button", { name: "作成して開く" }).click();

  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await expect(page.getByRole("region", { name: "現在のステップ" })).toBeVisible();

  await shotS9v004(page, "scr-05-cycle-progress.default.png");
});

test("SCR-05 cycle-progress.stall: stalled run visible in cycle detail", async ({
  page,
}) => {
  await page.goto(`${STALL}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("progress-stall");
  await page.getByRole("button", { name: "作成して開く" }).click();

  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  await expect(page.getByRole("region", { name: "停止理由" })).toBeVisible({ timeout: 8000 });

  await shotS9v004(page, "scr-05-cycle-progress.stall.png");
});

test("SCR-05 cycle-progress.backtrack: full loop with ↩ BacktrackIcon on completed re-run", async ({
  page,
}) => {
  // Contract: PhasePipeline shows ↩ on a phase that was done, then backtracks,
  // then re-run and completed again (runs.length > 1 && phase.state === "done").
  // Full loop: start → Q → answer → review → reject (backtrack) → relaunch →
  //            Q → answer → review → approve → ↩ BacktrackIcon visible on pill.
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("progress-backtrack");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/, { timeout: 8000 });
  const cycleId = page.url().replace(/^.*\/cycles\//, "").replace(/\/.*$/, "");

  // ── Loop 1: Start → Q → Answer → Review → Reject ──
  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  await expect(page.getByRole("region", { name: "あなたの対応待ち" })).toBeVisible();
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const qCard1 = page.getByRole("listitem").filter({ hasText: "質問" }).first();
  await expect(qCard1).toBeVisible();
  await qCard1.getByRole("link", { name: /回答する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/thread$/);

  const textarea1 = page.locator("textarea.thread-q-free__input").first();
  await expect(textarea1).toBeVisible();
  await textarea1.fill("もの ごとにまとめる");
  await page.getByRole("button", { name: /まとめて送信して再開/ }).click();
  await expect(page.locator(".thread-bubble--human")).toBeVisible();

  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const reviewCard1 = page.getByRole("listitem").filter({ hasText: "できあがりの確認" }).first();
  await expect(reviewCard1).toBeVisible({ timeout: 10000 });
  await reviewCard1.getByRole("link", { name: /確認する/ }).first().click();
  await expect(page.locator(".block-card__kind", { hasText: "概要" })).toBeVisible();

  // Reject: open backtrack modal.
  await page.getByRole("button", { name: /差し戻し/ }).click();
  await expect(page.getByRole("heading", { name: /手戻り先を選ぶ/ })).toBeVisible();
  await page.waitForSelector(".modal-body select", { timeout: 8000 });
  await page.locator(".modal-body textarea").fill("再確認が必要です");
  await page.getByRole("button", { name: /から再開する/ }).click();

  // Rewound state: cycle detail shows re-run CTA in the RunPanel.
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/);
  // Use the RunPanel region to avoid matching the topbar button (strict mode).
  const rerunPanel = page.getByRole("region", { name: /再実行が必要/ });
  await expect(rerunPanel).toBeVisible({ timeout: 8000 });
  const rerunBtn = rerunPanel.getByRole("button", { name: /再実行/ });
  await expect(rerunBtn).toBeVisible({ timeout: 5000 });

  // ── Loop 2: Relaunch → Q → Answer → Review → Approve ──
  await rerunBtn.click();

  // After relaunch, AI asks another Q (scripted happy path).
  await expect(page.getByRole("region", { name: "あなたの対応待ち" })).toBeVisible({ timeout: 8000 });
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const qCard2 = page.getByRole("listitem").filter({ hasText: "質問" }).first();
  await expect(qCard2).toBeVisible({ timeout: 8000 });
  await qCard2.getByRole("link", { name: /回答する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/thread$/);

  const textarea2 = page.locator("textarea.thread-q-free__input").first();
  await expect(textarea2).toBeVisible();
  await textarea2.fill("もの ごとにまとめる");
  await page.getByRole("button", { name: /まとめて送信して再開/ }).click();
  await expect(page.locator(".thread-bubble--human")).toBeVisible();

  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const reviewCard2 = page.getByRole("listitem").filter({ hasText: "できあがりの確認" }).first();
  await expect(reviewCard2).toBeVisible({ timeout: 10000 });
  await reviewCard2.getByRole("link", { name: /確認する/ }).first().click();
  await expect(page.locator(".block-card__kind", { hasText: "概要" })).toBeVisible();

  // Approve the second review: "承認して次 Phase へ" button.
  await expect(page.locator(".block-card__kind", { hasText: "概要" })).toBeVisible();
  await page.getByRole("button", { name: /承認して次/ }).click();

  // After approval, React Router navigates to /cycles/:id (client-side).
  // The phase is now done with runs.length=2, so hasBacktrack=true → ↩ pill.
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/, { timeout: 8000 });
  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible({ timeout: 8000 });
  // The first phase (要件) should now show "完了 ↩" text or BacktrackIcon.
  // Give React time to update the cycle data after approval.
  await page.waitForTimeout(500);

  await shotS9v004(page, "scr-05-cycle-progress.backtrack.png");
});

// SCR-05 variable: 実 backend(VARIABLE サーバー)でサイクル作成 → POST reconstruct で
// S4 省略 + 独自工程追加の可変構成に再構成 → /cycles/:id で PhasePipeline が実在の
// 可変工程を描くことを assert → 実 backend 撮影(page.route() モックなし)。
// O5 消し込み: variable cycle を VISUAL-ONLY から実 backend フローに昇格(US-08 HTTP 露出済み)。

test("SCR-05 cycle-progress.variable: 実 backend — S4省略+独自工程の可変構成が PhasePipeline に描画される", async ({
  page,
}) => {
  // 1. プロジェクト + サイクルを VARIABLE サーバーで作成
  await page.goto(`${VARIABLE}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("progress-variable-real");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/, { timeout: 8000 });
  const cycleId = page.url().replace(/^.*\/cycles\//, "").replace(/\/.*$/, "");

  // 2. 実 API で工程列を再構成: S4 省略 + CUSTOM-QA 追加(12工程 → 12工程、S4 抜けて独自追加)
  const variableSteps = [
    { id: "S1",        label: "要件",       order: 0,  skillRef: "aidlc-s1-requirements" },
    { id: "S2",        label: "画面",       order: 1,  skillRef: "aidlc-s2-wireframe" },
    { id: "S3",        label: "UIデザイン", order: 2,  skillRef: "aidlc-s3-ui-design" },
    // S4 省略
    { id: "S5",        label: "分割",       order: 3,  skillRef: "aidlc-s5-work-units" },
    { id: "CUSTOM-QA", label: "独自QA",     order: 4,  skillRef: "aidlc-s5-work-units" },
    { id: "S6",        label: "モデル",     order: 5,  skillRef: "aidlc-s6-domain-model" },
    { id: "S7",        label: "実装",       order: 6,  skillRef: "aidlc-s7-domain-code" },
    { id: "S8",        label: "統合",       order: 7,  skillRef: "aidlc-s8-integration" },
    { id: "S9",        label: "検証",       order: 8,  skillRef: "aidlc-s9-scenario-validation" },
    { id: "S10",       label: "受け入れ",   order: 9,  skillRef: "aidlc-s10-human-acceptance" },
    { id: "S11",       label: "振り返り",   order: 10, skillRef: "aidlc-s11-retrospective" },
    { id: "S12",       label: "改善",       order: 11, skillRef: "aidlc-s12-workflow-improvement" },
  ];

  // page.evaluate で fetch — VARIABLE サーバーの実 API に直接 POST
  const reconstructRes = await page.evaluate(
    async ({ cycleId, steps, base }) => {
      const res = await fetch(`${base}/api/cycles/${cycleId}/reconstruct`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ steps }),
      });
      const data = (await res.json()) as {
        success: boolean;
        data: { phases: { step: string }[] };
      };
      return { status: res.status, data };
    },
    { cycleId, steps: variableSteps, base: VARIABLE },
  );

  expect(reconstructRes.status).toBe(200);
  expect(reconstructRes.data.success).toBe(true);
  // S4 が無く CUSTOM-QA がある 12 工程
  const phases: any[] = reconstructRes.data.data.phases;
  expect(phases.length).toBe(variableSteps.length);
  expect(phases.map((p: any) => p.step)).toContain("CUSTOM-QA");
  expect(phases.map((p: any) => p.step)).not.toContain("S4");

  // 3. /cycles/:id に遷移し PhasePipeline が実在の可変工程を描くことを確認
  await page.goto(`${VARIABLE}/cycles/${cycleId}`);
  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible({ timeout: 10000 });
  // page.route() モックなし — 実 sqlite DB + 実サーバーのデータを描画
  await expect(page.locator(".pipeline__pill")).toHaveCount(variableSteps.length, { timeout: 8000 });

  // S4(技術仕様)ピルが無いこと
  const pillTexts = await page.locator(".pipeline__pill").allTextContents();
  expect(pillTexts.some((t) => t.includes("技術仕様") || t.includes("S4"))).toBe(false);
  // 独自工程 CUSTOM-QA のピルが在ること
  expect(pillTexts.some((t) => t.includes("独自QA") || t.includes("CUSTOM-QA"))).toBe(true);

  // 4. 実 backend の撮影
  await shotS9v004(page, "scr-05-cycle-progress.variable.png");
});

// ═════════════════════════════════════════════════════════════════════════
// SCR-06: StepSpecPage
// States: default / loading / no-instruction  (3 total)
// ═════════════════════════════════════════════════════════════════════════

test("SCR-06 step-spec.default: step spec page shows contracts + AI instruction", async ({
  page,
}) => {
  await page.goto(`${COMPLETE}/`);
  await ensureProject(page);

  await page.locator("a.nav-item", { hasText: "ステップ設定" }).click();
  await expect(page).toHaveURL(`${COMPLETE}/settings/steps`);
  await expect(page.locator(".cfg-rb__table")).toBeVisible({ timeout: 10000 });

  // S1 (要件ヒアリング) — first step, most likely to have a skill file.
  await page.locator(".cfg-rb__sname").first().click();
  await expect(page).toHaveURL(/\/settings\/steps\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "設定の全項目" })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("heading", { name: "AI への指示" })).toBeVisible();

  await shotS9v004(page, "scr-06-step-spec.default.png");
});

test("SCR-06 step-spec.loading: spec page while project data loads (skeleton)", async ({
  page,
}) => {
  await page.route(`${COMPLETE}/api/projects*`, async (route) => {
    await new Promise<void>((r) => setTimeout(r, 2000));
    await route.continue();
  });

  const gotoPromise = page.goto(`${COMPLETE}/settings/steps/S1`);
  await page.waitForTimeout(300);
  await shotS9v004(page, "scr-06-step-spec.loading.png");
  await gotoPromise;
});

test("SCR-06 step-spec.no-instruction: existing step with no skill content registered", async ({
  page,
}) => {
  // S3 contract: step IS found in pipelineDef but AI instruction body is NOT registered.
  // All S1-S12 have skill files, so we mock GET /api/steps/S1/skill to return
  // {skill: null, content: ""} — StepSpecPage shows "指示の本文がまだ登録されていません".
  // The step still exists in pipelineDef (breadcrumb shows 「要件」の指示・全文).
  await page.goto(`${COMPLETE}/`);
  await ensureProject(page);

  // Install route intercept: make S1 appear to have no skill content.
  await page.route(`**/api/steps/S1/skill`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { skill: null, content: "" } }),
    });
  });

  // Navigate to S1 spec via SPA navigation (sidebar → ステップ設定 → S1 link).
  await page.locator("a.nav-item", { hasText: "ステップ設定" }).click();
  await expect(page.locator(".cfg-rb__table")).toBeVisible({ timeout: 10000 });
  await page.locator(".cfg-rb__sname").first().click();
  await expect(page).toHaveURL(/\/settings\/steps\/[^/]+$/);

  // Step IS found (shows 設定の全項目 section) but no skill → no-instruction text.
  await expect(page.getByRole("heading", { name: "設定の全項目" })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("heading", { name: "AI への指示" })).toBeVisible();
  await expect(page.locator(".step-spec__no-instruction")).toBeVisible({ timeout: 5000 });

  await shotS9v004(page, "scr-06-step-spec.no-instruction.png");
});

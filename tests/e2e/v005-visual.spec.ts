// v005-visual.spec.ts — S9 visual evidence for v0.0.5.
//
// v0.0.5 is an infra/harness cycle: its USs are gates/scripts (US-01..05, validated
// by their CLI runs + integration tests) plus housekeeping. The one UI-facing change
// is US-08 (conversation-thread review badge / CTA). This spec captures the real
// browser state for that surface against the real Hono backend + ScriptedOrchestrator
// (happy, port 8891), writing to aidlc-docs/v0.0.5/s9/screenshots/ keyed to the S3
// contract filenames so a reviewer can do a side-by-side comparison.
//
// v0.0.5 Evidence gaps addressed here (US-06, US-07, US-09):
//   US-06: scripted review summary 日本語化 — screenshot the review detail that a user
//          actually reads to confirm the Japanese summary text is on screen.
//   US-07: multi-turn 実サーバー確認 — use the real multi-turn server (8895, AIDLC_SCENARIO=
//          multi-turn is now in the allowed list) so the 2nd question appears natively
//          from the backend. Shows the 2-bubble conversation the user actually sees.
//   US-09: dead code 削除確認 — screenshot the working cycle-list and inbox to show
//          the app runs correctly after StepConfigPage.tsx was removed.
import { test, expect } from "@playwright/test";
import { ensureProject, shotS9v005 } from "./helpers";

const HAPPY = "http://127.0.0.1:8891";

test("SCR-02 conversation-thread.default: thread with the AI question bubble", async ({
  page,
}) => {
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("v005-thread-default");
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

  await shotS9v005(page, "scr-02-conversation-thread.default.png");
});

test("SCR-02 conversation-thread.review (US-08): review emit → 「できあがりの確認」 badge in inbox", async ({
  page,
}) => {
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("v005-thread-review");
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

  // Answer the free-text question → the run resumes and emits a visual_review.
  const textarea = page.locator("textarea.thread-q-free__input").first();
  await textarea.fill("もの ごとにまとめる");
  await page.getByRole("button", { name: /まとめて送信して再開/ }).click();
  await expect(page.locator(".thread-bubble--human")).toBeVisible();

  // US-08: the inbox now shows the review card with the 「できあがりの確認」 badge.
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const reviewCard = page.getByRole("listitem").filter({ hasText: "できあがりの確認" }).first();
  await expect(reviewCard).toBeVisible({ timeout: 10000 });

  await shotS9v005(page, "scr-02-conversation-thread.review.png");
});

// ── US-08 THREAD SURFACE: review emit → thread header badge + in-thread CTA ──
// AC: 会話スレッド画面自体(ヘッダーバッジ + スレッド本文の CTA)がレビュー状態を
// 正確に反映すること。
// Evidence: review emit 後にスレッド画面(URL /cycles/<id>/thread)に留まった状態で
// スクリーンショットを撮る。トップバーに「◎ できあがりの確認」バッジが見え、
// スレッド本文に「できあがりを確認する」CTA が表示されることを確認する。
test("US-08 THREAD SURFACE: review emit → thread header shows review badge and in-thread CTA", async ({
  page,
}) => {
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("v005-us08-thread-badge");
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

  // Answer the free-text question → the run resumes and emits a visual_review.
  const textarea = page.locator("textarea.thread-q-free__input").first();
  await textarea.fill("もの ごとにまとめる");
  await page.getByRole("button", { name: /まとめて送信して再開/ }).click();
  await expect(page.locator(".thread-bubble--human")).toBeVisible();

  // US-08 THREAD SURFACE: stay on the thread view and wait for the review-ready
  // panel to appear. The thread polls every 3 s; timeout covers 3 poll cycles
  // plus server processing time.
  await expect(page.locator(".thread-review-ready")).toBeVisible({ timeout: 15000 });

  // The topbar badge should now say "できあがりの確認" (StateBadge variant="review"
  // renders with class "badge--review").
  await expect(page.locator(".badge--review")).toBeVisible();

  // Capture the thread surface in review state as the primary evidence artifact.
  await shotS9v005(page, "us-08-thread-review-badge.png");
});

// ── US-06: scripted review summary 日本語化 ──────────────────────────────────
// AC: scripted レビュー summary が日本語で読める。
// Evidence: ユーザーが S1 に回答してレビュー詳細ページを開いたとき、画面に
// 日本語サマリーが見える(英語 placeholder "Step output / Deterministic scripted result"
// ではない)。
//
// 実装注記: SCRIPTED_BLOCKS の "直したこと" は gen→gate→eval 経路で使われる(E2E では
// verification.observations の設定が必要なため browser フローでは到達不可 — gen-eval.spec.ts
// のコメント参照)。happy フロー(resume PATH A)の ResultEmitted は "ステップ出力" タイトルの
// 日本語ブロック。US-06 の本旨「英語 placeholder を日本語化する」は両経路で達成されており、
// ここでは happy フロー経由でユーザーが実際に見る日本語レビュー詳細を証拠として撮る。

test("US-06: review detail shows Japanese summary text the user reads (not English placeholder)", async ({
  page,
}) => {
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("v005-us06-jp-summary");
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

  // Navigate to inbox → click "確認する" to open the review detail.
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const reviewCard = page.getByRole("listitem").filter({ hasText: "できあがりの確認" }).first();
  await expect(reviewCard).toBeVisible({ timeout: 10000 });
  await reviewCard.getByRole("link", { name: /確認する/ }).first().click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/q\/[^/]+$/);

  // Assert the review summary title is Japanese (not the old English "Step output").
  // happy フロー経由の確認: resume PATH A の ResultEmitted が "ステップ出力" タイトルで
  // 日本語化済みであることを確認する。
  await expect(page.locator(".block-card__kind", { hasText: "概要" })).toBeVisible();
  await expect(page.locator(".block-summary__title")).toBeVisible();
  // The title must be Japanese (the old English placeholder was "Step output").
  await expect(page.locator(".block-summary__title")).toContainText("ステップ出力");
  // Body text is also Japanese (old: "Deterministic scripted result.").
  await expect(page.locator(".block-summary__body")).toContainText("スクリプテッド");

  await shotS9v005(page, "us-06-review-detail-japanese-summary.png");
});

// ── US-07: multi-turn 実サーバー確認 ────────────────────────────────────────
// AC: multi-turn シナリオが happy フォールバックせず正しくルーティングされる。
// Evidence: ユーザーが S1 に回答すると AIから追加質問が届き、スレッドに2つの
// AI バブルが時系列で積み重なる(1バブル目=最初の質問、2バブル目=追加質問)。
// 今サイクルで server.ts の allowed 配列に "multi-turn" を追加したので、
// 8895 ポートのサーバーが実際に multi-turn シナリオを処理する。

const MULTITURN = "http://127.0.0.1:8895";

test("US-07: multi-turn server (8895) — user answers Q1, AI appends a 2nd question in the thread", async ({
  page,
}) => {
  await page.goto(`${MULTITURN}/`);
  await ensureProject(page);

  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("v005-us07-multiturn");
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

  // First AI bubble with the initial question is visible.
  await expect(page.locator(".thread-bubble--ai").first()).toBeVisible();

  // Answer turn 1: "もの ごとにまとめる".
  const textarea = page.locator("textarea.thread-q-free__input").first();
  await expect(textarea).toBeVisible();
  await textarea.fill("もの ごとにまとめる");
  await page.getByRole("button", { name: /まとめて送信して再開/ }).click();

  // Human bubble confirms the answer was recorded.
  await expect(page.locator(".thread-bubble--human")).toBeVisible();

  // The multi-turn server emits a FOLLOW-UP question natively (not via mock).
  // ConversationThread polls and appends the 2nd AI bubble below the human bubble.
  await expect(page.locator(".thread-bubble--ai")).toHaveCount(2, { timeout: 15000 });

  // Confirm the follow-up question text is visible to the user.
  await expect(page.locator("text=追加質問")).toBeVisible();

  await shotS9v005(page, "us-07-multiturn-two-ai-bubbles.png");
});

// ── US-09: dead code 削除(StepConfigPage.tsx 削除後のアプリ動作確認) ─────────
// AC: 削除後も web build / playwright が green(参照が残っていない)。
// Evidence: ユーザーが普段使う「サイクル一覧」「受信箱」画面が壊れていないことを
// 実際の画面で確認する(StepConfigPage が無くても通常動線が動く)。

test("US-09: app works normally after StepConfigPage.tsx removed — cycle list visible", async ({
  page,
}) => {
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  // Cycle list view — the primary landing surface a user sees.
  await expect(
    page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first(),
  ).toBeVisible();

  await shotS9v005(page, "us-09-cycle-list-no-stepconfig.png");
});

test("US-09: inbox works normally after StepConfigPage.tsx removed", async ({
  page,
}) => {
  await page.goto(`${HAPPY}/`);
  await ensureProject(page);

  // Create a cycle and start S1 to populate the inbox with a question card.
  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("v005-us09-inbox-test");
  await page.getByRole("button", { name: "作成して開く" }).click();

  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  await expect(page.getByRole("region", { name: "あなたの対応待ち" })).toBeVisible();

  // Navigate to inbox — user's primary hub for pending AI questions.
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "質問" }).first()).toBeVisible();

  await shotS9v005(page, "us-09-inbox-no-stepconfig.png");
});

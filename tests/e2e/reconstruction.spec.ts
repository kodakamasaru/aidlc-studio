// reconstruction.spec.ts — US-08 工程の再構成 E2E.
//
// 2 テストで検証:
//   1. サイクル再構成 UI: S1 を実フロー(Q回答→ResultEmitted→承認)で完了させ、
//      EngineService.onRolelessResult が ReconstructionProposalEmitted を emit するのを
//      待ってから /cycles/:id/reconstruction に遷移し、.recon-list に実提案(差分リスト)が
//      表示されることを assert してスクリーンショットを撮る。
//      承認後にサイクル詳細に遷移することも確認。
//      (VARIABLE server port 8898; happy シナリオ)
//   2. グローバル再構成 UI: /settings/steps の「工程を組み直す」ボタン →
//      /settings/reconstruction → .recon-list → 「既定を保存」→ /settings/steps。
//
// S9 視覚証拠は shotS9v004 で保存する。
import { test, expect } from "@playwright/test";
import { ensureProject, shotS9v004 } from "./helpers";

const VARIABLE = "http://127.0.0.1:8898";

// ── 1. Cycle reconstruction UI ─────────────────────────────────
//
// 実フロー:
//   サイクル作成 → S1 start → 質問に回答(loop.spec と同手順) →
//   ResultEmitted で onRolelessResult が reconstruction launch を起動 →
//   GET /api/cycles/:id/reconstruction-proposal が 200 になるまで待機 →
//   /cycles/:id/reconstruction に遷移 → .recon-list に差分リストを assert →
//   shotS9v004 で撮影 → 承認 → /cycles/:id に戻る。

test("cycle reconstruction: runs S1 to generate proposal then renders diff list", async ({
  page,
}) => {
  // ── 1. Setup: register project + create cycle ─────────────────
  await page.goto(`${VARIABLE}/`);
  await ensureProject(page);

  await page
    .getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ })
    .first()
    .click();
  const goalField = page.getByLabel("サイクル名(ゴール)");
  await expect(goalField).toBeVisible();
  await goalField.fill("再構成テスト");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByRole("region", { name: "Phase パイプライン" })).toBeVisible();
  const cycleUrl = page.url();
  const cycleId = cycleUrl.split("/cycles/")[1]?.split("/")[0] ?? "";

  // ── 2. Start S1 ───────────────────────────────────────────────
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();

  // Scripted happy emits QuestionRaised immediately → human-waiting state.
  await expect(
    page.getByRole("region", { name: "あなたの対応待ち" }),
  ).toBeVisible();

  // ── 3. Answer the question via ConversationThread ─────────────
  // Navigate to inbox, find the question card, click to open thread.
  const inboxNav = page.locator("a.nav-item", { hasText: "受信箱" });
  await inboxNav.click();
  const qCard = page.getByRole("listitem").filter({ hasText: "質問" });
  await expect(qCard).toBeVisible();
  await qCard.getByRole("link", { name: /回答する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/thread$/);

  // Thread shows the AI bubble; fill the free-text answer and submit.
  await expect(page.locator(".thread-bubble--ai")).toBeVisible();
  const textarea = page.locator("textarea.thread-q-free__input").first();
  await expect(textarea).toBeVisible();
  await textarea.fill("もの ごとにまとめる");
  await page.getByRole("button", { name: /まとめて送信して再開/ }).click();

  // Human bubble confirms the answer was submitted.
  await expect(page.locator(".thread-bubble--human")).toBeVisible();

  // ── 4. Visual review card → approve ──────────────────────────
  // Navigate to inbox to pick up the visual_review card.
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const reviewCard = page.getByRole("listitem").filter({ hasText: "できあがりの確認" });
  await expect(reviewCard).toBeVisible();

  // Open the review page.
  await reviewCard.getByRole("link", { name: /確認する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/q\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /できあがり確認/ })).toBeVisible();

  // Approve → cycle detail (S1 done; ResultEmitted already emitted so
  // onRolelessResult has already launched the reconstruction run).
  await page.getByRole("button", { name: /承認して次 Phase へ/ }).click();
  await expect(page).toHaveURL(new RegExp(`/cycles/${cycleId}$`));

  // ── 5. Wait for reconstruction proposal (GET 200) ─────────────
  // onRolelessResult runs immediately after ResultEmitted (synchronous in the
  // scripted adapter), so by the time we reach here the proposal is persisted.
  // Poll to guard against any timing variance in the test environment.
  await expect
    .poll(
      async () => {
        const status = await page.evaluate(async (id: string) => {
          const res = await fetch(`/api/cycles/${id}/reconstruction-proposal`);
          return res.status;
        }, cycleId);
        return status;
      },
      { timeout: 5000, intervals: [200, 500, 1000] },
    )
    .toBe(200);

  // ── 6. 受信箱の「工程の再構成」カードから提案画面へ(実フロー / 直接遷移しない)──
  await page.locator("a.nav-item", { hasText: "受信箱" }).click();
  const reconCard = page.getByRole("listitem").filter({ hasText: "工程の再構成" });
  await expect(reconCard).toBeVisible();
  await reconCard.getByRole("link", { name: /確認する/ }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+\/reconstruction$/);

  // .recon-list must be visible with real diff entries (not the empty state).
  const reconList = page.locator(".recon-list");
  await expect(reconList).toBeVisible();

  // Assert at least the "delete" diff entry for S4 is rendered.
  // The scripted proposal: S1/S2/S3=keep, S4=delete, CUSTOM-QA=add.
  // ReconstructionThread renders .recon-row.recon-deleted for deleted steps.
  await expect(reconList.locator(".recon-deleted").first()).toBeVisible();

  // The empty-state banner must NOT be present.
  await expect(page.locator(".thread-empty")).not.toBeVisible();

  // Screenshot the real proposal diff list (overwrite any prior empty-state capture).
  await shotS9v004(page, "scr-02-conversation-thread.reconstruction.png");

  // ── 6b. 会話で修正(再提案)— modify ブランチ。旧実装は reconstruction カードへ
  // answerQuestion(verdict:"answer") を送って 400 InvalidVerdict になっていた(検出ギャップ:
  // E2E が approve しか踏まず modify を一度も歩いていなかった)。今は専用 repropose で再提案。
  await page.getByText("直したい所を会話で").click();
  await page.getByLabel("修正の指示").fill("S4 を残して。レビュー工程も見直して");
  await page.getByRole("button", { name: /送信して再提案/ }).click();
  // 回帰防止: 400 / InvalidVerdict が出ないこと。
  await expect(page.getByText(/InvalidVerdict/)).toHaveCount(0);
  // 再提案(REVISED)が届く: CUSTOM-QA が見直し版ラベルに変わる(polling で差分検知)。
  await expect(page.getByText(/再提案で見直し/)).toBeVisible({ timeout: 10000 });

  // ── 7. Approve → back to cycle detail ─────────────────────────
  const approveBtn = page.getByRole("button", { name: /承認して進む/ });
  await expect(approveBtn).toBeVisible();
  await approveBtn.click();
  await expect(page).toHaveURL(new RegExp(`/cycles/${cycleId}$`));
});

// ── 2. Global reconstruction UI ────────────────────────────────

test("global reconstruction: CTA in /settings/steps and /settings/reconstruction saves pipeline", async ({
  page,
}) => {
  await page.goto(`${VARIABLE}/`);
  await ensureProject(page);

  // Navigate to global step settings.
  await page.locator("a.nav-item", { hasText: "ステップ設定" }).click();
  await expect(page).toHaveURL(`${VARIABLE}/settings/steps`);

  // "工程を組み直す" button must be visible (US-08 entry point from SCR-04 global).
  const reconBtn = page.getByRole("button", { name: /工程を組み直す/ });
  await expect(reconBtn).toBeVisible();
  await shotS9v004(page, "scr-04-step-config-readback.global-with-recon.png");

  // Click → navigate to /settings/reconstruction.
  await reconBtn.click();
  await expect(page).toHaveURL(`${VARIABLE}/settings/reconstruction`);

  // Thread body shows the reconstruction list.
  await expect(page.locator(".recon-list")).toBeVisible();

  // "既定を保存 →" footer CTA is visible with "この既定で保存" option pre-selected.
  await expect(page.getByRole("button", { name: /既定を保存/ })).toBeVisible();
  await shotS9v004(page, "scr-02-conversation-thread.reconstruction-global.png");

  // Clicking save navigates back to /settings/steps.
  await page.getByRole("button", { name: /既定を保存/ }).click();
  await expect(page).toHaveURL(`${VARIABLE}/settings/steps`);
});

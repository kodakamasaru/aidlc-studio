// gen-eval.spec.ts — S9 validation of the v0.0.2 gen→gate→eval quality harness
// through the BROWSER, with real DB + real server + deterministic scripted AI.
//
// Proves the user's two top priorities (S1 Q-01/Q-03): "AI が勝手に要件を落とす"
// → completeness gate, and "レビューでコードを見ないといけない" → rich rendering.
//
// Two flows, each on its own scenario server (own file DB):
//   - complete (8893): set a Step verification contract (US-06) → that step now
//     runs gen→gate→eval (US-02) → evaluator addresses every requirement →
//     review shows a 2/2 completeness table (US-07) → approve → phase advances.
//   - descope  (8894): same opt-in, but the evaluator leaves one gap WITH a
//     reasoned descope request → the Inbox surfaces a 見送り判断 card → the human
//     decides 見送る (US-03) → the requirement is routed to the backlog, never
//     silently dropped.
import { test, expect, type Page } from "@playwright/test";
import { ensureProject, shotS9 } from "./helpers";

const COMPLETE = "http://127.0.0.1:8893";
const DESCOPE = "http://127.0.0.1:8894";

/**
 * US-06: open ステップ設定, give S1 a verification observation, save. A step that
 * declares verification observations launches as a gen→gate→eval generator on
 * its next run — captured as the us-06 evidence shot when `shotName` is set.
 */
async function optInGenEval(page: Page, shotName: string | null): Promise<void> {
  await page.goto(new URL("/settings/steps", page.url()).toString());
  await expect(page.getByRole("heading", { name: "ステップ設定" })).toBeVisible();

  const s1Form = page.locator("form.step-card", {
    has: page.locator("#S1-obs"),
  });
  await expect(s1Form.locator(".step-card__id")).toHaveText("S1");
  // Before opt-in the step is a legacy single run.
  await expect(s1Form.getByText("単一実行")).toBeVisible();

  await page
    .locator("#S1-obs")
    .fill("要件1: 一覧が表示される\n要件2: 空状態が表示される");
  // The badge flips to 自動チェックあり as soon as observations are present.
  await expect(
    s1Form.locator(".step-card__badge", { hasText: "自動チェックあり" }),
  ).toBeVisible();

  await s1Form.getByRole("button", { name: "設定を保存" }).click();
  await expect(s1Form.getByText("保存しました")).toBeVisible();
  if (shotName) await shotS9(page, shotName);

  // The badge above is pure client state; prove the contract was actually
  // PERSISTED (PATCH succeeded + server stored it) by reloading the page and
  // confirming the saved observations survive a fresh fetch. This is what makes
  // the step launch as a generator on the next run.
  await page.reload();
  await expect(page.locator("#S1-obs")).toHaveValue(
    /要件1: 一覧が表示される[\s\S]*要件2: 空状態が表示される/,
  );
  await expect(
    page
      .locator("form.step-card", { has: page.locator("#S1-obs") })
      .locator(".step-card__badge", { hasText: "自動チェックあり" }),
  ).toBeVisible();
}

/** Create a cycle through the modal and start the S1 phase (now a generator). */
async function startS1(page: Page, goal: string): Promise<void> {
  await page
    .getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ })
    .first()
    .click();
  await page.getByLabel("サイクル名(ゴール)").fill(goal);
  await page.getByRole("button", { name: "作成して開く" }).click();

  await expect(
    page.getByRole("region", { name: "Phase パイプライン" }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();
}

test("complete: step opt-in runs gen→gate→eval and renders a 2/2 completeness review", async ({
  page,
}) => {
  await page.goto(`${COMPLETE}/`);
  await ensureProject(page);

  // US-06 — declare the verification contract from the UI.
  await optInGenEval(page, "us-06.step-config.png");

  // SCR-01 full-spec — ステップの指示・全文(契約の read-only 全文ビュー)。
  await page.goto(`${COMPLETE}/settings/steps/S1`);
  await expect(page.getByRole("heading", { name: /の指示・全文/ })).toBeVisible();
  await shotS9(page, "us-06.full-spec.png");

  // US-02 — back to the cycle list, create + start the gen→gate→eval phase.
  await page.goto(`${COMPLETE}/`);
  await startS1(page, "gen-eval 完全達成");

  // The generator emits → deterministic gate passes → evaluator addresses every
  // requirement → the app raises a visual_review. Pick it up in the Inbox.
  await page.goto(`${COMPLETE}/inbox`);
  await expect(page.getByRole("heading", { name: "受信箱" })).toBeVisible();
  const reviewCard = page
    .getByRole("listitem")
    .filter({ hasText: "できあがりの確認" });
  await expect(reviewCard).toBeVisible();
  await reviewCard.getByRole("link", { name: /確認する/ }).click();

  // US-07 — the review detail renders the completeness table (2/2 対応) plus the
  // block stream. This is the "approve without reading code" evidence.
  await expect(
    page.getByRole("heading", { name: /できあがり確認/ }),
  ).toBeVisible();
  const completeness = page.getByRole("region", { name: "やりたかったことの 対応状況" });
  await expect(completeness).toBeVisible();
  await expect(completeness.getByText("2/2 反映済み")).toBeVisible();
  // Both requirements are marked addressed.
  await expect(completeness.getByText("要件1: 一覧が表示される")).toBeVisible();
  await expect(completeness.getByText("要件2: 空状態が表示される")).toBeVisible();
  await shotS9(page, "us-07.completeness-review.png");

  // US-02 — approve finalizes the evaluator run and advances the phase.
  await page.getByRole("button", { name: /承認して次 Phase へ/ }).click();
  await expect(page.getByText("次に「画面」を始められます")).toBeVisible();
  await shotS9(page, "us-02.gen-eval-advanced.png");
});

test("descope: a gap surfaces a reasoned 見送り判断 and routes to the backlog", async ({
  page,
}) => {
  await page.goto(`${DESCOPE}/`);
  await ensureProject(page);

  await optInGenEval(page, null);

  await page.goto(`${DESCOPE}/`);
  await startS1(page, "gen-eval 見送りあり");

  // The evaluator addressed r1 but raised a reasoned descope request for r2; the
  // app holds the run in await-descope. The Inbox surfaces a 見送り判断 card.
  await page.goto(`${DESCOPE}/inbox`);
  const descopeCard = page
    .getByRole("listitem")
    .filter({ hasText: "見送りの相談" });
  await expect(descopeCard).toBeVisible();
  await descopeCard.getByRole("link", { name: /判断する/ }).click();

  // US-03 — the descope decision screen shows the requirement, the AI's reason,
  // and the 4 AI-DLC choices. The requirement is never silently dropped.
  await expect(
    page.getByRole("heading", { name: "AI からの見送り申請" }),
  ).toBeVisible();
  await expect(page.getByText("要件2: 空状態が表示される")).toBeVisible();
  await expect(page.getByText(/今サイクルでは一覧表示を優先/)).toBeVisible();
  const choices = page.getByRole("radiogroup", { name: "見送り判断の選択肢" });
  await expect(choices.getByRole("radio", { name: /つくってもらう/ })).toBeVisible();
  await expect(choices.getByRole("radio", { name: /今回は見送る/ })).toBeVisible();
  await expect(choices.getByRole("radio", { name: /後回し/ })).toBeVisible();
  await expect(
    choices.getByRole("radio", { name: /前のステップからやり直す/ }),
  ).toBeVisible();
  await shotS9(page, "us-03.descope-decision.png");

  // 見送る を選んで「この内容で進める」→ 不可逆確認 → 見送って進める(scr-05.confirm)。
  // 要件は backlog に回り、黙殺されない。
  await choices.getByRole("radio", { name: /今回は見送る/ }).check();
  await page.getByRole("button", { name: /この内容で進める/ }).click();
  await page.getByRole("button", { name: "見送って進める" }).click();
  await expect(page).toHaveURL(/\/cycles\/[^/]+$/);
  await expect(
    page.getByRole("region", { name: "Phase パイプライン" }),
  ).toBeVisible();
  await shotS9(page, "us-03.descope-resolved.png");

  await page.goto(`${DESCOPE}/inbox`);
  await expect(
    page.getByRole("listitem").filter({ hasText: "見送りの相談" }),
  ).toHaveCount(0);
});

test("US-06: 対話式編集 — 要望から提案を受け、差分を承認して適用できる(scr-01.settings)", async ({
  page,
}) => {
  await page.goto(`${COMPLETE}/`);
  await ensureProject(page);
  await page.goto(`${COMPLETE}/settings/steps`);

  // S2(観点 未設定)で対話式編集: 要望 → 提案 → 差分 → 承認して適用。
  const s2Form = page.locator("form.step-card", { has: page.locator("#S2-obs") });
  await s2Form.getByLabel(/AI に相談/).fill("空状態も表示されることを確認したい");
  await s2Form.getByRole("button", { name: "提案を見る" }).click();

  const proposal = s2Form.getByRole("group", { name: "AI からの変更案" });
  await expect(proposal).toBeVisible();
  await expect(proposal.getByText("空状態も表示されることを確認したい")).toBeVisible();
  await shotS9(page, "scr-01.settings-dialog.png");

  // 承認して適用 → 保存され、フォームの観点にも反映される。
  await proposal.getByRole("button", { name: "この内容で適用" }).click();
  await expect(s2Form.getByText("保存しました")).toBeVisible();
  await expect(s2Form.locator("#S2-obs")).toHaveValue(/空状態も表示されることを確認したい/);
});

// 注: scr-02.sendback(申請なし gap の auto-rework)は UI に独立画面として現れない。
// UI 経路では review/human-waiting に集約され、auto-rework の loud-stall 自体は
// integration(gen-gate-eval.test.ts「auto-rework」)で検証済み。よって E2E では撮らない。

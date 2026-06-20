// live-run-s1.ts — S9 live 縦経路 1 本完走を実ブラウザ操作 + 実 claude で走らせ、
// 「どう操作して → こうなったか」を画像(各操作の前後)+ 動画で証拠化する。
//
// 前提: live backend が :8787 で起動済(AIDLC_ORCHESTRATOR=live / sandbox DB /
// sandbox project 作成済)。本スクリプトは同梱 chromium で実サイトを操作する。
//
// 出力: aidlc-docs/v0.0.5/s9/live/NN-*.png(操作ステップ毎)+ video(*.webm)。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE = process.env.AIDLC_LIVE_BASE ?? "http://127.0.0.1:8787";
const OUT = resolve(import.meta.dir, "..", "aidlc-docs", "v0.0.5", "s9", "live");
mkdirSync(OUT, { recursive: true });

const ANSWER_TIMEOUT_MS = 300_000; // 実 claude の 1 ターンを待つ上限(5分)
const MAX_TURNS = 6;

let stepN = 0;
async function shot(page: import("playwright").Page, label: string): Promise<void> {
  stepN += 1;
  const name = `${String(stepN).padStart(2, "0")}-${label}.png`;
  await page.screenshot({ path: join(OUT, name), fullPage: true });
  console.log(`  📸 ${name}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: "dark",
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

try {
  // ── 操作1: アプリを開く ───────────────────────────────────────────────
  console.log("操作1: アプリを開く");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "open-app");

  // first-run: プロジェクト未登録ならリポジトリ登録(API で作成済なら出ない)
  const repoInput = page.getByLabel("リポジトリパス");
  if (await repoInput.isVisible().catch(() => false)) {
    await repoInput.fill("/tmp/aidlc-sandbox");
    await page.getByRole("button", { name: "リポジトリを登録" }).click();
    await page.waitForTimeout(800);
  }

  // ── 操作2: サイクルを作る ─────────────────────────────────────────────
  console.log("操作2: サイクルを作る");
  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill("ランチ予約アプリ(live 確認)");
  await shot(page, "create-cycle-dialog");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await page.getByRole("region", { name: "Phase パイプライン" }).waitFor({ state: "visible" });
  await page.waitForTimeout(500);
  await shot(page, "cycle-created");

  // ── 操作3: S1「要件」を始める → 実 claude が走る ──────────────────────
  console.log("操作3: S1 を開始(実 claude 起動)");
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();
  await page.waitForTimeout(1500);
  await shot(page, "s1-started-running");

  // ── 操作4..: 実 claude の質問に答える(複数ターン対応)→ レビューを待つ ──
  let reviewReached = false;
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    console.log(`操作: ターン${turn} — 受信箱で AI の出力を待つ(最大 ${ANSWER_TIMEOUT_MS / 1000}s)`);
    await page.locator("a.nav-item", { hasText: "受信箱" }).click();
    await page.waitForTimeout(500);

    const reviewCard = page.getByRole("listitem").filter({ hasText: "できあがりの確認" }).first();
    const questionCard = page.getByRole("listitem").filter({ hasText: "質問" }).first();

    // 質問 / レビュー のどちらかが出るまでポーリング(reload で最新化)。
    const deadline = Date.now() + ANSWER_TIMEOUT_MS;
    let kind: "review" | "question" | "none" = "none";
    while (Date.now() < deadline) {
      if (await reviewCard.isVisible().catch(() => false)) { kind = "review"; break; }
      if (await questionCard.isVisible().catch(() => false)) { kind = "question"; break; }
      await page.waitForTimeout(2500);
      await page.reload({ waitUntil: "networkidle" }).catch(() => {});
      await page.locator("a.nav-item", { hasText: "受信箱" }).click().catch(() => {});
    }

    if (kind === "review") {
      await shot(page, `turn${turn}-review-card`);
      reviewReached = true;
      break;
    }
    if (kind === "none") {
      console.log("  ⏱ タイムアウト: AI 出力が出なかった(stall 等)。現状を撮影。");
      await shot(page, `turn${turn}-timeout`);
      break;
    }

    // 質問カード → スレッドで回答。
    await shot(page, `turn${turn}-question-card`);
    await questionCard.getByRole("link", { name: /回答する/ }).click();
    await page.waitForURL(/\/cycles\/[^/]+\/thread$/, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, `turn${turn}-thread-question`);

    // 回答 UI: free-text なら記入、選択肢なら先頭を選ぶ。
    const freeInput = page.locator("textarea.thread-q-free__input").first();
    if (await freeInput.isVisible().catch(() => false)) {
      await freeInput.fill("初回スコープは最小限で。メニュー閲覧・注文・締切前キャンセル・管理者の注文一覧のみ。");
    } else {
      const opt = page.locator(".thread-q-option, [role='radio'], button.thread-q-choice").first();
      if (await opt.isVisible().catch(() => false)) await opt.click().catch(() => {});
    }
    await shot(page, `turn${turn}-answer-filled`);
    await page
      .getByRole("button", { name: /まとめて送信して再開|送信して再開|回答を送信/ })
      .first()
      .click();
    await page.waitForTimeout(1500);
    await shot(page, `turn${turn}-answer-submitted`);
  }

  // ── 操作: レビューを開いて承認する ───────────────────────────────────
  if (reviewReached) {
    console.log("操作: レビューを開いて承認");
    const reviewCard = page.getByRole("listitem").filter({ hasText: "できあがりの確認" }).first();
    await reviewCard.getByRole("link", { name: /確認する/ }).first().click();
    await page.waitForTimeout(1200);
    await shot(page, "review-detail");

    const approve = page.getByRole("button", { name: /承認|これでOK|確定/ }).first();
    if (await approve.isVisible().catch(() => false)) {
      await approve.click();
      await page.waitForTimeout(1500);
      await shot(page, "approved");
    } else {
      console.log("  承認ボタンが見つからない(レビュー詳細を撮影済)。");
    }
  }

  console.log(
    reviewReached
      ? "\n✅ live 縦経路: 質問→回答→レビュー まで到達"
      : "\n⚠ live 縦経路: レビュー未到達(撮影で状態を残した)",
  );
} catch (e) {
  console.error("live-run-s1: error", e);
  await shot(page, "error-state").catch(() => {});
} finally {
  await context.close(); // flush video
  await browser.close();
  console.log(`\n出力: ${OUT}`);
}

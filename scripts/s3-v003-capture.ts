/**
 * S3 視覚契約スクショ生成(v0.0.3)。
 *
 * v0.0.3 は新規画面ゼロ・新規トークンゼロ。既存の実コンポーネントへの 2 差分
 * (レビュー証拠ブロックの実画像化 / ステップ設定の注記バナー)を「実アプリに
 * v0.0.3 変更を当てて」撮る。HTML モックを手書きすると実コンポーネントから
 * 視覚ドリフトするため、実 CSS をそのまま使う本方式を採る(本サイクルの DRY/
 * 正本一元化方針とも整合)。視覚トークンは v0.0.2/s3 を継承(再定義しない)。
 *
 * 前提: complete シナリオのサーバを起動しておく:
 *   rm -f /tmp/aidlc-cap.db*; PORT=8899 AIDLC_DB=/tmp/aidlc-cap.db \
 *     AIDLC_SCENARIO=complete bun run src/main.ts &
 * 実行:
 *   bun run scripts/s3-v003-capture.ts
 *
 * 出力(視覚契約 = S7/S8 はこの png と scr-NN-*.md だけ参照):
 *   aidlc-docs/v0.0.3/s3/screenshots/scr-01-review-evidence.default.png
 *   aidlc-docs/v0.0.3/s3/screenshots/scr-01-review-evidence.failed.png
 *   aidlc-docs/v0.0.3/s3/screenshots/scr-02-step-config-snapshot.default.png
 */
import { chromium, type Page } from "playwright";
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";

const BASE = process.env.CAP_BASE ?? "http://127.0.0.1:8899";
const ROOT = resolve(import.meta.dir, "..");
const SHOTS = resolve(ROOT, "aidlc-docs/v0.0.3/s3/screenshots");

// 実画像の代用: 既存の実アプリ画面を verify-ui スクショに見立てる
const sampleShot = resolve(
  ROOT,
  "aidlc-docs/v0.0.2/s3/screenshots/scr-01-cycle-list.list.png",
);
const dataUrl = `data:image/png;base64,${readFileSync(sampleShot).toString("base64")}`;

async function ensureProject(page: Page): Promise<void> {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  // Wait for the SPA to mount: either the first-run repo form or the cycle list.
  await page
    .getByRole("button", { name: /リポジトリを登録|新規サイクル|最初のサイクルを作る/ })
    .first()
    .waitFor({ timeout: 15000 });
  const repoInput = page.getByLabel("リポジトリパス");
  if (await repoInput.isVisible().catch(() => false)) {
    await repoInput.fill(ROOT);
    await page.getByRole("button", { name: "リポジトリを登録" }).click();
    await page
      .getByRole("button", { name: /新規サイクル|最初のサイクルを作る/ })
      .first()
      .waitFor();
  }
}

async function optInGenEval(page: Page): Promise<void> {
  await page.goto(`${BASE}/settings/steps`);
  await page.getByRole("heading", { name: "ステップ設定" }).waitFor();
  await page
    .locator("#S1-obs")
    .fill("要件1: 一覧が表示される\n要件2: 空状態が表示される");
  const s1Form = page.locator("form.step-card", { has: page.locator("#S1-obs") });
  await s1Form.getByRole("button", { name: "設定を保存" }).click();
  await s1Form.getByText("保存しました").waitFor();
}

async function startS1(page: Page): Promise<void> {
  await page.goto(`${BASE}/`);
  await page
    .getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ })
    .first()
    .click();
  await page.getByLabel("サイクル名(ゴール)").fill("v0.0.3 視覚契約");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await page.getByRole("region", { name: "Phase パイプライン" }).waitFor();
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();
}

async function openReview(page: Page): Promise<void> {
  await page.goto(`${BASE}/inbox`);
  await page.getByRole("heading", { name: "受信箱" }).waitFor();
  const card = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: /確認する/ }) })
    .first();
  await card.getByRole("link", { name: /確認する/ }).click();
  await page.getByRole("heading", { name: /できあがり確認/ }).waitFor();
}

const STEP_BANNER =
  "ⓘ ここでの編集は “これから作る” サイクルに反映されます。作成済みのサイクルは作成時点の構成に固定です。";

async function main(): Promise<void> {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });

  const pre = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser = await chromium.launch(
    existsSync(pre) ? { executablePath: pre } : {},
  );
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  await ensureProject(page);
  await optInGenEval(page);
  await startS1(page);
  await openReview(page);

  // scr-01 default: 証拠ブロックに実画像
  await page.evaluate((url) => {
    const ph = document.querySelector(".screenshot-block__placeholder");
    if (ph) {
      const img = document.createElement("img");
      img.src = url;
      img.className = "screenshot-block__img";
      img.setAttribute("alt", "実際に動いた画面");
      ph.replaceWith(img);
    }
  }, dataUrl);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(SHOTS, "scr-01-review-evidence.default.png"),
    fullPage: true,
    animations: "disabled",
  });
  console.log("✓ scr-01-review-evidence.default.png");

  // scr-01 failed: 取得失敗 → placeholder + 理由(reload で素の placeholder に戻す)
  await page.reload();
  await page.getByRole("heading", { name: /できあがり確認/ }).waitFor();
  await page.evaluate(() => {
    const label = document.querySelector(".screenshot-block__placeholder span:last-child");
    if (label) label.textContent = "スクリーンショット取得に失敗: タイムアウト(再取得できます)";
  });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: join(SHOTS, "scr-01-review-evidence.failed.png"),
    fullPage: true,
    animations: "disabled",
  });
  console.log("✓ scr-01-review-evidence.failed.png");

  // scr-02 default: ステップ設定に注記バナー
  await page.goto(`${BASE}/settings/steps`);
  await page.getByRole("heading", { name: "ステップ設定" }).waitFor();
  await page.evaluate((text) => {
    const heading = Array.from(document.querySelectorAll("h1,h2,p")).find((el) =>
      /各ステップの設定|ステップ設定/.test(el.textContent ?? ""),
    );
    const banner = document.createElement("div");
    banner.textContent = text;
    banner.style.cssText =
      "margin:16px 0;padding:12px 16px;border:1px solid rgba(124,131,253,0.45);border-radius:10px;background:rgba(124,131,253,0.10);color:#c7c9f7;font-size:13px;line-height:1.6;";
    const anchor = heading?.closest("section,header,div") ?? heading;
    anchor?.parentElement?.insertBefore(banner, anchor.nextSibling);
  }, STEP_BANNER);
  await page.waitForTimeout(200);
  await page.screenshot({
    path: join(SHOTS, "scr-02-step-config-snapshot.default.png"),
    fullPage: true,
    animations: "disabled",
  });
  console.log("✓ scr-02-step-config-snapshot.default.png");

  await browser.close();
  console.log(`\n3 screenshots → ${SHOTS}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

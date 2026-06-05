/**
 * S2.5 スクリーンショット生成。
 *   bun run s2.5:capture
 *
 * - aidlc-docs/s2.5/*.html を Playwright(headless Chromium)で開く
 * - scr-NN-*.html: section[data-state] ごとに screenshots/{base}.{state}.png
 * - tokens.html: ページ全体を screenshots/tokens.png
 * - 撮影前に screenshots/ を全削除(古い html と新しい html の混在防止)
 *
 * 注意: ここで撮った .png と scr-NN-*.md だけが S6/S7 の視覚契約。*.html は S6/S7 Read 禁止。
 */
import { chromium } from "playwright";
import { readdirSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

const S25_DIR = resolve(import.meta.dir, "../aidlc-docs/s2.5");
const SHOTS_DIR = join(S25_DIR, "screenshots");

function main() {
  return (async () => {
    // 1. 古い screenshots を全削除して作り直す
    rmSync(SHOTS_DIR, { recursive: true, force: true });
    mkdirSync(SHOTS_DIR, { recursive: true });

    const htmlFiles = readdirSync(S25_DIR).filter((f) => f.endsWith(".html")).sort();
    if (htmlFiles.length === 0) {
      console.error("no .html found in", S25_DIR);
      process.exit(1);
    }

    // 事前配置の chromium があれば使う(なければ playwright 管理ブラウザに任せる)
    const preinstalled = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
    const browser = await chromium.launch(
      existsSync(preinstalled) ? { executablePath: preinstalled } : {},
    );
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });

    let count = 0;
    for (const file of htmlFiles) {
      const url = pathToFileURL(join(S25_DIR, file)).href;
      await page.goto(url, { waitUntil: "networkidle" });
      const base = basename(file, ".html");

      if (base === "tokens") {
        const out = join(SHOTS_DIR, "tokens.png");
        await page.screenshot({ path: out, fullPage: true });
        console.log("✓ tokens.png");
        count++;
        continue;
      }

      const states = await page.$$eval("section[data-state]", (els) =>
        els.map((el) => el.getAttribute("data-state") ?? "default"),
      );
      for (const state of states) {
        const el = await page.$(`section[data-state="${state}"]`);
        if (!el) continue;
        await el.scrollIntoViewIfNeeded();
        const out = join(SHOTS_DIR, `${base}.${state}.png`);
        await el.screenshot({ path: out });
        console.log(`✓ ${base}.${state}.png`);
        count++;
      }
    }

    await browser.close();
    console.log(`\n${count} screenshots → ${SHOTS_DIR}`);
  })();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

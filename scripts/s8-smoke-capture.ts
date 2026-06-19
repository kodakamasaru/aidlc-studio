/**
 * S8 smoke capture — screenshot the running real app's NEW v0.0.4 screens to
 * confirm the integration actually renders (typecheck alone can't prove the
 * visual contract). Server must be running at localhost:8787 (scripted) with a
 * seeded cycle. Pass the cycle id + project id as args.
 *
 *   bun run scripts/s8-smoke-capture.ts <cycleId> <projectId>
 *
 * Output: aidlc-docs/v0.0.4/s8/screenshots/<name>.real.png
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const cid = process.argv[2];
const pid = process.argv[3];
if (!cid || !pid) {
  console.error("usage: bun run scripts/s8-smoke-capture.ts <cycleId> <projectId>");
  process.exit(1);
}

const OUT = resolve(import.meta.dir, "../aidlc-docs/v0.0.4/s8/screenshots");
const BASE = "http://localhost:8787";

const SHOTS: ReadonlyArray<{ name: string; path: string }> = [
  { name: "scr-01-inbox.real", path: `/inbox` },
  { name: "scr-05-cycle-progress.real", path: `/cycles/${cid}` },
  { name: "scr-02-conversation-thread.real", path: `/cycles/${cid}/thread` },
  { name: "scr-02-conversation-thread.hearing.real", path: `/cycles/${cid}/thread?hearing=1` },
  { name: "scr-04-step-config-readback.global.real", path: `/settings/steps` },
  { name: "scr-04-step-config-readback.cycle.real", path: `/cycles/${cid}/settings` },
];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const preinstalled = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser = await chromium.launch(
    existsSync(preinstalled) ? { executablePath: preinstalled } : {},
  );
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  for (const shot of SHOTS) {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800); // let polling/render settle
    await page.screenshot({ path: join(OUT, `${shot.name}.png`), fullPage: true });
    console.log(`captured ${shot.name} ← ${shot.path}`);
  }

  await browser.close();
  if (errors.length > 0) {
    console.log(`\n=== ${errors.length} console errors ===`);
    for (const e of [...new Set(errors)]) console.log("  •", e);
  } else {
    console.log("\nno console errors");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

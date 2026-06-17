// ui-shot — self-contained visual check for the running web UI.
//
// Why this exists: the Playwright MCP "bridge" needs a browser extension that
// isn't wired here, so it times out. This launches Playwright's OWN bundled
// chromium (no system-Chrome / no extension dependency) — `bunx playwright
// install chromium` once — drives to a URL, saves a full-page screenshot, and
// scans the rendered DOM for 契約① leaks (file paths / .md / aidlc-docs dirs in
// human-facing text). It returns a non-zero exit when a leak is found so it can
// gate a verify step, and prints the visible headings so a human/agent can eyeball.
//
// Usage:
//   bun run scripts/ui-shot.ts <path-or-url> [outfile.png]
//   bun run scripts/ui-shot.ts /questions/<id>            (defaults to localhost:5173)
//   bun run scripts/ui-shot.ts http://localhost:5173/inbox /tmp/inbox.png
import { chromium } from "playwright";

const BASE = process.env.AIDLC_WEB_BASE ?? "http://localhost:5173";
const arg = process.argv[2];
if (!arg) {
  console.error("usage: bun run scripts/ui-shot.ts <path-or-url> [outfile.png]");
  process.exit(2);
}
const url = arg.startsWith("http") ? arg : `${BASE}${arg.startsWith("/") ? "" : "/"}${arg}`;
const outfile = process.argv[3] ?? "/tmp/ui-shot.png";

// 契約①: human-facing text must not leak file paths / aidlc-docs structure / .md names.
const LEAK = /aidlc-docs|\.(md|html|ya?ml|tsx?|jsx?|json)\b|\]\(|\/s\d{1,2}\//;

const browser = await chromium.launch(); // bundled chromium — no channel/extension needed
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200); // let async card content settle
  await page.screenshot({ path: outfile, fullPage: true });

  // Scan the FULL rendered text, line by line — NOT just headings. An earlier
  // version only looked at h1/h2/h3 and missed a メタ `<li>入力参照: brief.md</li>`
  // leak, giving a false PASS. Precision requires checking every visible line.
  const lines: string[] = await page.evaluate(() => {
    const root = document.querySelector("main") ?? document.body;
    const raw = (root as HTMLElement).innerText || "";
    return raw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  });

  const leaks = lines.filter((t) => LEAK.test(t));
  console.log(`SHOT: ${outfile}  (${url})`);
  console.log(`scanned ${lines.length} visible lines`);
  if (leaks.length > 0) {
    console.log("LEAKING LINES:");
    for (const t of leaks) console.log("  ❌ " + JSON.stringify(t.slice(0, 100)));
  }
  if (leaks.length > 0) {
    console.error(`\n契約①違反: ${leaks.length} 件のパス露出を検出`);
    process.exit(1);
  }
  console.log("\n契約①: パス露出なし ✓");
} finally {
  await browser.close();
}

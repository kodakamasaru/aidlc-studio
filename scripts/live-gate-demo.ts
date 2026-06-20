// US-01 live gate demo — 実 claude + 実操作で「証拠ゲートが done を実際に止める」ことを
// 録画する。前提: setup-gate-demo.ts で S1=requiresLiveEvidence のプロジェクトを作り、
// その DB で live backend を :8787 起動済。
//
// BLOCK: 証拠なしで S1 を起動 → claude が done 自己申告 → ゲートが拒否して stall。
// PASS : S1 起動直後に manifest を生成(capturedAt > runStartedAt)→ done → ゲート通過。
//
// 出力: aidlc-docs/v0.0.5/s9/live-gate/NN-*.png + video。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { writeEvidenceManifest, toUtcInstant } from "../src/infra/evidence/evidence-manifest";

const BASE = process.env.AIDLC_LIVE_BASE ?? "http://127.0.0.1:8787";
const SANDBOX = process.env.AIDLC_SANDBOX ?? "/tmp/aidlc-sandbox";
const OUT = resolve(import.meta.dir, "..", "aidlc-docs", "v0.0.5", "s9", "live-gate");
mkdirSync(OUT, { recursive: true });
const WAIT_MS = 300_000;

let n = 0;
async function shot(page: import("playwright").Page, label: string): Promise<void> {
  n += 1;
  await page.screenshot({ path: join(OUT, `${String(n).padStart(2, "0")}-${label}.png`), fullPage: true });
  console.log(`  📸 ${String(n).padStart(2, "0")}-${label}.png`);
}

interface RunView { id: string; state: string; failureReason?: string; startedAt: string }
interface CycleView { version: string; phases?: { runs?: RunView[] }[] }
async function fetchCycle(id: string): Promise<{ version: string; runs: RunView[] }> {
  const res = (await fetch(`${BASE}/api/cycles/${id}`).then((r) => r.json())) as {
    data?: CycleView;
  } & CycleView;
  const c: CycleView = res.data ?? res;
  const runs: RunView[] = (c.phases ?? []).flatMap((p) => p.runs ?? []);
  return { version: c.version, runs };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: "dark",
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

/** Create a cycle via UI, start S1, return cycleId. */
async function createAndStart(title: string): Promise<string> {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const repoInput = page.getByLabel("リポジトリパス");
  if (await repoInput.isVisible().catch(() => false)) {
    await repoInput.fill(SANDBOX);
    await page.getByRole("button", { name: "リポジトリを登録" }).click();
    await page.waitForTimeout(600);
  }
  await page.getByRole("button", { name: /最初のサイクルを作る|新規サイクル/ }).first().click();
  await page.getByLabel("サイクル名(ゴール)").fill(title);
  await page.getByRole("button", { name: "作成して開く" }).click();
  await page.getByRole("region", { name: "Phase パイプライン" }).waitFor({ state: "visible" });
  await page.waitForTimeout(400);
  const cycleId = page.url().match(/\/cycles\/([^/]+)/)?.[1] ?? "";
  await page
    .getByRole("region", { name: "現在のステップ" })
    .getByRole("button", { name: /「要件」を始める/ })
    .click();
  await page.waitForTimeout(1500);
  return cycleId;
}

async function pollRun(cycleId: string, until: (r: RunView[]) => boolean): Promise<RunView[]> {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const { runs } = await fetchCycle(cycleId);
    if (runs.length > 0 && until(runs)) return runs;
    await page.waitForTimeout(2500);
  }
  return (await fetchCycle(cycleId)).runs;
}

try {
  // ── BLOCK: 証拠なし → ゲートが done を拒否 ──────────────────────────────
  console.log("BLOCK: 証拠なしで S1 起動 → ゲートが done を拒否して stall");
  const blockId = await createAndStart("ゲート確認(証拠なし)");
  await shot(page, "block-s1-started");
  const blockRuns = await pollRun(blockId, (r) => r.some((x) => x.state === "stalled"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "block-stalled");
  const stalled = blockRuns.find((r) => r.state === "stalled");
  console.log(`  → run ${stalled?.id} state=${stalled?.state} reason=${stalled?.failureReason}`);

  // ── PASS: 起動直後に証拠を生成 → ゲート通過 ───────────────────────────
  console.log("PASS: S1 起動直後に証拠 manifest 生成(capturedAt > runStartedAt)→ done 通過");
  const passId = await createAndStart("ゲート確認(証拠あり)");
  await shot(page, "pass-s1-started");
  const early = await pollRun(passId, (r) => r.length > 0);
  const { version } = await fetchCycle(passId);
  const startedAt = early[0]!.startedAt;
  const capturedAt = toUtcInstant(new Date(new Date(startedAt).getTime() + 1000));
  writeEvidenceManifest(
    SANDBOX,
    version,
    "S1",
    [
      { kind: "log", path: "_evidence/S1/run.log", capturedAt },
      { kind: "screenshot", path: "_evidence/S1/shot.png", capturedAt },
    ],
    capturedAt,
  );
  console.log(`  → manifest written (version=${version}, capturedAt=${capturedAt})`);
  const passRuns = await pollRun(passId, (r) => r.some((x) => x.state === "done" || x.state === "stalled"));
  await page.locator("a.nav-item", { hasText: "受信箱" }).click().catch(() => {});
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "pass-after-evidence");
  const passRun = passRuns.find((r) => r.state === "done") ?? passRuns[passRuns.length - 1];
  console.log(`  → run ${passRun?.id} state=${passRun?.state}`);

  console.log(
    `\n結果: BLOCK=${stalled ? "stalled(ゲート拒否)✅" : "?"} / PASS=${passRun?.state === "done" ? "done(ゲート通過)✅" : passRun?.state}`,
  );
} catch (e) {
  console.error("live-gate-demo error", e);
  await shot(page, "error").catch(() => {});
} finally {
  await context.close();
  await browser.close();
  console.log(`出力: ${OUT}`);
}

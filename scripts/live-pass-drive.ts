// live-pass-drive — US-01 PASS 経路の実機実証(実 claude)。
// 前提: live-pass-setup 済 + live backend が :8787(AIDLC_ORCHESTRATOR=live /
// AIDLC_DB=/tmp/aidlc-passs9.db)で起動済。
//
// 操作: 対象サイクルを開く → S9「検証」を実 claude で開始 → 質問に答える →
// レビュー到達 → 承認 → done。最後に「証拠が実 run で自動生成され、ゲートが done を
// 許可した(= PASS 経路)」を機械検証する:
//   ① /tmp/aidlc-passs9/aidlc-docs/v0.0.1/_evidence/S9/manifest.json が存在(live が自動生成)
//   ② API で S9 phase = done(ゲートが許可)
// 証拠 screenshot は aidlc-docs/v0.0.5/s9/live-pass/ に連番保存。
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE = process.env.AIDLC_LIVE_BASE ?? "http://127.0.0.1:8787";
const CYCLE = process.env.AIDLC_LIVE_CYCLE;
const EVIDENCE = "/tmp/aidlc-passs9/aidlc-docs/v0.0.1/_evidence/S9/manifest.json";
const OUT = resolve(import.meta.dir, "..", "aidlc-docs", "v0.0.5", "s9", "live-pass");
mkdirSync(OUT, { recursive: true });
if (!CYCLE) { console.error("AIDLC_LIVE_CYCLE 未指定"); process.exit(2); }

const ANSWER_TIMEOUT_MS = 360_000; // 実 claude 1 ターン上限(6分)
const MAX_TURNS = 8;

let n = 0;
async function shot(page: import("playwright").Page, label: string): Promise<void> {
  n += 1;
  await page.screenshot({ path: join(OUT, `${String(n).padStart(2, "0")}-${label}.png`), fullPage: true });
  console.log(`  📸 ${String(n).padStart(2, "0")}-${label}.png`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: "dark",
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
let reviewReached = false;

try {
  console.log("操作1: サイクルを開く");
  await page.goto(`${BASE}/cycles/${CYCLE}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "cycle-open");

  console.log("操作2: S9「検証」を開始(実 claude 起動)");
  const startBtn = page.getByRole("button", { name: /始める/ }).first();
  await startBtn.waitFor({ state: "visible", timeout: 15_000 });
  await startBtn.click();
  await page.waitForTimeout(1500);
  await shot(page, "s9-started");

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    console.log(`ターン${turn}: 受信箱で AI 出力を待つ(最大 ${ANSWER_TIMEOUT_MS / 1000}s)`);
    await page.locator("a.nav-item", { hasText: "受信箱" }).click().catch(() => {});
    await page.waitForTimeout(500);
    const reviewCard = page.getByRole("listitem").filter({ hasText: "できあがりの確認" }).first();
    const questionCard = page.getByRole("listitem").filter({ hasText: "質問" }).first();

    const deadline = Date.now() + ANSWER_TIMEOUT_MS;
    let kind: "review" | "question" | "none" = "none";
    while (Date.now() < deadline) {
      if (await reviewCard.isVisible().catch(() => false)) { kind = "review"; break; }
      if (await questionCard.isVisible().catch(() => false)) { kind = "question"; break; }
      await page.waitForTimeout(2500);
      await page.reload({ waitUntil: "networkidle" }).catch(() => {});
      await page.locator("a.nav-item", { hasText: "受信箱" }).click().catch(() => {});
    }

    if (kind === "review") { await shot(page, `turn${turn}-review`); reviewReached = true; break; }
    if (kind === "none") { await shot(page, `turn${turn}-timeout`); break; }

    await shot(page, `turn${turn}-question`);
    await questionCard.getByRole("link", { name: /回答する/ }).click();
    await page.waitForURL(/\/cycles\/[^/]+\/thread$/, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const freeInput = page.locator("textarea.thread-q-free__input").first();
    if (await freeInput.isVisible().catch(() => false)) {
      await freeInput.fill("最小スコープでよい。主要シナリオ(チャンネル作成・投稿・未読・メンション・検索)を一通り検証。");
    } else {
      const opt = page.locator(".thread-q-option, [role='radio'], button.thread-q-choice").first();
      if (await opt.isVisible().catch(() => false)) await opt.click().catch(() => {});
    }
    await shot(page, `turn${turn}-answer`);
    await page.getByRole("button", { name: /まとめて送信して再開|送信して再開|回答を送信/ }).first().click();
    await page.waitForTimeout(1500);
  }

  if (reviewReached) {
    console.log("操作: レビューを開いて承認");
    await page.locator("a.nav-item", { hasText: "受信箱" }).click().catch(() => {});
    await page.waitForTimeout(500);
    const reviewCard = page.getByRole("listitem").filter({ hasText: "できあがりの確認" }).first();
    await reviewCard.getByRole("link", { name: /確認する/ }).first().click();
    await page.waitForTimeout(1200);
    await shot(page, "review-detail");
    const approve = page.getByRole("button", { name: /承認|これでOK|確定/ }).first();
    if (await approve.isVisible().catch(() => false)) {
      await approve.click();
      await page.waitForTimeout(2500);
      await shot(page, "approved");
    }
  }
} catch (e) {
  console.error("live-pass-drive error", e);
  await shot(page, "error").catch(() => {});
} finally {
  await context.close();
  await browser.close();
}

// ── 機械検証: PASS 経路の成立 ──────────────────────────────────────────────
await new Promise((r) => setTimeout(r, 2000));
const manifestExists = existsSync(EVIDENCE);
let s9State = "unknown";
try {
  const res = await fetch(`${BASE}/cycles/${CYCLE}`);
  const cycle = (await res.json()) as { phases: { step: string; state: string }[] };
  s9State = cycle.phases.find((p) => p.step === "S9")?.state ?? "missing";
} catch (e) { console.error("API 取得失敗", e); }

console.log("\n===== US-01 PASS 経路 検証結果 =====");
console.log(`レビュー到達        : ${reviewReached}`);
console.log(`① 証拠 manifest 自動生成: ${manifestExists ? "あり(live が生成)" : "なし"}  (${EVIDENCE})`);
console.log(`② S9 phase 状態      : ${s9State}`);
const pass = manifestExists && s9State === "done";
console.log(`\nPASS 経路実証: ${pass ? "✅ 成立(実 run の証拠でゲートが done を許可)" : "❌ 未成立(下の状態を確認)"}`);
console.log(`証拠 screenshot/動画: ${OUT}`);
process.exit(pass ? 0 : 1);

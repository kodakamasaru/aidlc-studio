// Phase 5 visual E2E config. Drives the REAL browser against the REAL Hono
// server (bun:sqlite file DB) + deterministic ScriptedOrchestrator.
//
// Four web servers run in parallel, each with its own file DB + scenario:
//   - happy    (PORT 8891): full Q → visual_review → done loop. baseURL points here.
//   - stall    (PORT 8892): stall-first; exercises the stalled/retry surface.
//   - complete (PORT 8893): gen→gate→eval, every requirement addressed (S9 / US-07
//                           rich rendering: completeness 2/2 → review → approve).
//   - descope  (PORT 8894): gen→gate→eval with one gap + reasoned descope request
//                           (S9 / US-03 descope decision → backlog).
//
// workers:1 + fullyParallel:false: the servers hold file DBs, so serializing
// avoids cross-test races (e.g. the happy DB is shared across happy specs).
import { defineConfig, devices } from "@playwright/test";

const HAPPY_PORT = 8891;
const STALL_PORT = 8892;
const COMPLETE_PORT = 8893;
const DESCOPE_PORT = 8894;
const HAPPY_DB = "/tmp/aidlc-e2e-happy.db";
const STALL_DB = "/tmp/aidlc-e2e-stall.db";
const COMPLETE_DB = "/tmp/aidlc-e2e-complete.db";
const DESCOPE_DB = "/tmp/aidlc-e2e-descope.db";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "tests/e2e/.report" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${HAPPY_PORT}`,
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /responsive\.spec\.ts/,
    },
    {
      // 390px-wide responsive sanity only.
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `rm -f ${HAPPY_DB}* && PORT=${HAPPY_PORT} AIDLC_DB=${HAPPY_DB} AIDLC_SCENARIO=happy bun run src/main.ts`,
      url: `http://127.0.0.1:${HAPPY_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `rm -f ${STALL_DB}* && PORT=${STALL_PORT} AIDLC_DB=${STALL_DB} AIDLC_SCENARIO=stall-first bun run src/main.ts`,
      url: `http://127.0.0.1:${STALL_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `rm -f ${COMPLETE_DB}* && PORT=${COMPLETE_PORT} AIDLC_DB=${COMPLETE_DB} AIDLC_SCENARIO=gen-eval-complete bun run src/main.ts`,
      url: `http://127.0.0.1:${COMPLETE_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `rm -f ${DESCOPE_DB}* && PORT=${DESCOPE_PORT} AIDLC_DB=${DESCOPE_DB} AIDLC_SCENARIO=gen-eval-descope bun run src/main.ts`,
      url: `http://127.0.0.1:${DESCOPE_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});

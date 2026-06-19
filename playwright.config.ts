// Phase 5 visual E2E config. Drives the REAL browser against the REAL Hono
// server (bun:sqlite file DB) + deterministic ScriptedOrchestrator.
//
// Eight web servers run in parallel, each with its own file DB + scenario:
//   - happy         (PORT 8891): full Q → visual_review → done loop. baseURL.
//   - stall         (PORT 8892): stall-first; exercises the stalled/retry surface.
//   - complete      (PORT 8893): gen→gate→eval, every req addressed (US-07).
//   - descope       (PORT 8894): gen→gate→eval with gap + reasoned descope (US-03).
//   - multi-turn    (PORT 8895): Unit-04 multi-turn: resume turn1 re-asks, turn2 done.
//   - config-hearing(PORT 8896): BU-3: launch emits 2 config questions (US-06).
//   - variable      (PORT 8898): US-08: variable pipeline cycle (S4省略+独自工程) via real backend.
//   - empty-inbox   (PORT 8899): US-08 F-1 inbox.empty screenshot — isolated happy server,
//                                 NO cycles created before the test. Dedicated so that other
//                                 tests (stalled.spec, reconstruction.spec, etc.) cannot
//                                 leave reconstruction/question cards behind and break the
//                                 "empty inbox" assertion.
//
// workers:1 + fullyParallel:false: the servers hold file DBs, so serializing
// avoids cross-test races (e.g. the happy DB is shared across happy specs).
import { defineConfig, devices } from "@playwright/test";

const HAPPY_PORT = 8891;
const STALL_PORT = 8892;
const COMPLETE_PORT = 8893;
const DESCOPE_PORT = 8894;
const MULTITURN_PORT = 8895;
const HEARING_PORT = 8896;
const MISSING_CTX_PORT = 8897;
const VARIABLE_PORT = 8898;
const EMPTY_INBOX_PORT = 8899;
const HAPPY_DB = "/tmp/aidlc-e2e-happy.db";
const STALL_DB = "/tmp/aidlc-e2e-stall.db";
const COMPLETE_DB = "/tmp/aidlc-e2e-complete.db";
const DESCOPE_DB = "/tmp/aidlc-e2e-descope.db";
const MULTITURN_DB = "/tmp/aidlc-e2e-multiturn.db";
const HEARING_DB = "/tmp/aidlc-e2e-hearing.db";
const MISSING_CTX_DB = "/tmp/aidlc-e2e-missing-ctx.db";
const VARIABLE_DB = "/tmp/aidlc-e2e-variable.db";
const EMPTY_INBOX_DB = "/tmp/aidlc-e2e-empty-inbox.db";

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
    {
      command: `rm -f ${MULTITURN_DB}* && PORT=${MULTITURN_PORT} AIDLC_DB=${MULTITURN_DB} AIDLC_SCENARIO=multi-turn bun run src/main.ts`,
      url: `http://127.0.0.1:${MULTITURN_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `rm -f ${HEARING_DB}* && PORT=${HEARING_PORT} AIDLC_DB=${HEARING_DB} AIDLC_SCENARIO=config-hearing bun run src/main.ts`,
      url: `http://127.0.0.1:${HEARING_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `rm -f ${MISSING_CTX_DB}* && PORT=${MISSING_CTX_PORT} AIDLC_DB=${MISSING_CTX_DB} AIDLC_SCENARIO=missing-context bun run src/main.ts`,
      url: `http://127.0.0.1:${MISSING_CTX_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // US-08: variable pipeline server — same happy scenario, but E2E will
      // call the new reconstruct endpoint to build a non-standard step set.
      command: `rm -f ${VARIABLE_DB}* && PORT=${VARIABLE_PORT} AIDLC_DB=${VARIABLE_DB} AIDLC_SCENARIO=happy bun run src/main.ts`,
      url: `http://127.0.0.1:${VARIABLE_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // US-08 F-1: dedicated inbox-empty server — isolated happy instance used
      // ONLY by the SCR-01 inbox.empty screenshot test. No other test touches
      // this server, so the inbox stays empty (no reconstruction/question cards).
      command: `rm -f ${EMPTY_INBOX_DB}* && PORT=${EMPTY_INBOX_PORT} AIDLC_DB=${EMPTY_INBOX_DB} AIDLC_SCENARIO=happy bun run src/main.ts`,
      url: `http://127.0.0.1:${EMPTY_INBOX_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});

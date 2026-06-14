/**
 * S8 mock 突合 スクリーンショット撮影ハーネス
 *
 * 各 S3 視覚契約 state に対応する REAL アプリ画面を撮影する。
 * dev server や外部プロセスは一切不要 — 各 state ごとに
 * buildServer({ orchestrator: "scripted", dbPath: ":memory:" }) で
 * 独立したインメモリサーバを起動し、ドメインコンストラクタで正確な
 * 状態をシードして Playwright で撮影後に閉じる。
 *
 * 出力: aidlc-docs/v0.0.4/s8/screenshots/<scr-NN-base>.<state>.real.png
 *       aidlc-docs/v0.0.4/s8/capture-notes.md
 *
 * 実行:
 *   bun run scripts/s8-mock-capture.ts
 */

import { chromium, type Browser, type Page } from "playwright";
import { mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "hono/bun";
import type { Hono } from "hono";
import { createApp } from "../src/infra/http/app";
import { buildServer } from "../src/server";
import type { Ports } from "../src/app/ports/composition";
import { raiseQuestion } from "../src/domain/question/question";
import type { QuestionPayload } from "../src/domain/question/question";
import { buildReview } from "../src/domain/review/review";
import {
  createCycle as domainCreateCycle,
  startPhase as domainStartPhase,
  advanceRun,
  approvePhase,
  completeCycle,
  backtrackTo,
  relaunchPhase,
  version,
} from "../src/domain/cycle/cycle";
import {
  ProjectId,
  CycleId,
  PhaseId,
  RunId,
  TaskId,
  QuestionId,
} from "../src/domain/shared/ids";
import { Step, CANONICAL_STEPS } from "../src/domain/shared/vocab";
import { instant } from "../src/domain/shared/primitives";
import { unwrap } from "../src/domain/shared/result";
import { openProject } from "../src/domain/project/project";
import type { Project } from "../src/domain/project/project";
import type { StepDef } from "../src/domain/project/project";
import type { StepContracts } from "../src/domain/project/step-contracts";

// ── 出力先 ────────────────────────────────────────────────────────
const OUT_DIR = resolve(import.meta.dir, "../aidlc-docs/v0.0.4/s8/screenshots");
const SHOTS_SRC_DIR = resolve(import.meta.dir, "../.verify-screenshots");

// ── 共通定数 ──────────────────────────────────────────────────────
const T0 = unwrap(instant("2026-01-01T00:00:00.000Z"));
const T1 = unwrap(instant("2026-01-01T00:01:00.000Z"));

// ── 画像 src ヘルパー ──────────────────────────────────────────
function resolveScreenshotSrc(filename: string): string {
  const p = join(SHOTS_SRC_DIR, filename);
  if (existsSync(p)) return `/api/screenshots/${filename}`;
  // 1x1 transparent PNG fallback
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
}

// ── ドメインシードヘルパー ─────────────────────────────────────

function seedProject(
  ports: Ports,
  opts?: {
    pipelineStepIds?: string[];
    projectId?: string;
    /** per-step contracts keyed by step id (e.g. { S1: { output: { profileKind: "要件一覧" } } }) */
    stepContracts?: Readonly<Record<string, StepContracts>>;
    /** per-step human labels for non-canonical steps (overrides sid-as-label fallback) */
    stepLabels?: Readonly<Record<string, string>>;
  },
): Project {
  const stepIds = opts?.pipelineStepIds ?? CANONICAL_STEPS.map((s) => s.id as string);
  const contractsMap = opts?.stepContracts ?? {};
  const labelsMap = opts?.stepLabels ?? {};
  const pipelineDef: StepDef[] = stepIds.map((sid, i) => {
    const canonical = CANONICAL_STEPS.find((c) => (c.id as string) === sid);
    return {
      id: Step(sid),
      label: (canonical?.label ?? labelsMap[sid] ?? sid) as string,
      order: i,
      skillRef: canonical?.skillRef ?? (sid as any),
      ...(contractsMap[sid] ? { contracts: contractsMap[sid] } : {}),
    };
  });
  const pid = opts?.projectId ?? "project-1";
  const proj = unwrap(
    openProject({
      id: ProjectId(pid),
      repoPath: "/tmp/demo-repo",
      vision: "v-1" as any,
      pipelineDef,
      env: {
        modelName: "claude-sonnet-4-6",
        worktreeRoot: "/tmp/worktrees",
        stallTimeoutMin: 10,
        maxAttempt: 3,
      },
      createdAt: T0,
    }),
  );
  ports.repos.projects.save(proj);
  return proj;
}

function seedCycle(
  ports: Ports,
  project: Project,
  opts?: {
    cycleId?: string;
    cycleVersion?: string;
    title?: string;
    pipelineStepIds?: string[];
  },
) {
  const stepIds =
    opts?.pipelineStepIds ?? project.pipelineDef.map((s) => s.id as string);
  const cid = opts?.cycleId ?? "cycle-1";
  const cycleVer = unwrap(version(opts?.cycleVersion ?? "v0.0.4"));
  const pipeline = stepIds.map((sid, i) => {
    const canonical = CANONICAL_STEPS.find((c) => (c.id as string) === sid);
    // Mirror the real cycle-service: snapshot the project's per-step contracts
    // onto the phase's stepDef at creation. Cycle-scope settings read THIS
    // snapshot (not the live project), so without this copy the readback would
    // show "調整なし" even when the project defines contracts.
    const projStep = project.pipelineDef.find((s) => (s.id as string) === sid);
    return {
      phaseId: PhaseId(`${cid}-ph-${sid}`),
      step: Step(sid),
      stepDef: {
        label: (canonical?.label ?? sid) as string,
        order: i,
        skillRef: canonical?.skillRef ?? (sid as any),
        ...(projStep?.contracts ? { contracts: projStep.contracts } : {}),
      },
    };
  });
  const cycle = unwrap(
    domainCreateCycle({
      id: CycleId(cid),
      projectId: project.id,
      version: cycleVer,
      title: opts?.title ?? "Human Inbox 縦ループ v0.0.4",
      taskIds: [],
      createdAt: T0,
      pipeline,
    }),
  );
  ports.repos.cycles.save(cycle);
  return cycle;
}

function startFirstPhase(ports: Ports, cycleId: string, runId: string, step = "S1") {
  const cycle = ports.repos.cycles.findById(CycleId(cycleId))!;
  const started = unwrap(
    domainStartPhase(cycle, {
      step: Step(step),
      runId: RunId(runId),
      startedAt: T0,
    }),
  );
  ports.repos.cycles.save(started);
  return started;
}

function advanceCycleRun(
  ports: Ports,
  cycleId: string,
  runId: string,
  to: "stalled" | "done" | "failed",
  reason?: string,
) {
  const cycle = ports.repos.cycles.findById(CycleId(cycleId))!;
  const adv = unwrap(
    advanceRun(cycle, {
      runId: RunId(runId),
      to,
      at: T1,
      ...(reason ? { reason } : {}),
    }),
  );
  ports.repos.cycles.save(adv);
  return adv;
}

function markPhaseDone(ports: Ports, cycleId: string, step: string) {
  const cycle = ports.repos.cycles.findById(CycleId(cycleId))!;
  const ph = cycle.phases.find((p) => (p.step as string) === step)!;
  const updated = {
    ...cycle,
    phases: cycle.phases.map((p) =>
      p.id === ph.id ? { ...p, state: "done" as const } : p,
    ),
  };
  ports.repos.cycles.save(updated);
  return updated;
}

function seedQuestion(
  ports: Ports,
  qid: string,
  runId: string,
  cycleId: string,
  payload: QuestionPayload,
  taskId?: string,
) {
  const q = raiseQuestion({
    id: QuestionId(qid),
    runId: RunId(runId),
    cycleId: CycleId(cycleId),
    ...(taskId !== undefined ? { taskId: TaskId(taskId) } : {}),
    payload,
    createdAt: T0,
  });
  ports.repos.questions.save(q);
  return q;
}

function seedReviewQuestion(
  ports: Ports,
  qid: string,
  runId: string,
  cycleId: string,
  step: string,
  blocks: Parameters<typeof buildReview>[0]["blocks"],
  taskId = "task-1",
  opts?: { prependMissingContext?: boolean },
) {
  const finalBlocks = opts?.prependMissingContext
    ? [
        {
          type: "summary" as const,
          title: "コンテキスト欠損警告",
          body: "⚠ missing-context — 前サイクルの成果物が見つかりません。コンテキストが不完全な状態で実行されています。この結果は不完全な情報に基づいている可能性があります。",
        },
        ...blocks,
      ]
    : [...blocks];

  const review = buildReview({
    runId: RunId(runId),
    cycleId: CycleId(cycleId),
    step: Step(step),
    taskId: TaskId(taskId),
    blocks: finalBlocks,
    producedAt: T0,
  });
  ports.repos.reviews.save(review);
  seedQuestion(ports, qid, runId, cycleId, { kind: "visual_review", review }, taskId);
}

// ── サーバ起動(ポーツをそのまま使う) ─────────────────────────

const SHOT_URL_BASE = "/api/screenshots";
const SHOT_FILE_RE = /^[A-Za-z0-9._-]+\.png$/;

function buildAppWithPorts(ports: Ports): Hono {
  const app = createApp(ports);

  // /api/screenshots route — serve from SHOTS_SRC_DIR
  app.get(`${SHOT_URL_BASE}/:file`, async (c) => {
    const file = c.req.param("file");
    if (!SHOT_FILE_RE.test(file)) return c.text("bad filename", 400);
    const candidates = [join(SHOTS_SRC_DIR, file), join(OUT_DIR, file)];
    for (const p of candidates) {
      if (existsSync(p)) {
        return new Response(Bun.file(p), {
          headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
        });
      }
    }
    return c.text("not found", 404);
  });

  // /api/test/advance-run — test-only endpoint to stall a run for harness captures.
  // NOT part of the real API. Used only for scr-02 stall capture so the run can be
  // forced to stalled state AFTER the browser submits answers (creating React history).
  app.post("/api/test/advance-run", async (c) => {
    const body = await c.req.json<{ cycleId: string; runId: string; to: string }>();
    const cycle = ports.repos.cycles.findById(CycleId(body.cycleId));
    if (!cycle) return c.json({ success: false, error: "CycleNotFound" }, 404);
    const result = advanceRun(cycle, {
      runId: RunId(body.runId),
      to: body.to as "stalled" | "done" | "failed",
      at: unwrap(instant(new Date().toISOString())),
      reason: "ハーネス強制終了(スクリーンショット撮影用)",
    });
    if ("error" in result) return c.json({ success: false, error: result.error }, 400);
    ports.repos.cycles.save(result.value);
    return c.json({ success: true, data: null });
  });

  // /api/test/complete-cycle — test-only endpoint to complete a cycle (run→done,
  // phase review→done, cycle done) AFTER the browser has submitted answers so
  // the React history bubble stays in state. Used for scr-02 completed capture.
  app.post("/api/test/complete-cycle", async (c) => {
    const body = await c.req.json<{ cycleId: string; runId: string }>();
    const cycle = ports.repos.cycles.findById(CycleId(body.cycleId));
    if (!cycle) return c.json({ success: false, error: "CycleNotFound" }, 404);

    const now = unwrap(instant(new Date().toISOString()));

    // Step 1: advance run running → done (phase → review)
    const adv = advanceRun(cycle, { runId: RunId(body.runId), to: "done", at: now });
    if ("error" in adv) return c.json({ success: false, error: adv.error }, 400);

    // Step 2: approve the phase review → done (no open visual_review siblings)
    const phase = adv.value.phases.find(
      (p) => p.runs.some((r) => r.id === body.runId),
    );
    if (!phase) return c.json({ success: false, error: "PhaseNotFound" }, 404);
    const approved = approvePhase(adv.value, {
      phaseId: phase.id,
      allTaskReviewsApproved: true,
    });
    if ("error" in approved)
      return c.json({ success: false, error: approved.error }, 400);

    // Step 3: complete the cycle (all phases done → cycle done)
    const completed = completeCycle(approved.value);
    const finalCycle = "value" in completed ? completed.value : approved.value;
    ports.repos.cycles.save(finalCycle);
    return c.json({ success: true, data: null });
  });

  // SPA fallback
  const here = dirname(fileURLToPath(import.meta.url));
  const distDir = join(here, "..", "web", "dist");
  if (existsSync(distDir)) {
    const root = "./web/dist";
    app.use("/assets/*", serveStatic({ root }));
    app.get("/favicon.ico", serveStatic({ path: "./web/dist/favicon.ico" }));
    app.get("*", (c, next) => {
      if (c.req.path.startsWith("/api")) return next();
      c.header("Cache-Control", "no-cache, must-revalidate");
      return serveStatic({ path: "./web/dist/index.html" })(c, next);
    });
  }
  return app;
}

async function startServerWithPorts(
  ports: Ports,
): Promise<{ url: string; server: ReturnType<typeof Bun.serve> }> {
  const app = buildAppWithPorts(ports);
  const server = Bun.serve({ port: 0, fetch: app.fetch });
  return { url: `http://127.0.0.1:${server.port}`, server };
}

// ── Playwright screenshot helper ──────────────────────────────

async function shot(
  page: Page,
  fullUrl: string,
  outName: string,
  waitMs = 600,
): Promise<string[]> {
  const errors: string[] = [];
  const listener = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") errors.push(m.text());
  };
  page.on("console", listener);
  await page.goto(fullUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: join(OUT_DIR, `${outName}.real.png`), fullPage: true });
  console.log(`  ✓ ${outName}.real.png`);
  page.off("console", listener);
  return errors;
}

/** Shot that first scrolls the thread container to the TOP so batch-header is visible. */
async function shotScrollTop(
  page: Page,
  fullUrl: string,
  outName: string,
  waitMs = 600,
): Promise<string[]> {
  const errors: string[] = [];
  const listener = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") errors.push(m.text());
  };
  page.on("console", listener);
  await page.goto(fullUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(waitMs);
  // Scroll the thread container and window back to top so the opening AI bubble is visible.
  await page.evaluate(() => {
    const container = document.querySelector(".thread-container");
    if (container) (container as HTMLElement).scrollTop = 0;
    const page_ = document.querySelector(".thread-page");
    if (page_) (page_ as HTMLElement).scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT_DIR, `${outName}.real.png`), fullPage: true });
  console.log(`  ✓ ${outName}.real.png`);
  page.off("console", listener);
  return errors;
}

async function shotWithDelay(
  page: Page,
  fullUrl: string,
  outName: string,
  routePattern: string,
  delayMs = 5000,
): Promise<string[]> {
  const errors: string[] = [];
  const listener = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") errors.push(m.text());
  };
  page.on("console", listener);
  await page.route(`**${routePattern}**`, async (route) => {
    await new Promise((r) => setTimeout(r, delayMs));
    await route.continue();
  });
  void page.goto(fullUrl, { waitUntil: "commit" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, `${outName}.real.png`), fullPage: true });
  console.log(`  ✓ ${outName}.real.png (delayed)`);
  await page.unrouteAll();
  page.off("console", listener);
  return errors;
}

/**
 * Fill all open question cards and submit the batch.
 * Selects the first recommended option (or first option) for each question,
 * then clicks the "まとめて送信して再開" button.
 * Returns after the submission network request completes and React state updates.
 */
async function fillAndSubmitThread(page: Page): Promise<void> {
  // Wait for question items to be present
  await page.waitForSelector(".thread-q-item", { timeout: 5000 }).catch(() => {});

  // For each question, click the first recommended option, or the first option if none.
  const questionItems = await page.$$(".thread-q-item");
  for (const item of questionItems) {
    // Try clicking the recommended option first
    const recommended = await item.$(".thread-opt__rec");
    if (recommended) {
      const label = await recommended.evaluateHandle((el) => el.closest("label"));
      if (label) {
        await (label as Awaited<ReturnType<typeof page.$>>)?.click();
        await page.waitForTimeout(100);
        continue;
      }
    }
    // Fallback: click the first option label
    const firstOpt = await item.$("label.thread-opt");
    if (firstOpt) {
      await firstOpt.click();
      await page.waitForTimeout(100);
    }
  }

  // Click the submit button and wait for the network to settle
  const submitBtn = await page.$("button[aria-label*='まとめて送信']");
  if (submitBtn) {
    await submitBtn.click();
    // Wait for questions to be answered (submit bar disappears) and history to appear
    await page.waitForSelector(".thread-bubble--human", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
}

// ── State 定義 ──────────────────────────────────────────────────

interface CaptureState {
  readonly name: string;
  readonly seedNote: string;
  readonly unreachable?: string;
  readonly seed: (ports: Ports) => void;
  readonly capture: (page: Page, base: string) => Promise<string[]>;
}

const STATES: readonly CaptureState[] = [

  // ══ SCR-01 Inbox ══════════════════════════════════════════════

  {
    name: "scr-01-inbox.default",
    seedNote: "running run + 1 question card + 1 visual_review card",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");

      seedQuestion(ports, "q-1", "run-1", "cycle-1", {
        kind: "question",
        prompt: "このサイクルで優先する品質軸を教えてください。セキュリティ強化とパフォーマンス改善のどちらが重要ですか？",
        options: [
          { id: "a", label: "セキュリティ強化", hint: "認証・認可の堅牢化を最優先", recommended: true },
          { id: "b", label: "パフォーマンス改善", hint: "レスポンスタイムの最適化" },
        ],
      });

      const imgSrc = resolveScreenshotSrc("smoke.png");
      seedReviewQuestion(ports, "q-2", "run-1", "cycle-1", "S1", [
        {
          type: "summary",
          title: "要件ヒアリング完了",
          body: "## ヒアリング結果\n\nユーザーストーリー 12 本が確定しました。",
        },
        { type: "screenshot", src: imgSrc, caption: "受信箱 / デフォルト状態" },
        { type: "risk", level: "low", note: "スコープ内リスクは低。外部連携は次サイクル。" },
      ]);
    },
    capture: (page, base) => shot(page, `${base}/inbox`, "scr-01-inbox.default"),
  },

  {
    name: "scr-01-inbox.empty",
    seedNote: "no open questions — empty inbox",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
    },
    capture: (page, base) => shot(page, `${base}/inbox`, "scr-01-inbox.empty"),
  },

  {
    name: "scr-01-inbox.loading",
    seedNote: "route-delay /api/projects/* so loading skeleton renders",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
      seedQuestion(ports, "q-1", "run-1", "cycle-1", { kind: "question", prompt: "テスト質問" });
    },
    capture: (page, base) =>
      shotWithDelay(page, `${base}/inbox`, "scr-01-inbox.loading", "/api/projects/"),
  },

  // ══ SCR-02 Conversation Thread ════════════════════════════════

  {
    name: "scr-02-conversation-thread.default",
    seedNote: "running run + 3 open question cards (batch) — scroll to TOP so opening AI bubble visible",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
      seedQuestion(ports, "q-1", "run-1", "cycle-1", {
        kind: "question",
        prompt: "このシステムの主な利用者は誰ですか？",
        options: [
          { id: "a", label: "社内エンジニア", hint: "開発チームが主体", recommended: true },
          { id: "b", label: "外部クライアント", hint: "BtoB 向け" },
          { id: "c", label: "一般ユーザー", hint: "BtoC 向け" },
        ],
      });
      seedQuestion(ports, "q-2", "run-1", "cycle-1", {
        kind: "question",
        prompt: "データ量の想定規模を教えてください。",
        options: [
          { id: "a", label: "〜 1 万件", hint: "小規模" },
          { id: "b", label: "1〜10 万件", hint: "中規模", recommended: true },
          { id: "c", label: "10 万件以上", hint: "大規模" },
        ],
      });
      seedQuestion(ports, "q-3", "run-1", "cycle-1", {
        kind: "question",
        prompt: "外部サービスとの連携は必要ですか？",
        options: [
          { id: "a", label: "不要", hint: "スタンドアロン", recommended: true },
          { id: "b", label: "必要(OAuth/SSO)", hint: "認証外部委譲" },
        ],
      });
    },
    // [B] scroll to top so the batch header "【質問】3件…" is visible
    capture: (page, base) =>
      shotScrollTop(page, `${base}/cycles/cycle-1/thread`, "scr-02-conversation-thread.default"),
  },

  {
    name: "scr-02-conversation-thread.empty",
    seedNote: "running run + 0 open questions → empty/starting state",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
    },
    capture: (page, base) =>
      shot(page, `${base}/cycles/cycle-1/thread`, "scr-02-conversation-thread.empty"),
  },

  {
    name: "scr-02-conversation-thread.hearing",
    seedNote: "?hearing=1 + 2 open question cards — scroll to TOP so opening AI bubble visible",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
      seedQuestion(ports, "q-1", "run-1", "cycle-1", {
        kind: "question",
        prompt: "S1 要件ヒアリングの成果物は何を想定しますか？",
        options: [
          { id: "a", label: "ユーザーストーリー一覧", hint: "US 形式で列挙", recommended: true },
          { id: "b", label: "機能仕様書", hint: "詳細な仕様" },
        ],
      });
      seedQuestion(ports, "q-2", "run-1", "cycle-1", {
        kind: "question",
        prompt: "行き詰まり(stall)時の対応はどうしますか？",
        options: [
          { id: "a", label: "自動やり直し(最大 3 回)", recommended: true },
          { id: "b", label: "人間にすぐ通知" },
        ],
      });
    },
    // [B] scroll to top so the hearing batch header is visible
    capture: (page, base) =>
      shotScrollTop(page, `${base}/cycles/cycle-1/thread?hearing=1`, "scr-02-conversation-thread.hearing"),
  },

  {
    name: "scr-02-conversation-thread.running",
    seedNote: "[A] Drive in-session flow: navigate, answer questions, submit → running indicator shows with answer history",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
      // Seed 3 open questions so we can fill and submit them to create history
      seedQuestion(ports, "q-1", "run-1", "cycle-1", {
        kind: "question",
        prompt: "このシステムの主な利用者は誰ですか？",
        options: [
          { id: "a", label: "社内のエンジニアのみ", hint: "まずは社内で小さく試す", recommended: true },
          { id: "b", label: "社内外の利用者も含む", hint: "公開範囲が広がり、認証機器の設計が前倒しになる" },
          { id: "c", label: "限定パートナーまで", hint: "一部の外部に絞って共有" },
        ],
      });
      seedQuestion(ports, "q-2", "run-1", "cycle-1", {
        kind: "question",
        prompt: "同時編集の想定人数は？",
        options: [
          { id: "a", label: "2〜3 人", hint: "小規模チームでの同時編集", recommended: true },
          { id: "b", label: "1 人(基本ひとり)", hint: "組み合わせ制御はほぼ不要" },
          { id: "c", label: "4 人以上", hint: "本格的な同時間編集、複合解決が変わる" },
        ],
      });
      seedQuestion(ports, "q-3", "run-1", "cycle-1", {
        kind: "question",
        prompt: "権限管理は必要ですか？(編集 / 閲覧の区別)",
        options: [
          { id: "a", label: "編集 / 閲覧を分ける", hint: "ロールを 2 つ以下にやや", recommended: true },
          { id: "b", label: "不要(全員フル権限)", hint: "自分たちでの作り直しの場合は作り直し" },
        ],
      });
    },
    capture: async (page, base) => {
      const errors: string[] = [];
      const listener = (m: { type(): string; text(): string }) => {
        if (m.type() === "error") errors.push(m.text());
      };
      page.on("console", listener);

      // Navigate to the thread page
      await page.goto(`${base}/cycles/cycle-1/thread`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);

      // Fill and submit all 3 questions
      await fillAndSubmitThread(page);

      // At this point React history has the human bubble + run is still "running"
      // (scripted orchestrator's resume emitted ResultEmitted raising a visual_review,
      //  but the cycle's run.state in DB stays "running" until finalize).
      // The thread shows: human bubble + "N件の回答を受け取りました。AI が続きを考えています..."
      // Scroll to top to show the full thread including the AI batch header.
      await page.evaluate(() => {
        const container = document.querySelector(".thread-container");
        if (container) (container as HTMLElement).scrollTop = 0;
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(300);

      await page.screenshot({ path: join(OUT_DIR, "scr-02-conversation-thread.running.real.png"), fullPage: true });
      console.log("  ✓ scr-02-conversation-thread.running.real.png");
      page.off("console", listener);
      return errors;
    },
  },

  {
    name: "scr-02-conversation-thread.appended",
    seedNote: "[B] 2 fresh open questions (second turn batch) — scroll to TOP so batch header visible",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
      // Seed as if this is the second batch (client history is not API-seeded)
      seedQuestion(ports, "q-3", "run-1", "cycle-1", {
        kind: "question",
        prompt: "テスト戦略を教えてください。",
        options: [
          { id: "a", label: "ユニットテスト中心", recommended: true },
          { id: "b", label: "E2E テスト中心" },
        ],
      });
      seedQuestion(ports, "q-4", "run-1", "cycle-1", {
        kind: "question",
        prompt: "CI/CD パイプラインは必要ですか？",
        options: [
          { id: "a", label: "はい(GitHub Actions)", recommended: true },
          { id: "b", label: "いいえ" },
        ],
      });
    },
    // [B] scroll to top so the batch header is visible
    capture: (page, base) =>
      shotScrollTop(page, `${base}/cycles/cycle-1/thread`, "scr-02-conversation-thread.appended"),
  },

  {
    name: "scr-02-conversation-thread.completed",
    seedNote: "[A] Drive in-session: answer 3 questions (creates human bubble with labels), then /api/test/complete-cycle to set cycle.state=done, wait for poll to show completion banner above the persisted human bubble",
    seed(ports) {
      // Seed a single-step pipeline so completeCycle succeeds (all phases done).
      // S1 is the only phase; run-1 will be started then completed via the browser
      // flow + test endpoint.
      const project = seedProject(ports, { pipelineStepIds: ["S1"] });
      seedCycle(ports, project, { pipelineStepIds: ["S1"] });
      startFirstPhase(ports, "cycle-1", "run-1");
      // Seed 3 open questions with label text the evaluator can verify
      seedQuestion(ports, "q-1", "run-1", "cycle-1", {
        kind: "question",
        prompt: "このシステムの主な利用者は誰ですか？",
        options: [
          { id: "a", label: "社内のエンジニアのみ", hint: "まずは社内で小さく試す", recommended: true },
          { id: "b", label: "社内外の利用者も含む", hint: "公開範囲が広がる" },
        ],
      });
      seedQuestion(ports, "q-2", "run-1", "cycle-1", {
        kind: "question",
        prompt: "同時編集の想定人数は？",
        options: [
          { id: "a", label: "2〜3 人", hint: "小規模チームでの同時編集", recommended: true },
          { id: "b", label: "1 人(基本ひとり)", hint: "組み合わせ制御はほぼ不要" },
        ],
      });
      seedQuestion(ports, "q-3", "run-1", "cycle-1", {
        kind: "question",
        prompt: "権限管理は必要ですか？(編集 / 閲覧の区別)",
        options: [
          { id: "a", label: "編集 / 閲覧を分ける", hint: "ロールを 2 つに", recommended: true },
          { id: "b", label: "不要(全員フル権限)", hint: "シンプルに" },
        ],
      });
    },
    capture: async (page, base) => {
      const errors: string[] = [];
      const listener = (m: { type(): string; text(): string }) => {
        if (m.type() === "error") errors.push(m.text());
      };
      page.on("console", listener);

      // Navigate to thread
      await page.goto(`${base}/cycles/cycle-1/thread`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);

      // Fill and submit all 3 questions — creates the human bubble in React state
      await fillAndSubmitThread(page);

      // After submit, the scripted orchestrator answered the questions and the
      // questions are now "answered" (no open siblings). Call the test endpoint
      // to advance run→done, approve the phase review→done, and complete the
      // cycle (cycle.state = "done"). The React polling will then see isDone=true.
      await page.evaluate(async (baseUrl) => {
        await fetch(`${baseUrl}/api/test/complete-cycle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cycleId: "cycle-1", runId: "run-1" }),
        });
      }, base);

      // Wait for the cycle poll (POLL_MS = 3000ms) to pick up the done state
      // and the completion banner to render. Allow up to 8s.
      await page.waitForSelector(".thread-done", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);

      // Scroll to top so both the human bubble and the completion banner are visible
      await page.evaluate(() => {
        const container = document.querySelector(".thread-container");
        if (container) (container as HTMLElement).scrollTop = 0;
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(300);

      await page.screenshot({ path: join(OUT_DIR, "scr-02-conversation-thread.completed.real.png"), fullPage: true });
      console.log("  ✓ scr-02-conversation-thread.completed.real.png");
      page.off("console", listener);
      return errors;
    },
  },

  {
    name: "scr-02-conversation-thread.stall",
    seedNote: "[A] Drive in-session flow: answer questions (create history), then force-stall the run via test endpoint",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
      // Seed 3 open questions to answer in-browser
      seedQuestion(ports, "q-1", "run-1", "cycle-1", {
        kind: "question",
        prompt: "このシステムの主な利用者は誰ですか？",
        options: [
          { id: "a", label: "社内のエンジニアのみ", recommended: true },
          { id: "b", label: "社内外の利用者も含む" },
        ],
      });
      seedQuestion(ports, "q-2", "run-1", "cycle-1", {
        kind: "question",
        prompt: "同時編集の想定人数は？",
        options: [
          { id: "a", label: "2〜3 人", recommended: true },
          { id: "b", label: "1 人(基本ひとり)" },
          { id: "c", label: "4 人以上" },
        ],
      });
      seedQuestion(ports, "q-3", "run-1", "cycle-1", {
        kind: "question",
        prompt: "権限管理は必要ですか？",
        options: [
          { id: "a", label: "編集 / 閲覧を分ける", recommended: true },
          { id: "b", label: "不要(全員フル権限)" },
        ],
      });
    },
    capture: async (page, base) => {
      const errors: string[] = [];
      const listener = (m: { type(): string; text(): string }) => {
        if (m.type() === "error") errors.push(m.text());
      };
      page.on("console", listener);

      // Navigate to thread
      await page.goto(`${base}/cycles/cycle-1/thread`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);

      // Fill and submit all 3 questions — creates history bubble in React state
      await fillAndSubmitThread(page);

      // After submit, scripted orchestrator raised a visual_review question.
      // Force-stall the run via the test-only endpoint so the stall banner appears.
      // The React history bubble (human answers) is already in state from submitBatch.
      await page.evaluate(async (baseUrl) => {
        await fetch(`${baseUrl}/api/test/advance-run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cycleId: "cycle-1", runId: "run-1", to: "stalled" }),
        });
      }, base);

      // Wait for the cycle poll to pick up the stalled state
      await page.waitForTimeout(3500);
      // Scroll to show human bubble + stall banner
      await page.evaluate(() => {
        const container = document.querySelector(".thread-container");
        if (container) (container as HTMLElement).scrollTop = 0;
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(300);

      await page.screenshot({ path: join(OUT_DIR, "scr-02-conversation-thread.stall.real.png"), fullPage: true });
      console.log("  ✓ scr-02-conversation-thread.stall.real.png");
      page.off("console", listener);
      return errors;
    },
  },

  // ══ SCR-03 Review Detail ══════════════════════════════════════

  {
    name: "scr-03-review-detail.default",
    seedNote: "visual_review with summary(md body) + ac-map(受け入れ条件 ✓ list) + 2 screenshot grid + risk",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
      const img = resolveScreenshotSrc("smoke.png");
      const img2 = resolveScreenshotSrc("gate.png");
      seedReviewQuestion(ports, "q-review-1", "run-1", "cycle-1", "S1", [
        {
          type: "summary",
          title: "要件ヒアリング — 成果物レビュー",
          body: "## ヒアリング結果サマリー\n\n全ユーザーストーリーの確定が完了しました。\n\n### 確定した US\n- **US-01** 認証・ログイン(セキュリティ優先)\n- **US-02** 受信箱 Inbox 表示\n- **US-03** 質問への回答フロー\n\n### リスク評価\n外部 OAuth 連携は次サイクルに持ち越し。本サイクルは内部認証のみ。\n\n> コードを読まずに、このページで確認できます。",
        },
        {
          type: "ac-map",
          items: [
            { ac: "条件1", status: "✓ 受信箱 Inbox が表示される" },
            { ac: "条件2", status: "✓ 質問カードをクリックで回答画面へ遷移" },
            { ac: "条件3", status: "✓ 承認後にボードへ戻る" },
          ],
        },
        { type: "screenshot", src: img, caption: "会話スレッド / 既定" },
        { type: "screenshot", src: img2, caption: "レビュー詳細 / 既定" },
        { type: "risk", level: "med", note: "ポーリング間隔が長いと体感が鈍る" },
      ]);
    },
    capture: (page, base) =>
      shot(page, `${base}/cycles/cycle-1/q/q-review-1`, "scr-03-review-detail.default"),
  },

  {
    name: "scr-03-review-detail.enlarged",
    seedNote: "[C] 8 screenshot gallery using gate.png, click third thumbnail (index 2) to open lightbox at 3/8 — wait for lightbox img load, screenshot viewport only (fixed overlay)",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
      // Use gate.png — shows the cycle-list screen (real app content, no onboarding).
      // smoke.png shows the "リポジトリ設定" onboarding form which confuses evaluators
      // who see it as an overlay "dialog" rather than the lightbox screenshot content.
      const img = resolveScreenshotSrc("gate.png");
      const captions = [
        "Inbox 一覧 / 既定",
        "会話スレッド / 既定",
        "会話スレッド / 行き詰まり",
        "レビュー / 既定",
        "設定確認 / 既定",
        "進捗 / 既定",
        "進捗 / ステップ可変",
        "進捗 / 手戻り",
      ];
      seedReviewQuestion(ports, "q-review-1", "run-1", "cycle-1", "S3", [
        {
          type: "summary",
          title: "実機に統合 — 動いた画面の証拠",
          body: "5 画面 × 状態の実際に動いた画面のスクリーンショットを証拠として添付。各サムネイルをクリックで拡大できます。",
        },
        ...captions.map((caption) => ({
          type: "screenshot" as const,
          src: img,
          caption,
        })),
      ]);
    },
    capture: async (page, base) => {
      const errors: string[] = [];
      const listener = (m: { type(): string; text(): string }) => {
        if (m.type() === "error") errors.push(m.text());
      };
      page.on("console", listener);

      // Navigate to review detail page and wait fully
      await page.goto(`${base}/cycles/cycle-1/q/q-review-1`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);

      // Wait for the gallery thumbs to be present
      await page.waitForSelector("figure.gallery-thumb", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);

      // Click the third gallery thumbnail (index 2) to open lightbox at 3/8.
      const thumbs = page.locator("figure.gallery-thumb");
      const count = await thumbs.count();
      console.log(`    gallery-thumb count: ${count}`);

      if (count >= 3) {
        await thumbs.nth(2).click({ force: true });
        // Wait for the lightbox dialog element
        await page.waitForSelector('[role="dialog"].lightbox', { timeout: 4000 }).catch(() => {});
        // Wait for the lightbox image to have a resolved src (not still loading)
        await page.waitForSelector('.lightbox__img[src]', { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(600);

        // Verify the lightbox is open
        const isLightbox = await page.$('[role="dialog"].lightbox');
        console.log(`    lightbox present: ${isLightbox !== null}`);

        // Verify lightbox img src is not empty
        const lightboxImgSrc = await page.$eval(
          '.lightbox__img',
          (el) => (el as HTMLImageElement).src,
        ).catch(() => "");
        console.log(`    lightbox img src: ${lightboxImgSrc.substring(0, 60)}`);
      } else {
        console.warn(`    WARNING: only ${count} gallery thumbs found (expected 8)`);
        const fallback = await page.$("figure[role='button']");
        if (fallback) {
          await fallback.click({ force: true });
          await page.waitForTimeout(800);
        }
      }

      // Screenshot viewport only — the lightbox is position:fixed so fullPage
      // would extend beyond the viewport and the fixed overlay wouldn't cover
      // the extra area, leaking the underlying page content below.
      await page.screenshot({ path: join(OUT_DIR, "scr-03-review-detail.enlarged.real.png"), fullPage: false });
      console.log("  ✓ scr-03-review-detail.enlarged.real.png");
      page.off("console", listener);
      return errors;
    },
  },

  {
    name: "scr-03-review-detail.gallery",
    seedNote: "8 screenshot blocks in one review (gallery 4×2 grid) + ac-map(受け入れ条件 ✓)",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
      const img = resolveScreenshotSrc("smoke.png");
      const captions = [
        "Inbox 一覧 / 既定",
        "会話スレッド / 既定",
        "会話スレッド / 行き詰まり",
        "レビュー / 既定",
        "設定確認 / 既定",
        "進捗 / 既定",
        "進捗 / ステップ可変",
        "進捗 / 手戻り",
      ];
      const screens = captions.map((caption) => ({
        type: "screenshot" as const,
        src: img,
        caption,
      }));
      seedReviewQuestion(ports, "q-review-1", "run-1", "cycle-1", "S3", [
        {
          type: "summary",
          title: "実機に統合 — 動いた画面の証拠",
          body: "5 画面 × 状態の実際に動いた画面のスクリーンショットを証拠として添付。各サムネイルをクリックで拡大できます。",
        },
        ...screens,
        {
          type: "ac-map",
          items: [
            { ac: "条件1", status: "✓ 全画面で Inbox が表示される" },
            { ac: "条件2", status: "✓ 会話スレッドで質問カードが表示" },
            { ac: "条件3", status: "✓ 進捗画面でステップ状態が可視化" },
          ],
        },
      ]);
    },
    capture: (page, base) =>
      shot(page, `${base}/cycles/cycle-1/q/q-review-1`, "scr-03-review-detail.gallery"),
  },

  {
    name: "scr-03-review-detail.loading",
    seedNote: "[D] route-delay /api/questions/ so loading skeleton renders",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
      const img = resolveScreenshotSrc("smoke.png");
      seedReviewQuestion(ports, "q-review-1", "run-1", "cycle-1", "S1", [
        { type: "summary", title: "テスト", body: "loading" },
        { type: "screenshot", src: img, caption: "受信箱" },
      ]);
    },
    // [D] The review detail page fetches via /api/questions/:id — delay that pattern.
    // Also delay /api/cycles/ to keep cycle loading (the page uses both).
    capture: async (page, base) => {
      const errors: string[] = [];
      const listener = (m: { type(): string; text(): string }) => {
        if (m.type() === "error") errors.push(m.text());
      };
      page.on("console", listener);
      // Delay question fetch so skeleton renders
      const delayMs = 5000;
      await page.route("**/api/questions/**", async (route) => {
        await new Promise((r) => setTimeout(r, delayMs));
        await route.continue();
      });
      void page.goto(`${base}/cycles/cycle-1/q/q-review-1`, { waitUntil: "commit" });
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(OUT_DIR, "scr-03-review-detail.loading.real.png"), fullPage: true });
      console.log("  ✓ scr-03-review-detail.loading.real.png (delayed)");
      await page.unrouteAll();
      page.off("console", listener);
      return errors;
    },
  },

  {
    name: "scr-03-review-detail.missing-context",
    seedNote: "review whose summary/body prepend ⚠ missing-context marker",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
      const img = resolveScreenshotSrc("smoke.png");
      seedReviewQuestion(
        ports,
        "q-review-1",
        "run-1",
        "cycle-1",
        "S1",
        [
          {
            type: "summary",
            title: "要件ヒアリング完了",
            body: "前サイクルの US 一覧を参照して実行されました。",
          },
          { type: "screenshot", src: img, caption: "受信箱" },
        ],
        "task-1",
        { prependMissingContext: true },
      );
    },
    capture: (page, base) =>
      shot(page, `${base}/cycles/cycle-1/q/q-review-1`, "scr-03-review-detail.missing-context"),
  },

  // ══ SCR-04 Step Config Readback ═══════════════════════════════

  {
    name: "scr-04-step-config-readback.default",
    seedNote: "[E] /cycles/:id/settings — MIXED badges: some steps have contracts (このサイクルで調整), some inherit (既定)",
    seed(ports) {
      // Seed only SOME steps with contracts → mixed badge display matching the mock
      // (not all rows the same badge).
      const project = seedProject(ports, {
        stepContracts: {
          S1: { output: { profileKind: "要件一覧" }, humanGate: { mode: "visual_review" }, escalation: { onStall: "retry", maxRetry: 3 } },
          S2: { output: { profileKind: "画面モック" }, humanGate: { mode: "visual_review" }, escalation: { onStall: "retry", maxRetry: 3 } },
          S3: { output: { profileKind: "UI 設計" }, humanGate: { mode: "visual_review" }, escalation: { onStall: "retry", maxRetry: 2 } },
          // S4 intentionally omitted → "既定" badge
          S5: { output: { profileKind: "作業単位" }, humanGate: { mode: "visual_review" }, escalation: { onStall: "retry", maxRetry: 3 } },
          S6: { output: { profileKind: "モデル図" }, humanGate: { mode: "visual_review" } },
          S7: { output: { profileKind: "コード" }, humanGate: { mode: "device_check" } },
          S8: { output: { profileKind: "動いた画面の証拠" }, humanGate: { mode: "device_check" } },
          // S9 intentionally omitted → "既定" badge
          S10: { output: { profileKind: "受け入れ記録" }, humanGate: { mode: "device_check" } },
          S11: { output: { profileKind: "振り返り" }, humanGate: { mode: "visual_review" }, escalation: { onStall: "retry", maxRetry: 3 } },
          // S12 intentionally omitted → "既定" badge
        },
      });
      seedCycle(ports, project);
    },
    capture: (page, base) =>
      shot(page, `${base}/cycles/cycle-1/settings`, "scr-04-step-config-readback.default"),
  },

  {
    name: "scr-04-step-config-readback.global",
    seedNote: "[F] /settings/steps — global defaults view with CONCRETE contract values on ALL steps",
    seed(ports) {
      // [F] Seed the active project (first project) with concrete contracts so
      // the global view shows real setting summaries instead of "(グローバル既定を継承)".
      // GlobalStepConfigPage reads from useProjectContext → first project in list.
      seedProject(ports, {
        stepContracts: {
          S1: { output: { profileKind: "要件一覧" }, humanGate: { mode: "visual_review" }, escalation: { onStall: "retry", maxRetry: 3 } },
          S2: { output: { profileKind: "画面モック" }, humanGate: { mode: "visual_review" }, escalation: { onStall: "retry", maxRetry: 3 } },
          S3: { output: { profileKind: "UI 設計" }, humanGate: { mode: "visual_review" }, escalation: { onStall: "retry", maxRetry: 2 } },
          S4: { output: { profileKind: "技術メモ" }, humanGate: { mode: "visual_review" }, escalation: { onStall: "retry", maxRetry: 3 } },
          S5: { output: { profileKind: "作業単位" }, humanGate: { mode: "visual_review" }, escalation: { onStall: "retry", maxRetry: 3 } },
          S6: { output: { profileKind: "モデル図" }, humanGate: { mode: "visual_review" } },
          S7: { output: { profileKind: "コード" }, humanGate: { mode: "device_check" } },
          S8: { output: { profileKind: "動いた画面の証拠" }, humanGate: { mode: "device_check" } },
          S9: { output: { profileKind: "検証結果・証跡" }, humanGate: { mode: "device_check" }, escalation: { onStall: "retry", maxRetry: 3 } },
          S10: { output: { profileKind: "受け入れ記録" }, humanGate: { mode: "device_check" } },
          S11: { output: { profileKind: "振り返り" }, humanGate: { mode: "visual_review" }, escalation: { onStall: "retry", maxRetry: 3 } },
          S12: { output: { profileKind: "改善提案" }, humanGate: { mode: "visual_review" }, escalation: { onStall: "retry", maxRetry: 3 } },
        },
      });
    },
    capture: (page, base) =>
      shot(page, `${base}/settings/steps`, "scr-04-step-config-readback.global"),
  },

  {
    name: "scr-04-step-config-readback.loading",
    seedNote: "route-delay /api/projects/* so skeleton renders",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
    },
    capture: (page, base) =>
      shotWithDelay(
        page,
        `${base}/cycles/cycle-1/settings`,
        "scr-04-step-config-readback.loading",
        "/api/projects/",
      ),
  },

  {
    name: "scr-04-step-config-readback.pre-us",
    seedNote: "/cycles/:id/settings?usDecided=false — pre-US lock state (CycleStepConfigPage reads ?usDecided=false query param)",
    seed(ports) {
      // 最初の 3 ステップには継承契約値をシードして pre-us mock と合わせる。
      const project = seedProject(ports, {
        stepContracts: {
          S1: { output: { profileKind: "要件一覧" }, humanGate: { mode: "visual_review" } },
          S2: { output: { profileKind: "画面モック" }, humanGate: { mode: "visual_review" } },
          S3: { output: { profileKind: "UI 設計" }, humanGate: { mode: "visual_review" } },
        },
      });
      seedCycle(ports, project);
    },
    capture: (page, base) =>
      shot(page, `${base}/cycles/cycle-1/settings?usDecided=false`, "scr-04-step-config-readback.pre-us"),
  },

  // ══ SCR-05 Cycle Progress ═════════════════════════════════════

  {
    name: "scr-05-cycle-progress.default",
    seedNote: "S1 done, S2 running (Discovery完了 / Design進行中)",
    seed(ports) {
      const project = seedProject(ports);
      const cycle = seedCycle(ports, project);
      // Start S1
      const s1 = unwrap(
        domainStartPhase(cycle, { step: Step("S1"), runId: RunId("run-1"), startedAt: T0 }),
      );
      // Advance S1 run to done → phase review
      const s1adv = unwrap(advanceRun(s1, { runId: RunId("run-1"), to: "done", at: T1 }));
      // Mark S1 phase done
      const s1ph = s1adv.phases.find((p) => (p.step as string) === "S1")!;
      const s1done = {
        ...s1adv,
        phases: s1adv.phases.map((p) =>
          p.id === s1ph.id ? { ...p, state: "done" as const } : p,
        ),
      };
      // Start S2
      const s2 = unwrap(
        domainStartPhase(s1done, { step: Step("S2"), runId: RunId("run-2"), startedAt: T1 }),
      );
      ports.repos.cycles.save(s2);
    },
    capture: (page, base) =>
      shot(page, `${base}/cycles/cycle-1`, "scr-05-cycle-progress.default"),
  },

  {
    name: "scr-05-cycle-progress.variable",
    seedNote: "pipeline omitting S4(技術仕様) and S9(検証) — variable step count",
    seed(ports) {
      const reducedSteps = CANONICAL_STEPS
        .filter((c) => !["S4", "S9"].includes(c.id as string))
        .map((c) => c.id as string);
      const project = seedProject(ports, { pipelineStepIds: reducedSteps });
      const cycle = seedCycle(ports, project, { pipelineStepIds: reducedSteps });
      const s1 = unwrap(
        domainStartPhase(cycle, { step: Step("S1"), runId: RunId("run-1"), startedAt: T0 }),
      );
      ports.repos.cycles.save(s1);
    },
    capture: (page, base) =>
      shot(page, `${base}/cycles/cycle-1`, "scr-05-cycle-progress.variable"),
  },

  {
    name: "scr-05-cycle-progress.stall",
    seedNote: "S1 run advanced to stalled",
    seed(ports) {
      const project = seedProject(ports);
      seedCycle(ports, project);
      startFirstPhase(ports, "cycle-1", "run-1");
      advanceCycleRun(ports, "cycle-1", "run-1", "stalled", "2 分以上応答なし");
    },
    capture: (page, base) =>
      shot(page, `${base}/cycles/cycle-1`, "scr-05-cycle-progress.stall"),
  },

  {
    name: "scr-05-cycle-progress.backtrack",
    seedNote: "[G-seed] S2 done with backtrack history (runs.length > 1 && phase.state=done) + S3 currently running — ↩ glyph on S2 in Discovery band",
    seed(ports) {
      const project = seedProject(ports);
      const cycle = seedCycle(ports, project);

      const T2 = unwrap(instant("2026-01-01T00:02:00.000Z"));

      // Start + finish S1 (clean, no backtrack)
      const s1 = unwrap(
        domainStartPhase(cycle, { step: Step("S1"), runId: RunId("run-1"), startedAt: T0 }),
      );
      const s1adv = unwrap(advanceRun(s1, { runId: RunId("run-1"), to: "done", at: T1 }));
      // advanceRun with "done" moves phase to "review"; manually mark it "done"
      const s1ph = s1adv.phases.find((p) => (p.step as string) === "S1")!;
      const s1done = {
        ...s1adv,
        phases: s1adv.phases.map((p) =>
          p.id === s1ph.id ? { ...p, state: "done" as const } : p,
        ),
      };

      // Start S2 (run-2)
      const s2start = unwrap(
        domainStartPhase(s1done, { step: Step("S2"), runId: RunId("run-2"), startedAt: T1 }),
      );
      // Advance run-2 to done (S2 phase → "review")
      const s2adv = unwrap(advanceRun(s2start, { runId: RunId("run-2"), to: "done", at: T1 }));
      // Mark S2 phase done
      const s2ph = s2adv.phases.find((p) => (p.step as string) === "S2")!;
      const s2done = {
        ...s2adv,
        phases: s2adv.phases.map((p) =>
          p.id === s2ph.id ? { ...p, state: "done" as const } : p,
        ),
      };

      // Start S3 (run-3)
      const s3start = unwrap(
        domainStartPhase(s2done, { step: Step("S3"), runId: RunId("run-3"), startedAt: T1 }),
      );

      // Advance run-3 to done so we can backtrack properly
      // (backtrackTo advances a "running" run to done before rewinding)
      const s3adv = unwrap(advanceRun(s3start, { runId: RunId("run-3"), to: "done", at: T1 }));

      // Backtrack from S3 → S2: S2 state → "running", S3 → "pending".
      // S2 now has 1 run (run-2, done). S3 now has 1 run (run-3, done → pending phase).
      const backedToS2 = unwrap(
        backtrackTo(s3adv, { step: Step("S2"), reason: "画面要素の見直しが必要です" }),
      );

      // S2 is now "running" with run-2 (done) as only run — no live run.
      // Use relaunchPhase (the correct API for rewound phases) to add run-4.
      const s2rerun = unwrap(
        relaunchPhase(backedToS2, { step: Step("S2"), runId: RunId("run-4"), startedAt: T2 }),
      );
      // S2 now has 2 runs: run-2 (done) + run-4 (running).

      // Advance run-4 to done (S2 phase → "review" again)
      const s2rerunAdv = unwrap(advanceRun(s2rerun, { runId: RunId("run-4"), to: "done", at: T2 }));
      // Mark S2 phase done again
      const s2ph2 = s2rerunAdv.phases.find((p) => (p.step as string) === "S2")!;
      const s2rerunDone = {
        ...s2rerunAdv,
        phases: s2rerunAdv.phases.map((p) =>
          p.id === s2ph2.id ? { ...p, state: "done" as const } : p,
        ),
      };

      // Start S3 again (run-5) — S3 is now the CURRENT running phase.
      // S3.state was set to "pending" by backtrackTo, so startPhase can begin it.
      // Also S2 is now "done" (prev phase requirement satisfied).
      const s3restart = unwrap(
        domainStartPhase(s2rerunDone, { step: Step("S3"), runId: RunId("run-5"), startedAt: T2 }),
      );

      // Final state:
      //   S1: done, runs=[run-1 done]   → no backtrack (runs.length=1)
      //   S2: done, runs=[run-2 done, run-4 done]  → hasBacktrack=true → ↩ glyph
      //   S3: running, runs=[run-3 done, run-5 running]  → current phase (進行中)
      // Pipeline bands:
      //   "要件" band: S1 done + S2 done (↩) → band status "done ↩"
      //   "設計" band: S3 running + S4 pending → band status "current" / 進行中
      // This matches the S3 mock: 要件 band "完了 ↩" / 設計 band "進行中" / S2 pill shows ↩
      ports.repos.cycles.save(s3restart);
    },
    capture: (page, base) =>
      shot(page, `${base}/cycles/cycle-1`, "scr-05-cycle-progress.backtrack"),
  },

  // ══ SCR-06 Step Spec ══════════════════════════════════════════

  {
    name: "scr-06-step-spec.default",
    seedNote: "/settings/steps/S1 — S1 with contracts + skill ref aidlc-s1-requirements",
    seed(ports) {
      // mock の「設定の全項目」4 項目(検証の観点/成果物/確認/行き詰まり)を再現するため S1 に契約値をシード。
      seedProject(ports, {
        stepContracts: {
          S1: {
            verification: {
              observations: [
                "対象ユーザーがプロダクト概要と一致しているか",
                "要件が独立してテスト可能な単位になっているか",
              ],
            },
            output: { profileKind: "要件一覧" },
            humanGate: { mode: "visual_review" },
            escalation: { onStall: "human", maxRetry: 3 },
          },
        },
      });
    },
    capture: (page, base) =>
      shot(page, `${base}/settings/steps/S1`, "scr-06-step-spec.default"),
  },

  {
    name: "scr-06-step-spec.loading",
    seedNote: "[D] route-delay /api/projects/* so loading skeleton renders — header must show",
    seed(ports) {
      seedProject(ports);
    },
    // [D] Delay both the projects list AND individual project fetch
    capture: async (page, base) => {
      const errors: string[] = [];
      const listener = (m: { type(): string; text(): string }) => {
        if (m.type() === "error") errors.push(m.text());
      };
      page.on("console", listener);
      const delayMs = 5000;
      await page.route("**/api/projects**", async (route) => {
        await new Promise((r) => setTimeout(r, delayMs));
        await route.continue();
      });
      void page.goto(`${base}/settings/steps/S1`, { waitUntil: "commit" });
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(OUT_DIR, "scr-06-step-spec.loading.real.png"), fullPage: true });
      console.log("  ✓ scr-06-step-spec.loading.real.png (delayed)");
      await page.unrouteAll();
      page.off("console", listener);
      return errors;
    },
  },

  {
    name: "scr-06-step-spec.no-instruction",
    seedNote: "[H] Use S13(追加検証) — a non-canonical step id that matches STEP_RE but has no kit/skills/aidlc-s13-* dir, so skill content is empty → no-instruction state renders",
    seed(ports) {
      // [H] S4 has a real SKILL.md file, so it cannot show the no-instruction state.
      // S13 matches the STEP_RE (/^S\d+(?:\.\d+)?$/) used by readStepSkill, so
      // the route validates the id but finds no aidlc-s13-* directory → returns
      // {skill: null, content: ""}. StepSpecPage then renders the empty-state paragraph.
      // The step label comes from defLabel ("追加検証") via resolveStepName because
      // stepLabel("S13") falls back to "S13" (unknown) and defLabel is set.
      seedProject(ports, {
        pipelineStepIds: [...CANONICAL_STEPS.map((s) => s.id as string), "S13"],
        stepLabels: { S13: "追加検証" },
        stepContracts: {
          S13: {
            output: { profileKind: "追加検証レポート" },
            humanGate: { mode: "visual_review" },
          },
        },
      });
    },
    capture: (page, base) =>
      shot(page, `${base}/settings/steps/S13`, "scr-06-step-spec.no-instruction"),
  },
];

// ── メインループ ───────────────────────────────────────────────

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const preinstalled = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser: Browser = await chromium.launch(
    existsSync(preinstalled) ? { executablePath: preinstalled } : {},
  );

  let captured = 0;
  let skipped = 0;
  const unreachableList: { name: string; reason: string }[] = [];
  const renderIssues: { name: string; issue: string }[] = [];
  const allErrors: { state: string; errors: string[] }[] = [];

  for (const state of STATES) {
    if (state.unreachable) {
      console.log(`\n  UNREACHABLE: ${state.name}`);
      unreachableList.push({ name: state.name, reason: state.unreachable });
      skipped++;
      continue;
    }

    console.log(`\n[${state.name}]`);

    // Fresh in-memory server per state (domain reconcile runs on boot but
    // won't affect freshly seeded data since no runs are "running" at startup
    // unless explicitly seeded as such).
    const { app: _app, db, ports } = buildServer({
      orchestrator: "scripted",
      dbPath: ":memory:",
    });

    try {
      state.seed(ports);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ERROR seeding: ${msg}`);
      renderIssues.push({ name: state.name, issue: `seed failed: ${msg}` });
      db.close();
      continue;
    }

    // Start server with seeded ports
    const { url, server } = await startServerWithPorts(ports);

    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();

    let errors: string[] = [];
    try {
      errors = await state.capture(page, url);
      captured++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ERROR capturing: ${msg}`);
      renderIssues.push({ name: state.name, issue: `capture failed: ${msg}` });
    }

    if (errors.length > 0) {
      allErrors.push({ state: state.name, errors: [...new Set(errors)] });
    }

    await ctx.close();
    await server.stop();
    db.close();
  }

  await browser.close();

  // ── サマリー ────────────────────────────────────────────────
  const total = STATES.length;
  const reachable = total - skipped;
  console.log("\n══════════════════════════════════════════");
  console.log(`S8 mock capture 完了`);
  console.log(`  撮影: ${captured} / ${reachable} (reachable)  UNREACHABLE: ${skipped}  合計: ${total}`);
  if (renderIssues.length > 0) {
    console.log(`  エラー: ${renderIssues.length}`);
    for (const r of renderIssues) console.log(`    • ${r.name}: ${r.issue}`);
  }
  if (unreachableList.length > 0) {
    console.log("\nUNREACHABLE:");
    for (const u of unreachableList) console.log(`  • ${u.name}`);
  }
  if (allErrors.length > 0) {
    console.log("\nConsole エラー:");
    for (const { state, errors } of allErrors) {
      console.log(`  [${state}]`);
      for (const e of errors) console.log(`    • ${e}`);
    }
  } else {
    console.log("  console errors: なし");
  }
  console.log(`\n出力先: ${OUT_DIR}`);

  await writeCaptureNotes(unreachableList, renderIssues, allErrors, captured, skipped);
}

async function writeCaptureNotes(
  unreachable: { name: string; reason: string }[],
  renderIssues: { name: string; issue: string }[],
  consoleErrors: { state: string; errors: string[] }[],
  captured: number,
  skipped: number,
): Promise<void> {
  const notesPath = resolve(import.meta.dir, "../aidlc-docs/v0.0.4/s8/capture-notes.md");

  const unreachableSet = new Set(unreachable.map((u) => u.name));
  const renderIssueMap = new Map(renderIssues.map((r) => [r.name, r.issue]));
  const consoleErrorMap = new Map(consoleErrors.map((c) => [c.state, c.errors]));

  const rows = STATES.map((s) => {
    let reach: string;
    if (unreachableSet.has(s.name)) {
      reach = `UNREACHABLE`;
    } else if (renderIssueMap.has(s.name)) {
      reach = `CAPTURE ERROR`;
    } else {
      reach = "yes";
    }
    const errs = consoleErrorMap.get(s.name);
    const renderNote =
      errs && errs.length > 0
        ? `コンソールエラー ${errs.length} 件`
        : reach === "yes"
        ? "正常描画"
        : unreachableSet.has(s.name)
        ? "撮影なし(再現不可)"
        : `エラー: ${renderIssueMap.get(s.name) ?? "?"}`
    return `| ${s.name} | ${s.seedNote} | ${reach} | ${renderNote} |`;
  });

  const unreachableDetail = unreachable.length === 0
    ? "なし"
    : unreachable.map((u) => `### ${u.name}\n${u.reason}`).join("\n\n");

  const consoleErrorDetail = consoleErrors.length === 0
    ? "なし"
    : consoleErrors
        .map(({ state, errors }) => `### ${state}\n${errors.map((e) => `- ${e}`).join("\n")}`)
        .join("\n\n");

  const total = STATES.length;
  const content = `# S8 Capture Notes — v0.0.4 mock 突合

自動生成: \`scripts/s8-mock-capture.ts\`
生成日時: ${new Date().toISOString()}
結果: 撮影 ${captured} / ${total - skipped} (reachable)、UNREACHABLE ${skipped}、合計 ${total} states

## 突合表

| state | シード方法 | 再現可否 | 描画メモ |
|-------|-----------|----------|----------|
${rows.join("\n")}

## UNREACHABLE 詳細

${unreachableDetail}

## Console エラー詳細

${consoleErrorDetail}
`;

  await Bun.write(notesPath, content);
  console.log(`capture-notes.md → ${notesPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

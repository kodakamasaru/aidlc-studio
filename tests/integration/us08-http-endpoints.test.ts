// US-08 HTTP エンドポイント integration テスト:
//   POST /api/cycles/:cycleId/reconstruct  — applyCycleReconstruction HTTP 露出
//   POST /api/projects/:projectId/pipeline — replaceProjectPipeline HTTP 露出
//
// 実 in-memory DB + RecordingOrchestrator で app.request() 駆動。
// ドメイン純粋関数・app 層の詳細は us08-pipeline-reconstruction.test.ts が網羅済み。
// ここは HTTP バリデーション・ルーティング・正常系応答形式のみ検証。
import { describe, test, expect } from "bun:test";
import { buildTestApp, makeRepoDir } from "../support/harness";

// ── request helpers ──────────────────────────────────────────────────────────
async function post(
  app: ReturnType<typeof buildTestApp>["app"],
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => undefined) };
}

async function get(
  app: ReturnType<typeof buildTestApp>["app"],
  path: string,
): Promise<{ status: number; json: any }> {
  const res = await app.request(path);
  return { status: res.status, json: await res.json().catch(() => undefined) };
}

/** プロジェクト作成ヘルパー */
async function createProject(
  h: ReturnType<typeof buildTestApp>,
  repoPath: string = makeRepoDir(),
): Promise<string> {
  const { status, json } = await post(h.app, "/api/projects", { repoPath });
  expect(status).toBe(201);
  return json.data.id as string;
}

/** サイクル作成ヘルパー */
async function createCycle(
  h: ReturnType<typeof buildTestApp>,
  projectId: string,
  version = "v1.0.0",
): Promise<any> {
  const { status, json } = await post(
    h.app,
    `/api/projects/${projectId}/cycles`,
    { title: "test cycle", version },
  );
  expect(status).toBe(201);
  return json.data;
}

// ── POST /api/cycles/:cycleId/reconstruct ───────────────────────────────────

describe("POST /api/cycles/:cycleId/reconstruct", () => {
  test("happy path: 可変工程列(S4省略 + 独自工程追加)で pending を全置換して 200 + Cycle を返す", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId, "v1.0.0");

    // S4 省略 + CUSTOM-QA 追加
    const variableSteps = [
      { id: "S1", label: "要件", order: 0, skillRef: "aidlc-s1-requirements" },
      { id: "S2", label: "画面", order: 1, skillRef: "aidlc-s2-wireframe" },
      { id: "S3", label: "UIデザイン", order: 2, skillRef: "aidlc-s3-ui-design" },
      // S4 省略
      { id: "CUSTOM-QA", label: "独自QA", order: 3, skillRef: "aidlc-s1-requirements" },
      { id: "S5", label: "分割", order: 4, skillRef: "aidlc-s5-work-units" },
    ];
    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/reconstruct`,
      { steps: variableSteps },
    );

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    const result = json.data;
    expect(result.id).toBe(cycle.id);
    expect(result.phases.length).toBe(variableSteps.length);
    expect(result.phases.map((p: any) => p.step)).toEqual(
      variableSteps.map((s) => s.id),
    );
    // 全 phase が pending
    expect(result.phases.every((p: any) => p.state === "pending")).toBe(true);
    // "new-" prefix が残っていない
    expect(result.phases.some((p: any) => (p.id as string).startsWith("new-"))).toBe(false);
  });

  test("instruction 付き StepDef がスナップショットに写される", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId, "v1.0.1");

    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/reconstruct`,
      {
        steps: [
          {
            id: "S1",
            label: "要件",
            order: 0,
            skillRef: "aidlc-s1-requirements",
            instruction: "S1 のカスタムルール",
          },
          { id: "S6", label: "モデル", order: 1, skillRef: "aidlc-s6-domain-model" },
        ],
      },
    );

    expect(status).toBe(200);
    const s1Phase = json.data.phases.find((p: any) => p.step === "S1");
    expect(s1Phase.stepDef.instruction).toBe("S1 のカスタムルール");
    const s6Phase = json.data.phases.find((p: any) => p.step === "S6");
    expect(s6Phase.stepDef.instruction).toBeUndefined();
  });

  test("再構成後 GET /api/cycles/:id で同じ構成が取れる(永続化確認)", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId, "v1.0.2");

    await post(h.app, `/api/cycles/${cycle.id}/reconstruct`, {
      steps: [
        { id: "S1", label: "要件", order: 0, skillRef: "aidlc-s1-requirements" },
        { id: "CUSTOM", label: "独自", order: 1, skillRef: "aidlc-s1-requirements" },
      ],
    });

    const { status, json } = await get(h.app, `/api/cycles/${cycle.id}`);
    expect(status).toBe(200);
    expect(json.data.phases.length).toBe(2);
    expect(json.data.phases.map((p: any) => p.step)).toEqual(["S1", "CUSTOM"]);
  });

  // ── バリデーション ─────────────────────────────────────────────────────────

  test("steps が配列でない → 400 MissingField:steps", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId, "v2.0.0");

    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/reconstruct`,
      { steps: "not-an-array" },
    );
    expect(status).toBe(400);
    expect(json.error).toBe("MissingField:steps");
  });

  test("steps が空配列 → 400 EmptyPipeline", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId, "v2.0.1");

    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/reconstruct`,
      { steps: [] },
    );
    expect(status).toBe(400);
    expect(json.error).toBe("EmptyPipeline");
  });

  test("step に id が欠落 → 400 MissingField:steps[0].id", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId, "v2.0.2");

    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/reconstruct`,
      {
        steps: [
          { label: "要件", order: 0, skillRef: "aidlc-s1-requirements" }, // id 欠落
        ],
      },
    );
    expect(status).toBe(400);
    expect(json.error).toMatch(/MissingField:steps\[0\]\.id/);
  });

  test("step に skillRef が欠落 → 400 MissingField:steps[0].skillRef", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId, "v2.0.3");

    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/reconstruct`,
      {
        steps: [
          { id: "S1", label: "要件", order: 0 }, // skillRef 欠落
        ],
      },
    );
    expect(status).toBe(400);
    expect(json.error).toMatch(/MissingField:steps\[0\]\.skillRef/);
  });

  test("step id が重複 → 409 DuplicateStep", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    const cycle = await createCycle(h, projectId, "v2.0.4");

    const { status, json } = await post(
      h.app,
      `/api/cycles/${cycle.id}/reconstruct`,
      {
        steps: [
          { id: "S1", label: "要件", order: 0, skillRef: "aidlc-s1-requirements" },
          { id: "S1", label: "要件2", order: 1, skillRef: "aidlc-s1-requirements" },
        ],
      },
    );
    expect(status).toBe(409);
    expect(json.error).toBe("DuplicateStep");
  });

  test("存在しない cycleId → 404 CycleNotFound", async () => {
    const h = buildTestApp();
    const { status, json } = await post(
      h.app,
      "/api/cycles/nonexistent/reconstruct",
      {
        steps: [
          { id: "S1", label: "要件", order: 0, skillRef: "aidlc-s1-requirements" },
        ],
      },
    );
    expect(status).toBe(404);
    expect(json.error).toBe("CycleNotFound");
  });
});

// ── POST /api/projects/:projectId/pipeline ───────────────────────────────────

describe("POST /api/projects/:projectId/pipeline", () => {
  test("happy path: 可変工程列で pipelineDef を全置換して 200 + Project を返す", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);

    const newSteps = [
      { id: "S1", label: "要件", order: 0, skillRef: "aidlc-s1-requirements" },
      { id: "S6", label: "モデル", order: 1, skillRef: "aidlc-s6-domain-model" },
      { id: "CUSTOM-STEP", label: "独自工程", order: 2, skillRef: "aidlc-s1-requirements" },
    ];
    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/pipeline`,
      { steps: newSteps },
    );

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    const project = json.data;
    expect(project.id).toBe(projectId);
    expect(project.pipelineDef.length).toBe(3);
    expect(project.pipelineDef.map((s: any) => s.id)).toEqual(["S1", "S6", "CUSTOM-STEP"]);
  });

  test("instruction 付き StepDef が pipelineDef に保存される", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);

    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/pipeline`,
      {
        steps: [
          {
            id: "S1",
            label: "要件",
            order: 0,
            skillRef: "aidlc-s1-requirements",
            instruction: "カスタム指示",
          },
          { id: "S6", label: "モデル", order: 1, skillRef: "aidlc-s6-domain-model" },
        ],
      },
    );

    expect(status).toBe(200);
    const s1 = json.data.pipelineDef.find((s: any) => s.id === "S1");
    expect(s1.instruction).toBe("カスタム指示");
    const s6 = json.data.pipelineDef.find((s: any) => s.id === "S6");
    expect(s6.instruction).toBeUndefined();
  });

  test("GET /api/projects/:id で置換後の pipelineDef が取れる(永続化確認)", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);

    await post(h.app, `/api/projects/${projectId}/pipeline`, {
      steps: [
        { id: "S1", label: "要件", order: 0, skillRef: "aidlc-s1-requirements" },
        { id: "ONLY-STEP", label: "唯一の工程", order: 1, skillRef: "aidlc-s1-requirements" },
      ],
    });

    const { status, json } = await get(h.app, `/api/projects/${projectId}`);
    expect(status).toBe(200);
    expect(json.data.pipelineDef.length).toBe(2);
    expect(json.data.pipelineDef[1].id).toBe("ONLY-STEP");
  });

  // ── バリデーション ─────────────────────────────────────────────────────────

  test("steps が配列でない → 400 MissingField:steps", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);

    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/pipeline`,
      { steps: null },
    );
    expect(status).toBe(400);
    expect(json.error).toBe("MissingField:steps");
  });

  test("steps が空配列 → 400 EmptyPipeline", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);

    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/pipeline`,
      { steps: [] },
    );
    expect(status).toBe(400);
    expect(json.error).toBe("EmptyPipeline");
  });

  test("step に label が欠落 → 400 MissingField:steps[0].label", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);

    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/pipeline`,
      {
        steps: [
          { id: "S1", order: 0, skillRef: "aidlc-s1-requirements" }, // label 欠落
        ],
      },
    );
    expect(status).toBe(400);
    expect(json.error).toMatch(/MissingField:steps\[0\]\.label/);
  });

  test("step の order が整数でない → 400 MissingField:steps[0].order", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);

    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/pipeline`,
      {
        steps: [
          { id: "S1", label: "要件", order: "zero", skillRef: "aidlc-s1-requirements" },
        ],
      },
    );
    expect(status).toBe(400);
    expect(json.error).toMatch(/MissingField:steps\[0\]\.order/);
  });

  test("step id が重複 → 409 DuplicateStep", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);

    const { status, json } = await post(
      h.app,
      `/api/projects/${projectId}/pipeline`,
      {
        steps: [
          { id: "S1", label: "要件", order: 0, skillRef: "aidlc-s1-requirements" },
          { id: "S1", label: "要件2", order: 1, skillRef: "aidlc-s1-requirements" },
        ],
      },
    );
    expect(status).toBe(409);
    expect(json.error).toBe("DuplicateStep");
  });

  test("存在しない projectId → 404 ProjectNotFound", async () => {
    const h = buildTestApp();
    const { status, json } = await post(
      h.app,
      "/api/projects/nonexistent/pipeline",
      {
        steps: [
          { id: "S1", label: "要件", order: 0, skillRef: "aidlc-s1-requirements" },
        ],
      },
    );
    expect(status).toBe(404);
    expect(json.error).toBe("ProjectNotFound");
  });

  test("既存サイクルの phases は pipeline 置換後も変わらない", async () => {
    const h = buildTestApp();
    const projectId = await createProject(h);
    // 作成時は全 12 工程が phases に入る
    const cycle = await createCycle(h, projectId, "v8.0.0");
    const phasesBefore = cycle.phases.map((p: any) => p.step);
    expect(phasesBefore.length).toBe(12);

    // pipelineDef を 2 工程に置換
    await post(h.app, `/api/projects/${projectId}/pipeline`, {
      steps: [
        { id: "S1", label: "要件", order: 0, skillRef: "aidlc-s1-requirements" },
        { id: "S6", label: "モデル", order: 1, skillRef: "aidlc-s6-domain-model" },
      ],
    });

    // 既存サイクルの phases は変わっていない
    const { json } = await get(h.app, `/api/cycles/${cycle.id}`);
    expect(json.data.phases.length).toBe(12);
    expect(json.data.phases.map((p: any) => p.step)).toEqual(phasesBefore);
  });
});

// Cycle routes — list/create under a project, get one, and the two execution
// actions (start a phase, retry a run). The :step segment may be "S2.5", so it
// is URL-decoded before use.
import { Hono } from "hono";
import type { Ports } from "../../../app/ports/composition";
import { CycleService } from "../../../app/services/cycle-service";
import type { CreateCycleInput } from "../../../app/services/cycle-service";
import type { StepDef, SkillRef } from "../../../domain/project/project";
import { Step } from "../../../domain/shared/vocab";
import { fail } from "../../../app/services/errors";
import type { Text } from "../../../domain/shared/primitives";
import {
  ok,
  readJson,
  asString,
  asOptionalString,
  asOptionalStringArray,
} from "../envelope";

// Step id は identifier 安全文字のみ(S1-S12 以外の独自工程 id も受け付けるが
// シェルメタ文字・パス区切り・制御文字は弾く)。
const STEP_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * Validate and parse one element of the `steps` array from an untrusted JSON body.
 * Required: id, label, order (integer ≥ 0), skillRef.
 * Optional: instruction.
 * Unknown fields are dropped.
 */
function parseStepDef(raw: unknown, index: number): StepDef {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw fail(400, `InvalidField:steps[${index}]`);
  }
  const b = raw as Record<string, unknown>;

  const idRaw = b["id"];
  if (typeof idRaw !== "string" || !STEP_ID_RE.test(idRaw.trim())) {
    throw fail(400, `MissingField:steps[${index}].id`);
  }

  const labelRaw = b["label"];
  if (typeof labelRaw !== "string" || labelRaw.trim().length === 0) {
    throw fail(400, `MissingField:steps[${index}].label`);
  }

  const orderRaw = b["order"];
  if (typeof orderRaw !== "number" || !Number.isInteger(orderRaw) || orderRaw < 0) {
    throw fail(400, `MissingField:steps[${index}].order`);
  }

  const skillRefRaw = b["skillRef"];
  if (typeof skillRefRaw !== "string" || skillRefRaw.trim().length === 0) {
    throw fail(400, `MissingField:steps[${index}].skillRef`);
  }

  const instructionRaw = b["instruction"];
  const instruction =
    typeof instructionRaw === "string" && instructionRaw.trim().length > 0
      ? (instructionRaw.trim() as Text)
      : undefined;

  return {
    id: Step(idRaw.trim()),
    label: labelRaw.trim() as Text,
    order: orderRaw,
    skillRef: skillRefRaw.trim() as SkillRef,
    ...(instruction !== undefined ? { instruction } : {}),
  };
}

/**
 * Parse the `steps` array from a request body for reconstruct/pipeline endpoints.
 * Must be a non-empty array; each element is validated by parseStepDef.
 * Duplicate step ids at the HTTP boundary → 409 DuplicateStep (detected early).
 */
function parseStepDefs(body: Record<string, unknown>): readonly StepDef[] {
  const raw = body["steps"];
  if (!Array.isArray(raw)) {
    throw fail(400, "MissingField:steps");
  }
  if (raw.length === 0) {
    throw fail(400, "EmptyPipeline");
  }
  const defs = raw.map((item, i) => parseStepDef(item, i));
  // Duplicate id check at the HTTP boundary (service also checks, but surface early).
  const seen = new Set<string>();
  for (const d of defs) {
    const key = d.id as string;
    if (seen.has(key)) throw fail(409, "DuplicateStep");
    seen.add(key);
  }
  return defs;
}

export function cycleRoutes(ports: Ports): Hono {
  const app = new Hono();
  const service = new CycleService(ports);

  app.get("/api/projects/:projectId/cycles", (c) =>
    ok(c, service.listCycles(c.req.param("projectId"))),
  );

  app.post("/api/projects/:projectId/cycles", async (c) => {
    const body = await readJson(c);
    const title = asString(body, "title");
    // version is optional: when omitted the service auto-assigns it.
    const version = asOptionalString(body, "version");
    const taskIds = asOptionalStringArray(body, "taskIds");
    const input: CreateCycleInput = {
      title,
      ...(version !== undefined ? { version } : {}),
      ...(taskIds !== undefined ? { taskIds } : {}),
    };
    return ok(c, service.createCycle(c.req.param("projectId"), input), 201);
  });

  app.get("/api/cycles/:cycleId", (c) =>
    ok(c, service.getCycle(c.req.param("cycleId"))),
  );

  app.post("/api/cycles/:cycleId/phases/:step/start", async (c) => {
    const step = decodeURIComponent(c.req.param("step"));
    const cycle = await service.startPhase(c.req.param("cycleId"), step);
    return ok(c, cycle);
  });

  // Re-run a phase a backtrack rewound to "running" (US-13). Separate from
  // /start, which only accepts a PENDING phase.
  app.post("/api/cycles/:cycleId/phases/:step/relaunch", async (c) => {
    const step = decodeURIComponent(c.req.param("step"));
    const cycle = await service.relaunchPhase(c.req.param("cycleId"), step);
    return ok(c, cycle);
  });

  app.post("/api/cycles/:cycleId/runs/:runId/retry", async (c) => {
    const cycle = await service.retryRun(
      c.req.param("cycleId"),
      c.req.param("runId"),
    );
    return ok(c, cycle);
  });

  // US-08 (H): サイクルの pending 工程列を全置換する。
  // body: { steps: StepDef[] } — id/label/order/skillRef required per element.
  // Returns the updated Cycle. Errors: 400 EmptyPipeline / 409 DuplicateStep /
  // 404 CycleNotFound.
  app.post("/api/cycles/:cycleId/reconstruct", async (c) => {
    const body = await readJson(c);
    const steps = parseStepDefs(body);
    const cycle = service.applyCycleReconstruction(c.req.param("cycleId"), steps);
    return ok(c, cycle);
  });

  // US-08 会話で修正: 人間のフィードバックで再構成を再提案させる(再構成 run を再起動)。
  // body: { feedback: string }。空なら 400 EmptyReproposeFeedback。新しい提案は非同期で
  // emit され、web は GET /reconstruction-proposal を polling して差分を検知する。
  app.post("/api/cycles/:cycleId/reconstruct/repropose", async (c) => {
    const body = (await readJson(c)) as { feedback?: unknown };
    const feedback = typeof body?.feedback === "string" ? body.feedback : "";
    await service.reproposeReconstruction(c.req.param("cycleId"), feedback);
    return ok(c, { reproposed: true });
  });

  // US-08: AI が生成したパイプライン再構成提案を取得する。
  // S1 確定後に scripted/live オーケストレータが ReconstructionProposalEmitted を emit し、
  // EventApplier が reconstruction_proposals テーブルに保存したものを返す。
  // 提案がまだ無い場合は 404 ProposalNotFound を返す。
  // Web(U08-5)はこのエンドポイントを叩いてユーザーに提案を表示し、
  // 承認後 POST /api/cycles/:id/reconstruct を呼ぶ。
  app.get("/api/cycles/:cycleId/reconstruction-proposal", (c) => {
    const proposal = service.getReconstructionProposal(c.req.param("cycleId"));
    if (proposal === undefined) throw fail(404, "ProposalNotFound");
    return ok(c, proposal);
  });

  return app;
}

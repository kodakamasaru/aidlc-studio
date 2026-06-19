// Project routes — bootstrap (POST) + list (GET). Bodies are validated for
// required fields here before the service runs.
import { Hono } from "hono";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Ports } from "../../../app/ports/composition";
import { ProjectService } from "../../../app/services/project-service";
import type { CreateProjectInput } from "../../../app/services/project-service";
import type { StepContracts } from "../../../domain/project/step-contracts";
import type { StepDef, SkillRef } from "../../../domain/project/project";
import type { Text } from "../../../domain/shared/primitives";
import { Step } from "../../../domain/shared/vocab";
import { fail } from "../../../app/services/errors";
import { ok, readJson, asString, asOptionalString } from "../envelope";

// Boundary validation: build a StepContracts from untrusted JSON. Every sub-
// contract is optional and unknown fields are dropped. Enum fields (humanGate.mode,
// escalation.onStall) are checked against a fixed set; the FREE-string fields
// (profileKind / artifactGlob / backtrackTo) reach the persisted pipelineDef and
// may later feed the live-CLI spawn, so they are constrained to an injection-safe
// shape here (fail-fast 400 on violation) rather than trusted verbatim.
const HUMAN_GATE_MODES = new Set(["visual_review", "device_check", "none"]);
const ESCALATION_KINDS = new Set(["retry", "backtrack", "human"]);
// profileKind = a TaskKind registry key; backtrackTo = a Step id. Both are
// identifier-shaped — no shell metacharacters, path separators, or whitespace.
const SAFE_IDENT_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_GLOB_LEN = 256;

/** True if the string contains an ASCII control char (< 0x20) — never valid in a path/glob. */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

function parseOutput(b: Record<string, unknown>): StepContracts["output"] | undefined {
  const output = b["output"] as Record<string, unknown> | undefined;
  if (!output || typeof output !== "object") return undefined;
  const profileKind = typeof output["profileKind"] === "string" ? output["profileKind"] : undefined;
  if (profileKind !== undefined && profileKind.length > 0 && !SAFE_IDENT_RE.test(profileKind)) {
    throw fail(400, "InvalidProfileKind");
  }
  const artifactGlob = typeof output["artifactGlob"] === "string" ? output["artifactGlob"] : undefined;
  // Glob may contain * ? [ ] but never a path-traversal ".." nor control chars —
  // it can later be evaluated against the project repo by the live FS adapter.
  if (
    artifactGlob !== undefined &&
    (artifactGlob.includes("..") ||
      artifactGlob.length > MAX_GLOB_LEN ||
      hasControlChar(artifactGlob))
  ) {
    throw fail(400, "InvalidArtifactGlob");
  }
  return {
    ...(profileKind !== undefined && profileKind.length > 0 ? { profileKind } : {}),
    ...(artifactGlob !== undefined ? { artifactGlob: artifactGlob as Text } : {}),
  };
}

function parseHumanGate(b: Record<string, unknown>): StepContracts["humanGate"] | undefined {
  const hg = b["humanGate"] as Record<string, unknown> | undefined;
  if (!hg || typeof hg["mode"] !== "string" || !HUMAN_GATE_MODES.has(hg["mode"])) return undefined;
  const note = typeof hg["note"] === "string" ? (hg["note"] as Text) : undefined;
  return {
    mode: hg["mode"] as "visual_review" | "device_check" | "none",
    ...(note !== undefined ? { note } : {}),
  };
}

function parseEscalation(b: Record<string, unknown>): StepContracts["escalation"] | undefined {
  const es = b["escalation"] as Record<string, unknown> | undefined;
  if (!es || typeof es["onStall"] !== "string" || !ESCALATION_KINDS.has(es["onStall"])) return undefined;
  const backtrackRaw = typeof es["backtrackTo"] === "string" ? es["backtrackTo"] : undefined;
  if (backtrackRaw !== undefined && !SAFE_IDENT_RE.test(backtrackRaw)) {
    throw fail(400, "InvalidBacktrackTo");
  }
  const backtrackTo = backtrackRaw !== undefined ? Step(backtrackRaw) : undefined;
  const maxRetry = typeof es["maxRetry"] === "number" && Number.isInteger(es["maxRetry"]) ? es["maxRetry"] : undefined;
  return {
    onStall: es["onStall"] as "retry" | "backtrack" | "human",
    ...(backtrackTo !== undefined ? { backtrackTo } : {}),
    ...(maxRetry !== undefined ? { maxRetry } : {}),
  };
}

function parseStepContracts(body: unknown): StepContracts {
  const b = (body ?? {}) as Record<string, unknown>;
  const output = parseOutput(b);
  const verificationArr = (b["verification"] as Record<string, unknown> | undefined)?.["observations"];
  const verification = Array.isArray(verificationArr)
    ? {
        observations: verificationArr.filter(
          (o): o is Text => typeof o === "string" && o.trim().length > 0,
        ),
      }
    : undefined;
  const humanGate = parseHumanGate(b);
  const escalation = parseEscalation(b);
  return {
    ...(output !== undefined ? { output } : {}),
    ...(verification !== undefined ? { verification } : {}),
    ...(humanGate !== undefined ? { humanGate } : {}),
    ...(escalation !== undefined ? { escalation } : {}),
  };
}

// ── US-08: StepDef パーサー(pipeline エンドポイント用) ─────────────────────────────────

// Step id は identifier 安全文字のみ(S1-S12 以外の独自工程 id も受け付けるが
// シェルメタ文字・パス区切り・制御文字は弾く)。
const STEP_DEF_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

/** Validate and parse one element of the `steps` array from an untrusted JSON body. */
function parsePipelineStepDef(raw: unknown, index: number): StepDef {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw fail(400, `InvalidField:steps[${index}]`);
  }
  const b = raw as Record<string, unknown>;

  const idRaw = b["id"];
  if (typeof idRaw !== "string" || !STEP_DEF_ID_RE.test(idRaw.trim())) {
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

/** Parse and validate the `steps` array for the pipeline replacement endpoint. */
function parsePipelineStepDefs(body: Record<string, unknown>): readonly StepDef[] {
  const raw = body["steps"];
  if (!Array.isArray(raw)) throw fail(400, "MissingField:steps");
  if (raw.length === 0) throw fail(400, "EmptyPipeline");
  const defs = raw.map((item, i) => parsePipelineStepDef(item, i));
  const seen = new Set<string>();
  for (const d of defs) {
    const key = d.id as string;
    if (seen.has(key)) throw fail(409, "DuplicateStep");
    seen.add(key);
  }
  return defs;
}

// ─────────────────────────────────────────────────────────────────────────────

const SKILLS_DIR = "kit/skills";
const STEP_RE = /^S\d+(?:\.\d+)?$/;

/**
 * step("S1") → `kit/skills/aidlc-s1-*​/SKILL.md` の本文(YAML frontmatter 除去)。
 * step は `^S\d+(\.\d+)?$` に厳格一致させ、パストラバーサルを排除した上で prefix 照合する。
 * 対応スキルが無ければ null(S2.5 等、dir が無い step を含む)。
 */
function readStepSkill(step: string): { readonly skill: string; readonly content: string } | null {
  if (!STEP_RE.test(step)) return null;
  const prefix = `aidlc-${step.toLowerCase()}-`;
  let entries: string[];
  try {
    entries = readdirSync(SKILLS_DIR);
  } catch {
    return null;
  }
  const dir = entries.find((d) => d.startsWith(prefix));
  if (!dir) return null;
  let md: string;
  try {
    md = readFileSync(join(SKILLS_DIR, dir, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
  const content = md.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
  return { skill: dir, content };
}

export function projectRoutes(ports: Ports): Hono {
  const app = new Hono();
  const service = new ProjectService(ports);

  app.post("/api/projects", async (c) => {
    const body = await readJson(c);
    const repoPath = asString(body, "repoPath");
    const name = asOptionalString(body, "name");
    const modelName = asOptionalString(body, "modelName");
    const input: CreateProjectInput = {
      repoPath,
      ...(name !== undefined ? { name } : {}),
      ...(modelName !== undefined ? { modelName } : {}),
    };
    return ok(c, service.createProject(input), 201);
  });

  app.get("/api/projects", (c) => ok(c, service.listProjects()));

  app.get("/api/projects/:projectId", (c) =>
    ok(c, service.getProject(c.req.param("projectId"))),
  );

  // US-06 (scope I): edit a step's contracts from the UI.
  app.patch("/api/projects/:projectId/steps/:stepId/contracts", async (c) => {
    const body = await readJson(c);
    const contracts = parseStepContracts(body);
    return ok(
      c,
      service.updateStepContracts(
        c.req.param("projectId"),
        c.req.param("stepId"),
        contracts,
      ),
    );
  });

  // US-06 対話式編集: 要望から契約の「提案」を作る(決定的・永続化しない)。要望の各行を
  // 検証観点として現契約にマージした proposed を返す。承認すると上の PATCH で適用される。
  // 提案ロジックは決定的 rule-based。live AI 提案は加算層([real-ai-tests-additive])。
  app.post("/api/projects/:projectId/steps/:stepId/propose", async (c) => {
    const body = await readJson(c);
    const requestText = asString(body, "request");
    const project = service.getProject(c.req.param("projectId"));
    const stepId = c.req.param("stepId");
    const step = project.pipelineDef.find((s) => s.id === stepId);
    const current: StepContracts = step?.contracts ?? {};
    const existing = current.verification?.observations ?? [];
    const existingSet = new Set(existing.map((o) => o as string));
    const additions = requestText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !existingSet.has(l))
      .map((l) => l as Text);
    const proposed: StepContracts =
      additions.length > 0
        ? { ...current, verification: { observations: [...existing, ...additions] } }
        : current;
    return ok(c, { current, proposed });
  });

  // full-spec: ステップの指示・全文(スキル本文)。step は厳格検証済み(パストラバーサル不可)。
  app.get("/api/steps/:step/skill", (c) => {
    const result = readStepSkill(c.req.param("step"));
    return ok(c, result ?? { skill: null, content: "" });
  });

  // US-08 (AC-7): グローバル既定パイプラインを任意の StepDef 列で全置換する。
  // body: { steps: StepDef[] } — id/label/order/skillRef required per element.
  // Returns the updated Project. Errors: 400 EmptyPipeline / 409 DuplicateStep /
  // 404 ProjectNotFound.
  app.post("/api/projects/:projectId/pipeline", async (c) => {
    const body = await readJson(c);
    const steps = parsePipelineStepDefs(body);
    const project = service.replaceProjectPipeline(
      c.req.param("projectId"),
      steps,
    );
    return ok(c, project);
  });

  return app;
}

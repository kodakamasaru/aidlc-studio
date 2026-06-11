// Project routes — bootstrap (POST) + list (GET). Bodies are validated for
// required fields here before the service runs.
import { Hono } from "hono";
import type { Ports } from "../../../app/ports/composition";
import { ProjectService } from "../../../app/services/project-service";
import type { CreateProjectInput } from "../../../app/services/project-service";
import type { StepContracts } from "../../../domain/project/step-contracts";
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

  return app;
}

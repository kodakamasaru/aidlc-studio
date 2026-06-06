// Cycle routes — list/create under a project, get one, and the two execution
// actions (start a phase, retry a run). The :step segment may be "S2.5", so it
// is URL-decoded before use.
import { Hono } from "hono";
import type { Ports } from "../../../app/ports/composition";
import { CycleService } from "../../../app/services/cycle-service";
import type { CreateCycleInput } from "../../../app/services/cycle-service";
import { ok, readJson, asString, asOptionalStringArray } from "../envelope";

export function cycleRoutes(ports: Ports): Hono {
  const app = new Hono();
  const service = new CycleService(ports);

  app.get("/api/projects/:projectId/cycles", (c) =>
    ok(c, service.listCycles(c.req.param("projectId"))),
  );

  app.post("/api/projects/:projectId/cycles", async (c) => {
    const body = await readJson(c);
    const title = asString(body, "title");
    const version = asString(body, "version");
    const taskIds = asOptionalStringArray(body, "taskIds");
    const input: CreateCycleInput = {
      title,
      version,
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

  app.post("/api/cycles/:cycleId/runs/:runId/retry", async (c) => {
    const cycle = await service.retryRun(
      c.req.param("cycleId"),
      c.req.param("runId"),
    );
    return ok(c, cycle);
  });

  return app;
}

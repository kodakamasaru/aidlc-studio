// Hearing routes — BU-3 config-hearing launch endpoint.
// POST /api/hearing/launch : launch a config-hearing run for a cycle or global.
//
// Scope values:
//   "cycle:{cycleId}" → finds the first pending phase of the cycle and starts
//                       it under the config-hearing scenario. Returns
//                       {scope, cycleId, runId, step} so the web can navigate to
//                       /cycles/:cycleId/thread?hearing=1.
//   "global"          → ensures the hidden system cycle, starts its hearing
//                       phase with hearingScope="global" (answers write to
//                       project.pipelineDef). Returns {scope:"global", cycleId,
//                       runId, step} so the web can open the thread by system
//                       cycle id. Requires projectId in the body.
import { Hono } from "hono";
import type { Ports } from "../../../app/ports/composition";
import { CycleService } from "../../../app/services/cycle-service";
import { parseScope } from "../../../app/services/hearing-service";
import { fail } from "../../../app/services/errors";
import { ok, readJson, asString, asOptionalString } from "../envelope";

export function hearingRoutes(ports: Ports): Hono {
  const app = new Hono();
  const service = new CycleService(ports);

  /**
   * POST /api/hearing/launch
   * Body: { scope: "global" | "cycle:{cycleId}", projectId?: string }
   *
   * cycle-scope: starts the first pending phase → returns {scope, cycleId, runId, step}.
   * global-scope: ensures system cycle, starts global hearing → returns
   *   {scope:"global", cycleId:"__global_settings__", runId, step}. Requires
   *   projectId when scope=global (used to scope the system cycle + project.pipelineDef
   *   writes). If omitted, falls back to the first project in the store.
   */
  app.post("/api/hearing/launch", async (c) => {
    const body = await readJson(c);
    const scopeRaw = asString(body, "scope");
    const scope = parseScope(scopeRaw);

    if (scope.kind === "global") {
      // Resolve projectId: caller may pass it explicitly (recommended); if absent,
      // use the first project in the store (single-project v0 assumption).
      const projectIdRaw = asOptionalString(body, "projectId");
      const resolvedProjectId = projectIdRaw
        ? projectIdRaw
        : (() => {
            const projects = ports.repos.projects.list();
            if (projects.length === 0) throw fail(404, "ProjectNotFound");
            return projects[0]!.id as string;
          })();

      const result = await service.launchGlobalConfigHearing(resolvedProjectId);
      return ok(c, { scope: "global" as const, ...result });
    }

    // cycle-scope: launch config-hearing on the first pending phase.
    const result = await service.launchConfigHearing(scope.cycleId);
    return ok(c, { scope: scopeRaw, ...result });
  });

  return app;
}

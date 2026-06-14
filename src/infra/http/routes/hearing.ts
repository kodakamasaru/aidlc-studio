// Hearing routes — BU-3 config-hearing launch endpoint.
// POST /api/hearing/launch : launch a config-hearing run for a cycle.
//
// Scope values:
//   "cycle:{cycleId}" → finds the first pending phase of the cycle and starts
//                       it under the config-hearing scenario. Returns
//                       {cycleId, runId, step} so the web can navigate to
//                       /cycles/:cycleId/thread?hearing=1.
//   "global"          → global config-hearing is not tied to a cycle; the
//                       endpoint returns {scope:"global"} and the web renders
//                       the dedicated /settings/hearing landing page. A full
//                       cycle-less hearing run requires a future extension
//                       (see HearingNoCycleNotSupported).
import { Hono } from "hono";
import type { Ports } from "../../../app/ports/composition";
import { CycleService } from "../../../app/services/cycle-service";
import { parseScope } from "../../../app/services/hearing-service";
import { ok, readJson, asString } from "../envelope";

export function hearingRoutes(ports: Ports): Hono {
  const app = new Hono();
  const service = new CycleService(ports);

  /**
   * POST /api/hearing/launch
   * Body: { scope: "global" | "cycle:{cycleId}" }
   *
   * cycle-scope: starts the first pending phase → returns {cycleId, runId, step}.
   * global-scope: no cycle available → returns {scope:"global"} (partial; the web
   *               shows the /settings/hearing placeholder page).
   */
  app.post("/api/hearing/launch", async (c) => {
    const body = await readJson(c);
    const scopeRaw = asString(body, "scope");
    const scope = parseScope(scopeRaw);

    if (scope.kind === "global") {
      // Global hearing is not yet tied to a run (cycle-less run model gap).
      // Return the scope so the web can render the /settings/hearing placeholder.
      return ok(c, { scope: "global" as const });
    }

    // cycle-scope: launch config-hearing on the first pending phase.
    const result = await service.launchConfigHearing(scope.cycleId);
    return ok(c, { scope: scopeRaw, ...result });
  });

  return app;
}

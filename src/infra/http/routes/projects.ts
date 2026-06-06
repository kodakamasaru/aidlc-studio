// Project routes — bootstrap (POST) + list (GET). Bodies are validated for
// required fields here before the service runs.
import { Hono } from "hono";
import type { Ports } from "../../../app/ports/composition";
import { ProjectService } from "../../../app/services/project-service";
import type { CreateProjectInput } from "../../../app/services/project-service";
import { ok, readJson, asString, asOptionalString } from "../envelope";

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

  return app;
}

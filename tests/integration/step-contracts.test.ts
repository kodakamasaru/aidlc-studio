// S8 #I (US-06) — editing a step's contracts persists and takes effect on the
// NEXT launch: a step given a verification contract runs as a gen→gate→eval
// generator (orchestrator.launch carries role="generator"). Unknown step → 404.
import { describe, test, expect } from "bun:test";
import { buildTestApp } from "../support/harness";
import { buildProject } from "./builders";
import { ProjectService } from "../../src/app/services/project-service";
import { CycleService } from "../../src/app/services/cycle-service";
import { ProjectId } from "../../src/domain/shared/ids";
import { isServiceError } from "../../src/app/services/errors";

const PID = "proj-sc";

describe("updateStepContracts (US-06 step-edit)", () => {
  test("persists the step's contracts on the project pipeline", () => {
    const { ports } = buildTestApp();
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new ProjectService(ports);

    const updated = svc.updateStepContracts(PID, "S1", {
      verification: { observations: ["一覧が表示される"] },
      humanGate: { mode: "visual_review" },
    });

    const s1 = updated.pipelineDef.find((sd) => (sd.id as string) === "S1")!;
    expect(s1.contracts?.verification?.observations).toEqual(["一覧が表示される"]);
    expect(s1.contracts?.humanGate?.mode).toBe("visual_review");
    // persisted (re-read from repo)
    const reread = ports.repos.projects.findById(ProjectId(PID))!;
    const s1r = reread.pipelineDef.find((sd) => (sd.id as string) === "S1")!;
    expect(s1r.contracts?.verification?.observations).toEqual(["一覧が表示される"]);
  });

  test("the edited contract takes effect on the NEXT launch (role=generator)", async () => {
    const { ports, orchestrator } = buildTestApp();
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    new ProjectService(ports).updateStepContracts(PID, "S1", {
      verification: { observations: ["一覧が表示される"] },
    });

    const cycles = new CycleService(ports);
    const cycle = cycles.createCycle(PID, { title: "c", version: "v0.0.2" });
    await cycles.startPhase(cycle.id, "S1");

    const launches = orchestrator.ofMethod("launch");
    expect(launches.length).toBe(1);
    expect(launches[0]!.args.role).toBe("generator");
  });

  test("a step with NO verification contract still launches role-less (legacy)", async () => {
    const { ports, orchestrator } = buildTestApp();
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const cycles = new CycleService(ports);
    const cycle = cycles.createCycle(PID, { title: "c", version: "v0.0.2" });
    await cycles.startPhase(cycle.id, "S1");
    expect(orchestrator.ofMethod("launch")[0]!.args.role).toBeUndefined();
  });

  // ── boundary validation (HTTP) — untrusted JSON must not reach pipelineDef ──
  async function patchContracts(
    app: ReturnType<typeof buildTestApp>["app"],
    stepId: string,
    body: unknown,
  ): Promise<number> {
    const res = await app.request(
      `/api/projects/${PID}/steps/${stepId}/contracts`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return res.status;
  }

  test("rejects injection-shaped profileKind / artifactGlob / backtrackTo with 400", async () => {
    const { app, ports } = buildTestApp();
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));

    expect(await patchContracts(app, "S1", { output: { profileKind: "; rm -rf /" } })).toBe(400);
    expect(await patchContracts(app, "S1", { output: { artifactGlob: "../../etc/passwd" } })).toBe(400);
    expect(await patchContracts(app, "S1", { escalation: { onStall: "backtrack", backtrackTo: "$(id)" } })).toBe(400);
    // a clean payload still succeeds (and did not get persisted by the rejects above)
    expect(await patchContracts(app, "S1", { output: { profileKind: "bugfix" }, humanGate: { mode: "none" } })).toBe(200);
    const s1 = ports.repos.projects.findById(ProjectId(PID))!.pipelineDef.find((sd) => (sd.id as string) === "S1")!;
    expect(s1.contracts?.output?.profileKind).toBe("bugfix");
  });

  test("unknown step id → 404 StepNotInPipeline", () => {
    const { ports } = buildTestApp();
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new ProjectService(ports);
    try {
      svc.updateStepContracts(PID, "S99", { humanGate: { mode: "none" } });
      throw new Error("expected throw");
    } catch (err) {
      expect(isServiceError(err)).toBe(true);
      if (isServiceError(err)) expect(err.httpStatus).toBe(404);
    }
  });
});

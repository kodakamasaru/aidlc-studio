// US-08 適用層テスト: applyCycleReconstruction (cycle-service) + replaceProjectPipeline (project-service)
// TDD — app 層の適用ロジックを integration ハーネス(in-memory DB / SeqIdGen)で検証。
// ドメイン純粋関数 reconstructPipeline / customizePipeline の詳細テストは domain 側に既存。
import { describe, test, expect } from "bun:test";
import { buildTestApp } from "../support/harness";
import { buildProject } from "./builders";
import { CycleService } from "../../src/app/services/cycle-service";
import { ProjectService } from "../../src/app/services/project-service";
import { isServiceError } from "../../src/app/services/errors";
import { ProjectId, CycleId, PhaseId, RunId } from "../../src/domain/shared/ids";
import { Step } from "../../src/domain/shared/vocab";
import { unwrap } from "../../src/domain/shared/result";
import { instant } from "../../src/domain/shared/primitives";
import {
  createCycle as domainCreateCycle,
  startPhase as domainStartPhase,
  advanceRun,
  version,
} from "../../src/domain/cycle/cycle";
import type { StepDef, SkillRef } from "../../src/domain/project/project";
import type { Text } from "../../src/domain/shared/primitives";

// ── テスト用スタブ ────────────────────────────────────────────────────

const skill = (s: string): SkillRef => s as SkillRef;
const label = (s: string): Text => s as Text;

const stepDef = (id: string, order: number, instruction?: string): StepDef => ({
  id: Step(id),
  label: label(`step ${id}`),
  order,
  skillRef: skill(`kit/skills/aidlc-${id.toLowerCase()}`),
  ...(instruction !== undefined ? { instruction: label(instruction) } : {}),
});

// ── 1. CycleService.applyCycleReconstruction ──────────────────────────

describe("CycleService.applyCycleReconstruction (US-08)", () => {
  /**
   * 基本ハッピーパス: 全 pending の Cycle で newPendingSteps を渡すと
   * 同じ step 列が実 PhaseId(SeqIdGen 形式)で保存される。
   */
  test("replaces pending phases with new steps and assigns real PhaseIds", () => {
    const { ports } = buildTestApp();
    const PID = "proj-r01";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));

    const svc = new CycleService(ports);
    // buildProject は S1/S6 パイプライン → createCycle でその 2 工程が pending
    const cycle = svc.createCycle(PID, { title: "recon cycle", version: "v1.0.0" });

    const newSteps: readonly StepDef[] = [
      stepDef("S1", 0),
      stepDef("S6", 1),
      stepDef("S7", 2),
    ];
    const result = svc.applyCycleReconstruction(cycle.id, newSteps);

    // phase 数 = 新ステップ数(全 pending 置換)
    expect(result.phases.length).toBe(3);
    // 全 phase が pending
    expect(result.phases.every((p) => p.state === "pending")).toBe(true);
    // 仮 "new-" id が残っていないこと(全て実 id に採番済み)
    expect(result.phases.some((p) => (p.id as string).startsWith("new-"))).toBe(false);
    // step id が期待通り
    expect(result.phases.map((p) => p.step as string)).toEqual(["S1", "S6", "S7"]);
    // order が連番(全 pending → 0 始まり)
    expect(result.phases.map((p) => p.order)).toEqual([0, 1, 2]);
  });

  /**
   * 着手済み phase は凍結されていること:
   * S1 を running にした後、pending の S6 を差し替えても S1 は変わらない。
   */
  test("preserves started (running) phase, replaces only pending", async () => {
    const { ports } = buildTestApp();
    const PID = "proj-r02";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new CycleService(ports);
    const cycle = svc.createCycle(PID, { title: "started cycle", version: "v1.0.1" });

    // S1 を running に(RecordingOrchestrator なので副作用なし)
    const afterStart = await svc.startPhase(cycle.id, "S1");
    const s1Before = afterStart.phases.find((p) => (p.step as string) === "S1")!;
    expect(s1Before.state).toBe("running");

    // pending の S6 を S6/S7 に差し替え
    const newSteps: readonly StepDef[] = [
      stepDef("S6", 1),
      stepDef("S7", 2),
    ];
    const result = svc.applyCycleReconstruction(afterStart.id, newSteps);

    // S1(running)は変わっていない
    const s1After = result.phases.find((p) => (p.step as string) === "S1")!;
    expect(s1After.id).toBe(s1Before.id);                              // 同一 id
    expect(s1After.state).toBe("running");                             // 状態保持
    expect(s1After.runs.length).toBe(s1Before.runs.length);           // 実行履歴保持

    // 新 pending が S6/S7
    const pending = result.phases.filter((p) => p.state === "pending");
    expect(pending.length).toBe(2);
    expect(pending.map((p) => p.step as string)).toEqual(["S6", "S7"]);
    // "new-" prefix が残っていない
    expect(pending.some((p) => (p.id as string).startsWith("new-"))).toBe(false);
  });

  /**
   * review 状態の phase(advanceRun done 後)も凍結対象:
   * pending 以外(running/review/done)は全て保持される。
   * ドメイン直接操作でサイクルを inject し、app サービスで再構成。
   */
  test("preserves review-state phase (frozen, not reset to pending)", () => {
    const { ports } = buildTestApp();
    const PID = "proj-r03";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));

    // ── S1=review, S6=pending なサイクルをリポに直接 inject ──
    const T0 = unwrap(instant("2026-01-01T00:00:00.000Z"));
    const T1 = unwrap(instant("2026-01-02T00:00:00.000Z"));
    const CID = CycleId("cyc-r03");
    const domainCycle = unwrap(domainCreateCycle({
      id: CID,
      projectId: ProjectId(PID),
      version: unwrap(version("v1.0.2")),
      title: "done cycle",
      taskIds: [],
      createdAt: T0,
      pipeline: [
        { phaseId: PhaseId("ph-s1-r03"), step: Step("S1") },
        { phaseId: PhaseId("ph-s6-r03"), step: Step("S6") },
      ],
    }));
    const started = unwrap(domainStartPhase(domainCycle, {
      step: Step("S1"),
      runId: RunId("run-r03-1"),
      startedAt: T0,
    }));
    // advanceRun to "done" → phase becomes "review"
    const withReview = unwrap(advanceRun(started, {
      runId: RunId("run-r03-1"),
      to: "done",
      at: T1,
    }));
    ports.uow.run(() => ports.repos.cycles.save(withReview));

    const svc = new CycleService(ports);
    // S6(pending)を S6/S7 に差し替え
    const result = svc.applyCycleReconstruction(CID as string, [
      stepDef("S6", 1),
      stepDef("S7", 2),
    ]);

    const s1After = result.phases.find((p) => (p.step as string) === "S1")!;
    // review は pending でないので凍結対象(review 維持)
    expect(s1After.state).toBe("review");

    const pendingPhases = result.phases.filter((p) => p.state === "pending");
    expect(pendingPhases.map((p) => p.step as string)).toEqual(["S6", "S7"]);
    // "new-" prefix が残っていない
    expect(pendingPhases.some((p) => (p.id as string).startsWith("new-"))).toBe(false);
  });

  /**
   * 2 サイクルを再構成したとき PhaseId が衝突しないこと(採番が毎回 fresh)。
   */
  test("assigns distinct PhaseIds across two separate reconstruction calls", () => {
    const { ports } = buildTestApp();
    const PID = "proj-r04";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new CycleService(ports);

    const c1 = svc.createCycle(PID, { title: "c1", version: "v2.0.0" });
    const c2 = svc.createCycle(PID, { title: "c2", version: "v2.0.1" });

    const res1 = svc.applyCycleReconstruction(c1.id, [stepDef("S1", 0)]);
    const res2 = svc.applyCycleReconstruction(c2.id, [stepDef("S1", 0)]);

    const ids1 = res1.phases.map((p) => p.id as string);
    const ids2 = res2.phases.map((p) => p.id as string);
    // 異なるサイクルの新 pending は異なる id
    expect(new Set([...ids1, ...ids2]).size).toBe(ids1.length + ids2.length);
    // "new-" prefix が残っていない
    expect([...ids1, ...ids2].every((id) => !id.startsWith("new-"))).toBe(true);
  });

  /**
   * instruction 付き StepDef が stepDef snapshot に正しく写されること。
   */
  test("snapshots instruction onto new pending phase stepDef", () => {
    const { ports } = buildTestApp();
    const PID = "proj-r05";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new CycleService(ports);
    const cycle = svc.createCycle(PID, { title: "instr cycle", version: "v3.0.0" });

    const result = svc.applyCycleReconstruction(cycle.id, [
      stepDef("S1", 0, "S1 のルール本文"),
      stepDef("S6", 1),
    ]);

    const s1Phase = result.phases.find((p) => (p.step as string) === "S1")!;
    expect(s1Phase.stepDef?.instruction).toBe("S1 のルール本文");
    const s6Phase = result.phases.find((p) => (p.step as string) === "S6")!;
    expect(s6Phase.stepDef?.instruction).toBeUndefined();
  });

  /**
   * 再構成後の Cycle が repo に永続化されていること(再読み込みで一致)。
   */
  test("persists reconstructed cycle to repo (reload match)", () => {
    const { ports } = buildTestApp();
    const PID = "proj-r06";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new CycleService(ports);
    const cycle = svc.createCycle(PID, { title: "persist cycle", version: "v4.0.0" });

    svc.applyCycleReconstruction(cycle.id, [
      stepDef("S1", 0),
      stepDef("S6", 1),
      stepDef("S7", 2),
    ]);

    const reloaded = ports.repos.cycles.findById(CycleId(cycle.id))!;
    expect(reloaded.phases.length).toBe(3);
    expect(reloaded.phases.every((p) => !((p.id as string).startsWith("new-")))).toBe(true);
    expect(reloaded.phases.map((p) => p.step as string)).toEqual(["S1", "S6", "S7"]);
  });

  /**
   * エラー: newPendingSteps が空 → 400 EmptyPipeline。
   */
  test("throws 400 EmptyPipeline when newPendingSteps is empty", () => {
    const { ports } = buildTestApp();
    const PID = "proj-r07";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new CycleService(ports);
    const cycle = svc.createCycle(PID, { title: "empty cycle", version: "v5.0.0" });

    try {
      svc.applyCycleReconstruction(cycle.id, []);
      throw new Error("expected throw");
    } catch (err) {
      expect(isServiceError(err)).toBe(true);
      if (isServiceError(err)) {
        expect(err.httpStatus).toBe(400);
        expect(err.code).toBe("EmptyPipeline");
      }
    }
  });

  /**
   * エラー: 着手済み phase の step id と重複 → 400 DuplicateStep。
   * S1 が running のとき、newPendingSteps に S1 を含めると DuplicateStep になる。
   */
  test("throws 400 DuplicateStep when new step id collides with a started phase", async () => {
    const { ports } = buildTestApp();
    const PID = "proj-r08";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new CycleService(ports);
    const cycle = svc.createCycle(PID, { title: "dup cycle", version: "v6.0.0" });

    // S1 を running に
    await svc.startPhase(cycle.id, "S1");

    try {
      // S1(running)と同じ id を newPendingSteps に渡す → DuplicateStep
      svc.applyCycleReconstruction(cycle.id, [stepDef("S1", 0), stepDef("S6", 1)]);
      throw new Error("expected throw");
    } catch (err) {
      expect(isServiceError(err)).toBe(true);
      if (isServiceError(err)) {
        expect(err.httpStatus).toBe(400);
        expect(err.code).toBe("DuplicateStep");
      }
    }
  });

  /**
   * エラー: 存在しない cycleId → 404 CycleNotFound。
   */
  test("throws 404 CycleNotFound for unknown cycleId", () => {
    const { ports } = buildTestApp();
    const svc = new CycleService(ports);

    try {
      svc.applyCycleReconstruction("nonexistent-cycle", [stepDef("S1", 0)]);
      throw new Error("expected throw");
    } catch (err) {
      expect(isServiceError(err)).toBe(true);
      if (isServiceError(err)) expect(err.httpStatus).toBe(404);
    }
  });
});

// ── 2. ProjectService.replaceProjectPipeline ─────────────────────────

describe("ProjectService.replaceProjectPipeline (US-08 AC-7)", () => {
  /**
   * 基本: StepDef 列(追加・削除・並べ替え)を pipelineDef に保存。
   */
  test("saves the full new step list to project pipelineDef", () => {
    const { ports } = buildTestApp();
    const PID = "proj-p01";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new ProjectService(ports);

    const newSteps: readonly StepDef[] = [
      stepDef("S1", 0),
      stepDef("S6", 1),
      stepDef("S7", 2),
      stepDef("S8", 3),
    ];
    const updated = svc.replaceProjectPipeline(PID, newSteps);

    expect(updated.pipelineDef.length).toBe(4);
    expect(updated.pipelineDef.map((s) => s.id as string)).toEqual(["S1", "S6", "S7", "S8"]);
  });

  /**
   * instruction 付き StepDef も保存できること。
   */
  test("persists instruction on StepDef and survives a repo reload", () => {
    const { ports } = buildTestApp();
    const PID = "proj-p02";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new ProjectService(ports);

    const steps: readonly StepDef[] = [
      stepDef("S1", 0, "S1 instruction md"),
      stepDef("S6", 1),
    ];
    const updated = svc.replaceProjectPipeline(PID, steps);

    const s1 = updated.pipelineDef.find((s) => (s.id as string) === "S1")!;
    expect(s1.instruction).toBe("S1 instruction md");
    const s6 = updated.pipelineDef.find((s) => (s.id as string) === "S6")!;
    expect(s6.instruction).toBeUndefined();

    // 再読み込みでも保持(repo round-trip)
    const reread = ports.repos.projects.findById(ProjectId(PID))!;
    const s1r = reread.pipelineDef.find((s) => (s.id as string) === "S1")!;
    expect(s1r.instruction).toBe("S1 instruction md");
  });

  /**
   * 独自工程(CANONICAL_STEPS に無い id)を含む列も保存できること(US-08 D-01)。
   */
  test("accepts custom step ids not in CANONICAL_STEPS", () => {
    const { ports } = buildTestApp();
    const PID = "proj-p03";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new ProjectService(ports);

    const steps: readonly StepDef[] = [
      stepDef("CUSTOM_DESIGN", 0, "独自 UI 設計工程"),
      stepDef("CUSTOM_PROTO", 1),
      stepDef("S6", 2),
    ];
    const updated = svc.replaceProjectPipeline(PID, steps);

    expect(updated.pipelineDef.length).toBe(3);
    expect(updated.pipelineDef[0]!.id as string).toBe("CUSTOM_DESIGN");
    expect(updated.pipelineDef[0]!.instruction).toBe("独自 UI 設計工程");
  });

  /**
   * 並べ替え: 既存工程の順序を変えて保存できる。
   */
  test("accepts reordered steps (S6 before S1)", () => {
    const { ports } = buildTestApp();
    const PID = "proj-p04";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new ProjectService(ports);

    const steps: readonly StepDef[] = [
      stepDef("S6", 0),
      stepDef("S1", 1),
    ];
    const updated = svc.replaceProjectPipeline(PID, steps);
    expect(updated.pipelineDef.map((s) => s.id as string)).toEqual(["S6", "S1"]);
  });

  /**
   * エラー: 空リスト → 400 EmptyPipeline。
   */
  test("throws 400 EmptyPipeline when steps is empty", () => {
    const { ports } = buildTestApp();
    const PID = "proj-p05";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new ProjectService(ports);

    try {
      svc.replaceProjectPipeline(PID, []);
      throw new Error("expected throw");
    } catch (err) {
      expect(isServiceError(err)).toBe(true);
      if (isServiceError(err)) {
        expect(err.httpStatus).toBe(400);
        expect(err.code).toBe("EmptyPipeline");
      }
    }
  });

  /**
   * エラー: 重複 step id → 400 DuplicateStep。
   */
  test("throws 400 DuplicateStep when step ids are not unique", () => {
    const { ports } = buildTestApp();
    const PID = "proj-p06";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const svc = new ProjectService(ports);

    try {
      svc.replaceProjectPipeline(PID, [stepDef("S1", 0), stepDef("S1", 1)]);
      throw new Error("expected throw");
    } catch (err) {
      expect(isServiceError(err)).toBe(true);
      if (isServiceError(err)) {
        expect(err.httpStatus).toBe(400);
        expect(err.code).toBe("DuplicateStep");
      }
    }
  });

  /**
   * エラー: 存在しないプロジェクト → 404。
   */
  test("throws 404 for unknown projectId", () => {
    const { ports } = buildTestApp();
    const svc = new ProjectService(ports);

    try {
      svc.replaceProjectPipeline("nonexistent", [stepDef("S1", 0)]);
      throw new Error("expected throw");
    } catch (err) {
      expect(isServiceError(err)).toBe(true);
      if (isServiceError(err)) expect(err.httpStatus).toBe(404);
    }
  });

  /**
   * 既存サイクルの phases は影響を受けないこと(snapshot 独立 / S6 INV-S2 と同方針)。
   */
  test("existing cycle phases are not affected by pipeline replacement", () => {
    const { ports } = buildTestApp();
    const PID = "proj-p07";
    ports.uow.run(() => ports.repos.projects.save(buildProject(PID)));
    const projSvc = new ProjectService(ports);
    const cycleSvc = new CycleService(ports);

    // サイクルを先に作成(snapshot が S1/S6 で固まる)
    const cycle = cycleSvc.createCycle(PID, { title: "frozen cycle", version: "v7.0.0" });
    const phasesBefore = cycle.phases.map((p) => ({ id: p.id as string, step: p.step as string }));

    // プロジェクトのパイプラインを差し替え(S1/S6/S7 に)
    projSvc.replaceProjectPipeline(PID, [
      stepDef("S1", 0),
      stepDef("S6", 1),
      stepDef("S7", 2),
    ]);

    // 既存サイクルの phases は変わっていない
    const reloaded = ports.repos.cycles.findById(CycleId(cycle.id))!;
    const phasesAfter = reloaded.phases.map((p) => ({
      id: p.id as string,
      step: p.step as string,
    }));
    expect(phasesAfter).toEqual(phasesBefore);
    expect(reloaded.phases.length).toBe(2); // 元の S1/S6 のまま
  });
});

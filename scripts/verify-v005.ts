// v0.0.5 実操作確認 — このサイクルで直した内容を、テストハーネスでなく
// 本番コードパス(buildServer の live 合成 / 実 composer / 実ファイル)を実際に
// 動かして確認する。有料 claude は spawn しない(構築・合成のみ)。
//
// 確認対象:
//   US-01: live 合成で evidence gate が実際に装着される(FsEvidenceGate)/ scripted は非装着(D-04)
//   US-01/04: 実 repo に manifest を書く → 実ゲートが pass / 消すと block
//   US-02: 実 composer の §6 に「ルート台帳 + 現サイクル」両方が本当に載る
//   US-05: 実 repo で binding rule 本文が実プロンプト本文へ到達する
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildServer } from "../src/server";
import { FsEvidenceGate } from "../src/infra/evidence/fs-evidence-gate";
import { writeEvidenceManifest, toUtcInstant } from "../src/infra/evidence/evidence-manifest";
import {
  composeStructuredContext,
  renderStructuredContext,
} from "../src/app/services/context-resolver";
import { probeRuleReach } from "../src/app/services/binding-probe";
import { nodeFs } from "../src/infra/sys/fs";
import { Step } from "../src/domain/shared/vocab";
import type { Cycle, Phase } from "../src/domain/cycle/cycle";
import type { CycleId, PhaseId, ProjectId } from "../src/domain/shared/ids";

const REPO_ROOT = resolve(import.meta.dir, "..");
let failed = false;
const ok = (label: string, cond: boolean, detail = ""): void => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failed = true;
};

console.log("── US-01: live 合成で evidence gate が装着される(本番 buildServer)──");
{
  // 実 composition root を live モードで起こす(claude は run まで spawn されない)。
  const live = buildServer({ orchestrator: "live", dbPath: ":memory:" });
  ok(
    "ports.evidence が live 合成で装着される",
    live.ports.evidence !== undefined,
    live.ports.evidence ? live.ports.evidence.constructor.name : "undefined",
  );
  // 対照: scripted 合成では非装着(決定論ダブルは gate を持たない / D-04)。
  const scripted = buildServer({ orchestrator: "scripted", dbPath: ":memory:" });
  ok("ports.evidence が scripted 合成では非装着(D-04)", scripted.ports.evidence === undefined);
}

console.log("── US-01/04: 実 repo に manifest を書く → 実ゲートが pass / 消すと block ──");
{
  const repo = mkdtempSync(join(tmpdir(), "v005-verify-"));
  try {
    const gate = new FsEvidenceGate(nodeFs);
    const started = toUtcInstant("2026-06-19T00:00:00.000Z");

    const before = gate.check({ repoPath: repo, version: "v0.0.5", step: "S8", runStartedAt: started });
    ok("manifest 不在 → blocked", before.eligibility === "blocked", `missing=${before.missing.join(",")}`);

    writeEvidenceManifest(
      repo,
      "v0.0.5",
      "S8",
      [
        { kind: "log", path: "_evidence/S8/run.log" },
        { kind: "screenshot", path: "_evidence/S8/shot.png" },
      ],
      toUtcInstant("2026-06-20T00:00:00.000Z"),
    );
    const after = gate.check({ repoPath: repo, version: "v0.0.5", step: "S8", runStartedAt: started });
    ok("log+screenshot 生成 → eligible", after.eligibility === "eligible");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log("── US-02: 実 composer の §6 に「ルート台帳 + 現サイクル」両方が載る ──");
{
  const s1Phase: Phase = { id: "ph-S1" as PhaseId, step: Step("S1"), order: 0, state: "done", runs: [] };
  const s2Phase: Phase = { id: "ph-S2" as PhaseId, step: Step("S2"), order: 1, state: "running", runs: [] };
  const cycle: Cycle = {
    id: "cyc-v005" as CycleId,
    projectId: "proj" as ProjectId,
    version: "v0.0.5" as never,
    title: "verify" as never,
    taskIds: [],
    state: "active",
    createdAt: "2026-06-20T00:00:00.000Z" as never,
    phases: [s1Phase, s2Phase],
  };
  const ctx = composeStructuredContext(
    { cycle, step: Step("S2"), repoPath: REPO_ROOT },
    { fs: nodeFs },
  );
  const rendered = renderStructuredContext(ctx);
  ok("§6 にルート台帳の見出しが載る", rendered.includes("ルート台帳"));
  ok("§6 にルート carried(AUTO-ORCH-core)が載る", rendered.includes("AUTO-ORCH-core"));
  ok("§6 に現サイクル見出しが載る", rendered.includes("現サイクル ledger"));
  ok("§6 に現サイクル項目(SPLIT-v005-scope)が載る", rendered.includes("SPLIT-v005-scope"));
}

console.log("── US-05: 実 repo で binding rule 本文が実プロンプト本文へ到達 ──");
{
  const contract = probeRuleReach(nodeFs, REPO_ROOT, join(REPO_ROOT, "kit/rules/responsibility-contract.md"));
  ok("責務契約が実プロンプトに到達", contract.reached, contract.injectionPoint ?? "");
  const opmodel = probeRuleReach(nodeFs, REPO_ROOT, join(REPO_ROOT, "kit/rules/aidlc-operating-model.md"));
  ok("運用モデルが実プロンプトに到達", opmodel.reached, opmodel.injectionPoint ?? "");
}

console.log(failed ? "\n[verify-v005] FAIL" : "\n[verify-v005] 全項目 PASS(本番コードパスで実操作確認)");
process.exit(failed ? 1 : 0);

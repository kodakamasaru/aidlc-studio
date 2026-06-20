// 各 US の「実エビデンスそのもの」を実コードで生成して印字する(参照でなく中身)。
// 実行: bun run scripts/evidence-show.ts
import { readFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildServer } from "../src/server";
import { FsEvidenceGate } from "../src/infra/evidence/fs-evidence-gate";
import { writeEvidenceManifest, toUtcInstant } from "../src/infra/evidence/evidence-manifest";
import { composeStructuredContext } from "../src/app/services/context-resolver";
import { probeRuleReach } from "../src/app/services/binding-probe";
import { parseLedgerEntries, reconcileCycle, extractMentionedIds } from "../src/app/services/root-ledger";
import { nodeFs } from "../src/infra/sys/fs";
import { Step } from "../src/domain/shared/vocab";
import type { Cycle, Phase } from "../src/domain/cycle/cycle";
import type { CycleId, PhaseId, ProjectId } from "../src/domain/shared/ids";
import type { LedgerEntry } from "../src/domain/ledger/ledger-entry";

const ROOT = resolve(import.meta.dir, "..");
const hr = (us: string, title: string): void => console.log(`\n══════════ ${us} — ${title} ══════════`);

hr("US-01", "live 証拠ハードゲート(本番 FsEvidenceGate の実判定)");
{
  const live = buildServer({ orchestrator: "live", dbPath: ":memory:" });
  console.log("本番 live 合成 ports.evidence =", live.ports.evidence?.constructor.name);
  const repo = mkdtempSync(join(tmpdir(), "ev-"));
  try {
    const gate = new FsEvidenceGate(nodeFs);
    const started = toUtcInstant("2026-06-19T00:00:00.000Z");
    console.log("証拠なし →", JSON.stringify(gate.check({ repoPath: repo, version: "v0.0.5", step: "S8", runStartedAt: started })));
    writeEvidenceManifest(repo, "v0.0.5", "S8", [
      { kind: "log", path: "_evidence/S8/run.log" },
      { kind: "screenshot", path: "_evidence/S8/shot.png" },
    ], toUtcInstant("2026-06-20T00:00:00.000Z"));
    console.log("証拠あり →", JSON.stringify(gate.check({ repoPath: repo, version: "v0.0.5", step: "S8", runStartedAt: started })));
    console.log("(実 claude での拒否 = s9/live-gate/02-block-stalled.png + README)");
  } finally { rmSync(repo, { recursive: true, force: true }); }
}

hr("US-02", "ルート台帳 + §6 横断注入(実 composer 出力の §6 抜粋)");
{
  const phases: Phase[] = [
    { id: "p1" as PhaseId, step: Step("S1"), order: 0, state: "done", runs: [] },
    { id: "p2" as PhaseId, step: Step("S2"), order: 1, state: "running", runs: [] },
  ];
  const cycle: Cycle = {
    id: "c" as CycleId, projectId: "p" as ProjectId, version: "v0.0.5" as never,
    title: "x" as never, taskIds: [], state: "active",
    createdAt: "2026-06-20T00:00:00.000Z" as never, phases,
  };
  const ctx = composeStructuredContext({ cycle, step: Step("S2"), repoPath: ROOT }, { fs: nodeFs });
  console.log((ctx.decisionsLedger?.content ?? "(なし)").split("\n").slice(0, 16).join("\n"));
  console.log("… [§6 全文に root(AUTO-ORCH-core)+現サイクル(SPLIT-v005-scope)を含む]");
}

hr("US-03", "reconcile S1 完了ゲート(実判定)");
{
  const fx = parseLedgerEntries("- id: X\n  state: carried\n  into: v0.0.9\n") as LedgerEntry[];
  console.log("未消し込み(addressed=[]) → ok=", reconcileCycle(fx, "v0.0.9", []).ok, "(false=S1 ブロック)");
  console.log("消し込み(addressed=[X]) → ok=", reconcileCycle(fx, "v0.0.9", ["X"]).ok, "(true=通過)");
  const all: LedgerEntry[] = [];
  for (const v of ["v0.0.1", "v0.0.2", "v0.0.3", "v0.0.4", "v0.0.5"]) {
    try { all.push(...parseLedgerEntries(readFileSync(join(ROOT, `aidlc-docs/${v}/ledger.yml`), "utf8"))); } catch { /* skip */ }
  }
  const docs = readFileSync(join(ROOT, "aidlc-docs/v0.0.5/ledger.yml"), "utf8");
  const s1 = existsSync(join(ROOT, "aidlc-docs/v0.0.5/s1"))
    ? readdirSync(join(ROOT, "aidlc-docs/v0.0.5/s1")).map((f) => readFileSync(join(ROOT, "aidlc-docs/v0.0.5/s1", f), "utf8")).join("\n")
    : "";
  const ids = extractMentionedIds([...new Set(all.map((e) => e.id))], `${s1}\n${docs}`);
  console.log("実 v0.0.5 全 ledger → ok=", reconcileCycle(all, "v0.0.5", ids).ok, "(true=未 reconcile ゼロ)");
}

hr("US-04", "seeded 証拠生成(manifest writer → ゲート round-trip)");
{
  const repo = mkdtempSync(join(tmpdir(), "ev4-"));
  try {
    const p = writeEvidenceManifest(repo, "v0.0.5", "S8",
      [{ kind: "log", path: "_evidence/S8/run.log" }, { kind: "test-report", path: "_evidence/S8/r.json" }],
      toUtcInstant("2026-06-20T00:00:00.000Z"));
    console.log("生成 manifest:", readFileSync(p, "utf8").replace(/\s+/g, " ").slice(0, 170));
    console.log("ゲート判定:", JSON.stringify(new FsEvidenceGate(nodeFs).check({ repoPath: repo, version: "v0.0.5", step: "S8", runStartedAt: toUtcInstant("2026-06-19T00:00:00.000Z") })));
  } finally { rmSync(repo, { recursive: true, force: true }); }
}

hr("US-05", "binding-rule 到達 probe(実 repo)");
{
  for (const r of ["responsibility-contract.md", "aidlc-operating-model.md"]) {
    const res = probeRuleReach(nodeFs, ROOT, join(ROOT, "kit/rules", r));
    console.log(`${r} → reached=${res.reached} 注入点="${(res.injectionPoint ?? "").slice(0, 30)}…"`);
  }
  const link = probeRuleReach(nodeFs, ROOT, join(ROOT, "kit/rules/ledger.md"));
  console.log(`ledger.md(リンク参照のみ) → reached=${link.reached}(false=本文未到達を正しく検出)`);
}

hr("US-06", "scripted summary 日本語化");
{
  const src = readFileSync(join(ROOT, "src/infra/orchestrator/scripted.ts"), "utf8");
  const m = [...src.matchAll(/"([^"]*(?:です|ます|結果|確定|まとめ)[^"]*)"/g)].map((x) => x[1]!);
  console.log("scripted が emit する日本語文字列(抜粋):");
  for (const s of [...new Set(m)].slice(0, 5)) console.log("  -", s);
}

hr("US-07", "allowed に multi-turn(happy fallback 解消)");
{
  const src = readFileSync(join(ROOT, "src/server.ts"), "utf8");
  const i = src.indexOf("const allowed");
  console.log(src.slice(i, i + 300).split("\n").slice(0, 11).join("\n"));
}

hr("US-09", "dead code 削除");
{
  const f = join(ROOT, "web/src/features/settings/StepConfigPage.tsx");
  console.log("StepConfigPage.tsx 存在 =", existsSync(f), "(false=削除済)");
  const dir = join(ROOT, "web/src/features/settings");
  console.log("settings 配下:", existsSync(dir) ? readdirSync(dir).join(", ") || "(空)" : "(dir なし)");
}

console.log("\n(US-01 live 拒否 = s9/live-gate/ / US-08 バッジ = s9/screenshots/ の screenshot で別途提示)");

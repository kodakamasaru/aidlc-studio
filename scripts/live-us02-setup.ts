// live-us02-setup — US-02(ルート台帳の横断注入)を「画面上の AI 振る舞い」で実証する準備。
// 隔離 repo に root 台帳 aidlc-docs/ledger.yml(distinctive な carried 項目)+ brief を置き、
// S1 pending のサイクルを seed。実 claude で S1 を走らせると composer が §6 にこの carried
// 項目を本文注入する → AI の S1 出力(要件/レビュー画面)がそれを取り込むかを確認できる。
//
// 検証(別ステップ): S1 done 後、s1 成果物に carried トークン(CSV/エクスポート)が出るか。
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../src/infra/db/open";
import { buildStore } from "../src/infra/db/store";
import { UuidIdGen } from "../src/infra/sys/id-gen";
import { SystemClock } from "../src/infra/sys/clock";
import { openProject } from "../src/domain/project/project";
import type { VisionRef, SkillRef, Project } from "../src/domain/project/project";
import { DEFAULT_STEPS } from "../src/domain/shared/vocab";
import { ProjectId } from "../src/domain/shared/ids";
import { seedCycleCore } from "../src/infra/seed/seed-cycle-core";

const STUDIO_ROOT = process.cwd();
const SANDBOX = "/tmp/aidlc-us02";
const DB = "/tmp/aidlc-us02.db";

for (const s of ["", "-wal", "-shm"]) rmSync(`${DB}${s}`, { force: true });
rmSync(SANDBOX, { recursive: true, force: true });
mkdirSync(join(SANDBOX, "aidlc-docs"), { recursive: true });
cpSync(join(STUDIO_ROOT, "kit"), join(SANDBOX, "kit"), { recursive: true });

writeFileSync(
  join(SANDBOX, "aidlc-docs", "aidlc-brief.md"),
  "# brief — 個人向け家計簿アプリ\n\n" +
    "支出の記録(金額/日付/カテゴリ)・月次集計・予算と超過警告。1人で使う。\n",
);
// ★ distinctive な carried 項目。§6 でこれが S1 プロンプトに本文注入される。
// AI が前サイクルの未解決として取り込めば、出力に「CSV エクスポート」が現れるはず。
writeFileSync(
  join(SANDBOX, "aidlc-docs", "ledger.yml"),
  [
    "# ルート台帳(aidlc-docs/ledger.yml)— 全サイクル横断・append-only",
    "- id: CARRY-csv-export",
    "  origin: v0.0.0/s10 (前サイクルで見送り)",
    "  decision: >",
    "    家計簿の「CSV エクスポート」機能を前サイクル(v0.0.0)では見送った(後回し)。",
    "    次サイクルで必ず US 化して実装する、というのが前サイクルの確定事項。",
    "  state: carried",
    "  into: v0.0.1",
    "",
  ].join("\n"),
);

const store = buildStore(openDb(DB));
const ids = new UuidIdGen();
const now = new SystemClock().now();

const project: Project = (() => {
  const r = openProject({
    id: ProjectId("p-us02"),
    repoPath: SANDBOX,
    vision: "aidlc-docs/aidlc-brief.md" as unknown as VisionRef,
    pipelineDef: DEFAULT_STEPS.map((id, i) => ({
      id,
      label: id as string,
      order: i,
      skillRef: `kit/skills/${id as string}` as unknown as SkillRef,
    })),
    env: { modelName: "claude", worktreeRoot: "/wt", stallTimeoutMin: 30, maxAttempt: 3 },
    createdAt: now,
  });
  if (!r.ok) throw new Error(`openProject failed: ${JSON.stringify(r.error)}`);
  return r.value;
})();
store.uow.run(() => store.repos.projects.save(project));

const result = seedCycleCore({
  store,
  ids,
  project,
  fixture: { version: "v0.0.1", title: "家計簿(US-02 台帳注入 確認)", steps: [{ step: "S1", state: "pending" }] },
  now,
  studioRoot: STUDIO_ROOT,
});

console.log(`[live-us02-setup] cycle=${result.cycle.id}`);
console.log(`[live-us02-setup] db=${DB} repo=${SANDBOX}`);
console.log(`carried 項目: CARRY-csv-export(CSV エクスポート)を root 台帳に設置`);
console.log(`\n次: AIDLC_ORCHESTRATOR=live AIDLC_DB=${DB} PORT=8787 bun run src/main.ts`);
console.log(`POST /api/cycles/${result.cycle.id}/phases/S1/start → AIDLC_LIVE_STEP=S1 AIDLC_LIVE_CYCLE=${result.cycle.id} bun run scripts/live-pass-attach.ts`);

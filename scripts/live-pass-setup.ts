// live-pass-setup — US-01 PASS 経路(証拠あり→done 許可)を実 claude で実証する準備。
// seed(US-04)で S1〜S8 を done にし、S9 を pending(証拠なし)で置く。これで S9 を
// 1 ステップだけ実 claude で走らせれば、captureVerifyUi が証拠を自動生成し、ゲートが
// done を「許可」するまでを実機で確認できる(= 安価 live / US-04 の本来の狙い)。
//
// 出力: 隔離 DB /tmp/aidlc-passs9.db + 隔離 repo /tmp/aidlc-passs9(kit 同梱)に
// chat サイクル(S1-S8 done / S9 pending)を seed。cycle id を表示。
// 次: AIDLC_ORCHESTRATOR=live AIDLC_DB=/tmp/aidlc-passs9.db PORT=8787 bun run src/main.ts
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../src/infra/db/open";
import { buildStore } from "../src/infra/db/store";
import { UuidIdGen } from "../src/infra/sys/id-gen";
import { SystemClock } from "../src/infra/sys/clock";
import { openProject } from "../src/domain/project/project";
import type { VisionRef, SkillRef, Project } from "../src/domain/project/project";
import { DEFAULT_STEPS } from "../src/domain/shared/vocab";
import { ProjectId } from "../src/domain/shared/ids";
import { seedCycleCore, type CycleFixture, type StepSeed } from "../src/infra/seed/seed-cycle-core";

const STUDIO_ROOT = process.cwd();
const SANDBOX = "/tmp/aidlc-passs9";
const DB = "/tmp/aidlc-passs9.db";

// fresh
for (const s of ["", "-wal", "-shm"]) rmSync(`${DB}${s}`, { force: true });
rmSync(SANDBOX, { recursive: true, force: true });
mkdirSync(SANDBOX, { recursive: true });
// live composer reads skills + contract + operating-model from repoPath/kit
cpSync(join(STUDIO_ROOT, "kit"), join(SANDBOX, "kit"), { recursive: true });
mkdirSync(join(SANDBOX, "aidlc-docs"), { recursive: true });
writeFileSync(
  join(SANDBOX, "aidlc-docs", "aidlc-brief.md"),
  "# brief — 社内チャット(live PASS 確認用)\n\nチャンネル/投稿/未読/メンション/検索の小規模社内チャット。\n",
);

const store = buildStore(openDb(DB));
const ids = new UuidIdGen();
const now = new SystemClock().now();

const project: Project = (() => {
  const r = openProject({
    id: ProjectId("p-passs9"),
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

// chat fixture の S1-S8(done / S7,S8 は evidence complete を seed)+ S9 pending(証拠なし)。
const chatDir = join(STUDIO_ROOT, "fixtures", "seed-cycles", "chat");
const chat = JSON.parse(readFileSync(join(chatDir, "cycle.json"), "utf8")) as CycleFixture;
const s1to8 = chat.steps.filter((s) => s.step !== "S9");
const steps: StepSeed[] = [...s1to8, { step: "S9", state: "pending" }];

const result = seedCycleCore({
  store,
  ids,
  project,
  fixture: { ...chat, steps },
  now,
  studioRoot: STUDIO_ROOT,
  fixtureDir: chatDir,
});

console.log(`[live-pass-setup] cycle=${result.cycle.id}`);
console.log(`[live-pass-setup] db=${DB} repo=${SANDBOX}`);
console.log(`[live-pass-setup] phases:`);
for (const p of result.cycle.phases) console.log(`  - ${p.step as string}: ${p.state}`);
console.log(`\n次: AIDLC_ORCHESTRATOR=live AIDLC_DB=${DB} PORT=8787 bun run src/main.ts`);
console.log(`その後: AIDLC_LIVE_CYCLE=${result.cycle.id} bun run scripts/live-pass-drive.ts`);

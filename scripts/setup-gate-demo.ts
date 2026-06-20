// US-01 live gate demo setup — 使い捨て DB に「S1 が requiresLiveEvidence」のデモ
// プロジェクトを作る。これで S1 を live 起動すると、claude が done を自己申告しても
// 証拠 manifest が無ければ evidence gate が done を拒否して stall する(= ゲートが実際に
// 止める live 証拠を撮るための最小構成)。実運用では S7/S8/S9 が requiresLiveEvidence。
import { openDb } from "../src/infra/db/open";
import { buildStore } from "../src/infra/db/store";
import { UuidIdGen } from "../src/infra/sys/id-gen";
import { SystemClock } from "../src/infra/sys/clock";
import { openProject } from "../src/domain/project/project";
import type { VisionRef, SkillRef } from "../src/domain/project/project";
import { Step } from "../src/domain/shared/vocab";
import { unwrap } from "../src/domain/shared/result";
import type { Text } from "../src/domain/shared/primitives";

const dbPath = process.env.AIDLC_DB ?? "/tmp/aidlc-gate-demo.db";
const repoPath = process.env.AIDLC_SANDBOX ?? "/tmp/aidlc-sandbox";

const db = openDb(dbPath);
const store = buildStore(db);
const ids = new UuidIdGen();
const clock = new SystemClock();

const project = unwrap(
  openProject({
    id: ids.projectId(),
    repoPath,
    vision: "aidlc-brief.md" as unknown as VisionRef,
    pipelineDef: [
      {
        id: Step("S1"),
        label: "要件",
        order: 0,
        skillRef: "aidlc-s1-requirements" as unknown as SkillRef,
        // DEMO: S1 を技術 step 扱いにして evidence gate を発火させる(最小構成)。
        contracts: {
          output: { artifactGlob: "aidlc-docs/{version}/s1/**" as Text },
          humanGate: { mode: "device_check" },
          escalation: { onStall: "retry", maxRetry: 3 },
          requiresLiveEvidence: true,
        },
      },
    ],
    env: {
      modelName: "claude",
      worktreeRoot: ".aidlc-worktrees",
      stallTimeoutMin: 30,
      maxAttempt: 3,
    },
    createdAt: clock.now(),
  }),
);

store.uow.run(() => store.repos.projects.save(project));
console.log(`[setup-gate-demo] project ${project.id} (S1 requiresLiveEvidence) → ${dbPath}`);

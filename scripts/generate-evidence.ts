// US-04 / Unit-04 — generateEvidence(step): capture a step's live evidence and
// write _evidence/<step>/manifest.json (consumed by the Unit-01 gate). Captures a
// verify-ui screenshot (視覚証拠) + a vertical-path log (縦経路ログ) and records
// both in the manifest with UTC capturedAt. Default form set = screenshot + log;
// transition steps may add a video, backend/script steps a test-report (US-01 の
// step 性質別形式 / Unit-04 D-01).
//
// Usage:
//   bun run scripts/generate-evidence.ts --repo <path> --version vX.Y.Z --step S8 \
//     [--url http://127.0.0.1:8787/] [--report <file>] [--video <file>]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  writeEvidenceManifest,
  toUtcInstant,
  type EvidenceFormInput,
} from "../src/infra/evidence/evidence-manifest";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const repo = resolve(arg("repo") ?? process.env.AIDLC_SANDBOX ?? process.cwd());
const version = arg("version");
const step = arg("step");
const url = arg("url") ?? `http://127.0.0.1:${process.env.PORT ?? "8787"}/`;
const reportPath = arg("report");
const videoPath = arg("video");

if (!version || !step) {
  console.error("usage: generate-evidence.ts --repo <path> --version vX.Y.Z --step SN [--url ...] [--report ...] [--video ...]");
  process.exit(2);
}

const REPO_ROOT = resolve(import.meta.dir, "..");
const evidenceDir = join(repo, "aidlc-docs", version, "_evidence", step);
mkdirSync(evidenceDir, { recursive: true });

const forms: EvidenceFormInput[] = [];
const now = toUtcInstant(new Date());

// 1. 視覚証拠: capture a verify-ui screenshot via the bundled-Chromium ui-shot.
const shotAbs = join(evidenceDir, "shot.png");
const shot = Bun.spawnSync(["bun", "run", "scripts/ui-shot.ts", url, shotAbs], {
  cwd: REPO_ROOT,
  env: { ...process.env, AIDLC_WEB_BASE: url },
});
const shotOut = `${shot.stdout?.toString() ?? ""}${shot.stderr?.toString() ?? ""}`;
const shotOk = shot.exitCode === 0;
if (shotOk) {
  forms.push({ kind: "screenshot", path: `_evidence/${step}/shot.png`, capturedAt: now });
} else {
  console.error(`[generate-evidence] screenshot 失敗 (exit ${shot.exitCode}) — manifest に記録しない:\n${shotOut}`);
}

// 2. 縦経路ログ: probe the live backend health + record the capture context.
let health = "(unreachable)";
try {
  const base = new URL(url);
  const res = await fetch(`${base.origin}/api/health`);
  health = `${res.status} ${res.ok ? "ok" : "ng"}`;
} catch (e) {
  health = `error: ${e instanceof Error ? e.message : String(e)}`;
}
const logAbs = join(evidenceDir, "run.log");
writeFileSync(
  logAbs,
  [
    `# live 縦経路ログ — ${step} @ ${now}`,
    `url: ${url}`,
    `backend /api/health: ${health}`,
    `screenshot: ${shotOk ? "captured" : "FAILED"}`,
    "── ui-shot 出力 ──",
    shotOut.trim(),
    "",
  ].join("\n"),
  "utf8",
);
forms.push({ kind: "log", path: `_evidence/${step}/run.log`, capturedAt: now });

// 3. step 性質別の追加形式(任意): test-report / video。
if (reportPath) forms.push({ kind: "test-report", path: reportPath, capturedAt: now });
if (videoPath) forms.push({ kind: "video", path: videoPath, capturedAt: now });

const manifestPath = writeEvidenceManifest(repo, version, step, forms, now);
console.log(`[generate-evidence] wrote ${manifestPath}`);
console.log(`  forms: ${forms.map((f) => f.kind).join(", ")}`);
if (!shotOk) {
  console.error("[generate-evidence] 視覚証拠が無いため Unit-01 ゲートは blocked になる(意図的: 撮影失敗を done にしない)。");
  process.exit(1);
}

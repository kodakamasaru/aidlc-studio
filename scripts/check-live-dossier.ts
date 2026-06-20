// Rule C-2 機械ゲート — 「実操作確認(live)」が実 claude + 実操作で行われた証拠
// (live operation dossier)の存在を検査する。無ければ exit 1 で S9 / CLOSE をブロック。
//
// dossier 要件(aidlc-docs/<version>/s9/live/):
//   ① 操作の動画 *.webm が 1 本以上
//   ② 操作ステップ毎の連番 screenshot NN-*.png が閾値以上(open→…→approve)
//   ③ README.md(操作→結果の説明 + 実 run の runId)
//
// これにより「実操作確認」をコードパス検証/scripted/static 1枚/go-ahead 待ち deferral で
// 満たすこと(v0.0.5 S9 で実際に起きた誤り)を構造的に不能にする。
//
// Usage: bun run scripts/check-live-dossier.ts <version>   (= live:check)
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const MIN_SHOTS = 5; // open → create → start → review → approve(最低限の操作列)

const version = process.argv.slice(2).find((a) => /^v\d+\.\d+\.\d+$/.test(a));
if (!version) {
  console.error("usage: check-live-dossier.ts <version>  (例: v0.0.5)");
  process.exit(2);
}

const REPO_ROOT = resolve(import.meta.dir, "..");
const dir = join(REPO_ROOT, "aidlc-docs", version, "s9", "live");

if (!existsSync(dir)) {
  console.error(`[live:check] ${version}: FAIL — live dossier ディレクトリが無い(${dir})。`);
  console.error("  実 claude を実際に走らせ実操作を記録せよ: bun run scripts/live-run-s1.ts");
  process.exit(1);
}

const files = readdirSync(dir);
const videos = files.filter((f) => f.endsWith(".webm"));
const shots = files.filter((f) => /^\d{2}-.*\.png$/.test(f));
const hasReadme = files.includes("README.md");

let failed = false;
const check = (label: string, cond: boolean, detail = ""): void => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failed = true;
};

console.log(`[live:check] ${version} — live operation dossier (${dir})`);
check("操作動画 *.webm が 1 本以上", videos.length >= 1, `${videos.length} 本`);
check(`操作列 screenshot NN-*.png が ${MIN_SHOTS} 枚以上`, shots.length >= MIN_SHOTS, `${shots.length} 枚`);
check("README.md(操作→結果 + 実 runId)が有る", hasReadme);

if (failed) {
  console.error(`[live:check] ${version}: FAIL — 実操作確認(Rule C-2)が未充足。S9/CLOSE を確定にしない。`);
  process.exit(1);
}
console.log(`[live:check] ${version}: PASS — 実 claude + 実操作の dossier を確認。`);

// 毎サイクル必達の per-US エビデンスゲート(汎用 / 版に依存しない)。
// s1/ の US を自動列挙し、s9/evidence-by-us.md に各 US の entry が揃っているか検査する。
// 1 つでも欠ければ exit 1 で S9/CLOSE をブロック(全 US にエビデンスを強制)。
//
// これは「entry の存在 + 証拠アーティファクト参照」を機械強制する層。中身(実エビデンスの
// 妥当性)は S10 人間レビュー + live:check(live dossier)が担う。三層で「毎回・全 US・実物」
// を構造的に担保。
//
// Usage: bun run scripts/evidence-check.ts <version>   (= evidence:check)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const DOCS = join(REPO_ROOT, "aidlc-docs");

function sortedVersions(): string[] {
  return readdirSync(DOCS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^v\d+\.\d+\.\d+$/.test(d.name))
    .map((d) => d.name)
    .sort();
}

const version = process.argv.slice(2).find((a) => /^v\d+\.\d+\.\d+$/.test(a)) ?? sortedVersions().at(-1);
if (!version) {
  console.error("[evidence:check] no cycle version found.");
  process.exit(2);
}

const s1Dir = join(DOCS, version, "s1");
if (!existsSync(s1Dir)) {
  console.error(`[evidence:check] ${version}: s1/ が無い(US 未定義)。`);
  process.exit(1);
}

// US 列挙: s1/us-NN-*.md → "US-NN"。
const usIds = [
  ...new Set(
    readdirSync(s1Dir)
      .map((f) => f.match(/^us-(\d+)/i)?.[1])
      .filter((n): n is string => n !== undefined)
      .map((n) => `US-${n}`),
  ),
].sort();

if (usIds.length === 0) {
  console.error(`[evidence:check] ${version}: s1/ に US ファイル(us-NN-*.md)が無い。`);
  process.exit(1);
}

const mapPath = join(DOCS, version, "s9", "evidence-by-us.md");
if (!existsSync(mapPath)) {
  console.error(
    `[evidence:check] ${version}: エビデンス対応表 s9/evidence-by-us.md が無い。\n` +
      "  毎サイクル、全 US の「変更→確認手段→証拠アーティファクト」を s9/evidence-by-us.md に出すこと。",
  );
  process.exit(1);
}
const map = readFileSync(mapPath, "utf8");

// 各 US が対応表に「## US-NN」見出しで存在し、かつ証拠アーティファクト参照を持つか。
const EVIDENCE_HINT = /(s9\/|\.png|\.webm|\.txt|\.test\.ts|reached|eligibility|ok=|PASS|screenshot|dossier|manifest)/i;
const missing: string[] = [];
const noArtifact: string[] = [];
for (const us of usIds) {
  const re = new RegExp(`^#{1,4}\\s*${us}\\b(.*(?:\\n(?!#{1,4}\\s*US-).*)*)`, "m");
  const sec = map.match(re);
  if (!sec) {
    missing.push(us);
  } else if (!EVIDENCE_HINT.test(sec[1] ?? "")) {
    noArtifact.push(us);
  }
}

if (missing.length === 0 && noArtifact.length === 0) {
  console.log(`[evidence:check] ${version}: PASS — 全 ${usIds.length} US にエビデンス entry + 証拠参照あり。`);
  process.exit(0);
}
console.error(`[evidence:check] ${version}: FAIL — per-US エビデンス不足。`);
if (missing.length) console.error(`  対応表に entry が無い US: ${missing.join(", ")}`);
if (noArtifact.length) console.error(`  証拠アーティファクト参照が無い US: ${noArtifact.join(", ")}`);
console.error("  → s9/evidence-by-us.md に各 US の証拠(screenshot/動画/CLI ログ/テスト)を出すこと。");
process.exit(1);

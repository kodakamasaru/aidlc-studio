// US-03 / Unit-03 — reconcile check: the S1 完了ゲート. A cycle may not finalize
// S1 while a prior-cycle carried item targeting it is unaddressed, or a
// 2-consecutive-carried (escalation) item lacks a first-class US. Exits non-zero
// (listing the offending ids) to BLOCK S1; exit 0 = pass.
//
// "Addressed" = the prior carried id is referenced in the current cycle's S1 US
// `由来:` lines, OR handled in the current cycle's ledger (re-carry/done/dropped —
// catches splits/renames via the origin text). Escalation items need a first-class
// US specifically (or an explicit drop this cycle).
//
// Usage:
//   bun run scripts/reconcile-check.ts <version>     # default: latest cycle dir
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  parseLedgerEntries,
  reconcileCycle,
  extractMentionedIds,
  compareVersion,
} from "../src/app/services/root-ledger";
import type { LedgerEntry } from "../src/domain/ledger/ledger-entry";

const REPO_ROOT = resolve(import.meta.dir, "..");
const DOCS = join(REPO_ROOT, "aidlc-docs");

function sortedVersions(): string[] {
  return readdirSync(DOCS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^v\d+\.\d+\.\d+$/.test(d.name))
    .map((d) => d.name)
    .sort(compareVersion);
}

const versionArg = process.argv.slice(2).find((a) => /^v\d+\.\d+\.\d+$/.test(a));
const target = versionArg ?? sortedVersions().at(-1);
if (!target) {
  console.error("[reconcile-check] no cycle version found.");
  process.exit(2);
}

/** Every per-version ledger's entries (cross-cycle, duplicates kept), earliest first. */
function allCycleEntries(): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const v of sortedVersions()) {
    const p = join(DOCS, v, "ledger.yml");
    if (existsSync(p)) entries.push(...parseLedgerEntries(readFileSync(p, "utf8")));
  }
  return entries;
}

/** Concatenated text of the current cycle's S1 US docs. */
function s1DocsText(): string {
  const dir = join(DOCS, target!, "s1");
  if (!existsSync(dir)) return "";
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

function currentLedgerText(): string {
  const p = join(DOCS, target!, "ledger.yml");
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

const all = allCycleEntries();
const docs = s1DocsText();
const ledgerText = currentLedgerText();

// Candidate ids = everything that could need reconciling against this target.
const candidateIds = [...new Set(all.map((e) => e.id))];
// addressed = reflected in S1 docs OR current ledger (re-carry/done/dropped).
const addressedIds = extractMentionedIds(candidateIds, `${docs}\n${ledgerText}`);

const report = reconcileCycle(all, target, addressedIds);

if (report.ok) {
  console.log(`[reconcile-check] ${target}: PASS — 未 reconcile / 未対応 escalation なし。`);
  process.exit(0);
}

console.error(`[reconcile-check] ${target}: FAIL — S1 を確定にできません。`);
if (report.unreconciled.length > 0) {
  console.error(`  未 reconcile(carried→${target} が US/D に未反映):`);
  for (const e of report.unreconciled) console.error(`    - ${e.id}  (origin: ${e.origin})`);
}
if (report.escalationUnaddressed.length > 0) {
  console.error("  未対応 escalation(2サイクル連続 carried = first-class US 必須):");
  for (const e of report.escalationUnaddressed) console.error(`    - ${e.id}`);
}
process.exit(1);

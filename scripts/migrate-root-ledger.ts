// US-02 / Unit-02 — one-time migration: build the cross-cycle root ledger
// aidlc-docs/ledger.yml from the per-version ledgers. Idempotent (re-run safe).
//
// "Current unresolved view": a carried entry is kept only when its `into:` targets
// a cycle that has NOT yet started (> the current/in-progress version). That drops
// stale carried-into-already-reconciled entries (e.g. v0.0.4's carried→v0.0.5,
// which v0.0.5 already re-carried forward under new ids) while preserving the
// genuinely-pending items. Per-version ledgers are NOT modified (history kept).
//
// Usage:
//   bun run scripts/migrate-root-ledger.ts            # write aidlc-docs/ledger.yml
//   bun run scripts/migrate-root-ledger.ts --check    # exit 1 if root is stale
//   bun run scripts/migrate-root-ledger.ts <currentVersion>   # threshold override
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  parseLedgerEntries,
  migrateToRootLedger,
  compareVersion,
} from "../src/app/services/root-ledger";

const REPO_ROOT = resolve(import.meta.dir, "..");
const DOCS = join(REPO_ROOT, "aidlc-docs");
const ROOT_LEDGER = join(DOCS, "ledger.yml");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const versionArg = args.find((a) => /^v\d+\.\d+\.\d+$/.test(a));

function sortedVersions(): string[] {
  return readdirSync(DOCS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^v\d+\.\d+\.\d+$/.test(d.name))
    .map((d) => d.name)
    .sort(compareVersion);
}

/** The in-progress (latest existing) version: carried entries must target > this. */
const currentVersion = versionArg ?? sortedVersions().at(-1) ?? "v0.0.0";

/** version ledgers, earliest first (so later cycles override earlier by id). */
function versionLedgers(): string[] {
  const sources: string[] = [];
  for (const v of sortedVersions()) {
    const p = join(DOCS, v, "ledger.yml");
    if (existsSync(p)) sources.push(readFileSync(p, "utf8"));
  }
  return sources;
}

const HEADER = `# ルート台帳(aidlc-docs/ledger.yml)— 全サイクル横断・append-only(US-02 / Unit-02)。
# schema = kit/rules/ledger.md。state: carried|done|dropped。carried は into 必須。
# これは「未解決の現在ビュー」: into が未着手サイクル(> ${currentVersion})を指す carried のみを保持する。
# 版別 ledger(aidlc-docs/<vX>/ledger.yml)は履歴として不変。本ファイルは
#   bun run scripts/migrate-root-ledger.ts
# で再生成できる(冪等)。新しい carried は確定と同じターンで本ファイルへも追記する。
`;

function build(): string {
  const aggregated = migrateToRootLedger(versionLedgers());
  const entries = parseLedgerEntries(aggregated).filter(
    (e) => e.into !== undefined && compareVersion(e.into, currentVersion) > 0,
  );
  const body = entries
    .map((e) => {
      const lines = [`- id: ${e.id}`];
      if (e.origin) lines.push(`  origin: ${e.origin}`);
      if (e.decision) lines.push(`  decision: ${JSON.stringify(e.decision)}`);
      lines.push(`  state: ${e.state}`);
      if (e.into) lines.push(`  into: ${e.into}`);
      if (e.reason) lines.push(`  reason: ${JSON.stringify(e.reason)}`);
      if (e.closedIn) lines.push(`  closed_in: ${e.closedIn}`);
      if (e.escalation) lines.push(`  escalation: ${JSON.stringify(e.escalation)}`);
      return lines.join("\n");
    })
    .join("\n\n");
  return `${HEADER}\n${body}${body.length > 0 ? "\n" : ""}`;
}

const next = build();

if (checkOnly) {
  const current = existsSync(ROOT_LEDGER) ? readFileSync(ROOT_LEDGER, "utf8") : "";
  if (current.trim() !== next.trim()) {
    console.error(
      "[migrate-root-ledger] root ledger is STALE — run `bun run scripts/migrate-root-ledger.ts` to regenerate.",
    );
    process.exit(1);
  }
  console.log("[migrate-root-ledger] root ledger up to date.");
  process.exit(0);
}

writeFileSync(ROOT_LEDGER, next, "utf8");
const kept = parseLedgerEntries(next);
console.log(
  `[migrate-root-ledger] wrote ${ROOT_LEDGER}\n  current version: ${currentVersion}\n  carried entries kept (into > ${currentVersion}): ${kept.length}`,
);
for (const e of kept) console.log(`  - ${e.id} → ${e.into}`);

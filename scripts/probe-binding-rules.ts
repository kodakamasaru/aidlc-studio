// US-05 / Unit-05 — binding-rule reach gate. Probes every rule that MUST reach the
// headless prompt body and exits non-zero if any does not (a link/path reference
// alone does not reach a headless run). Add a rule here when you make a new
// kit/rules/*.md binding (operating-model checklist mandates this).
//
// Usage: bun run scripts/probe-binding-rules.ts
import { join, resolve } from "node:path";
import { nodeFs } from "../src/infra/sys/fs";
import { probeRuleReach } from "../src/app/services/binding-probe";

const REPO_ROOT = resolve(import.meta.dir, "..");

/** Rules that MUST reach the headless prompt body (injected verbatim, not linked). */
const MUST_REACH = [
  "kit/rules/responsibility-contract.md",
  "kit/rules/aidlc-operating-model.md",
];

let failed = false;
for (const rel of MUST_REACH) {
  const result = probeRuleReach(nodeFs, REPO_ROOT, join(REPO_ROOT, rel));
  if (result.reached) {
    console.log(`[probe-binding-rules] OK   ${rel}  (注入点: ${result.injectionPoint ?? "?"})`);
  } else {
    console.error(
      `[probe-binding-rules] FAIL ${rel} — 本文が headless prompt に届いていません(リンク参照だけでは届かない / US-05)。`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("[probe-binding-rules] すべての binding rule が headless prompt 本文に到達。");

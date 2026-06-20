// Root ledger (S5 Unit-02 / US-02) — the cross-cycle, append-only handover ledger
// at aidlc-docs/ledger.yml (全版共通, like brief.md). Per-version ledgers
// (aidlc-docs/<vX>/ledger.yml) stay as historical records; the root ledger holds
// the "current view of what is still unresolved" so a carried item never falls out
// of the AI's view after one hop (P37 の機械的原因の根治).
//
// This module: (1) a minimal, dependency-free parser for the ledger schema
// (kit/rules/ledger.md), (2) loadRootLedger with per-entry schema validation
// (validateLedgerEntry), (3) resolveSection6 = the cross-cycle injection text
// (root + current cycle), (4) migrateToRootLedger = idempotent aggregation of
// unresolved carried items from per-version ledgers into the root.
import { join } from "node:path";
import type { Fs } from "../ports/sys";
import {
  validateLedgerEntry,
  reconcileStatus,
  detectEscalation,
  type LedgerEntry,
  type LedgerState,
} from "../../domain/ledger/ledger-entry";

/** Where the cross-cycle root ledger lives, relative to a project repo root. */
export function rootLedgerPath(repoPath: string): string {
  return join(repoPath, "aidlc-docs", "ledger.yml");
}

/** Where a per-version ledger lives. */
export function versionLedgerPath(repoPath: string, version: string): string {
  return join(repoPath, "aidlc-docs", version, "ledger.yml");
}

const KNOWN_KEYS: ReadonlySet<string> = new Set([
  "id",
  "origin",
  "decision",
  "state",
  "into",
  "reason",
  "closed_in",
  "escalation",
]);

const VALID_STATES: ReadonlySet<string> = new Set(["carried", "done", "dropped"]);

/** Strip a trailing ` # comment` from an inline scalar (not inside quotes). */
function stripInlineComment(value: string): string {
  // Only strip when the # is preceded by whitespace (so URLs/paths with no
  // leading-space # are safe; ledger values don't embed quoted #).
  const m = value.match(/\s+#/);
  if (m && m.index !== undefined) return value.slice(0, m.index).trim();
  return value.trim();
}

function unquote(value: string): string {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    return v.slice(1, -1);
  }
  return v;
}

type RawEntry = Record<string, string>;

/**
 * Minimal line-based parser for the ledger list. The schema is constrained
 * (kit/rules/ledger.md): a top-level YAML list of maps; each map has scalar keys
 * plus optional folded `>` / `|` blocks (decision/reason). Detection is
 * INDENT-based: entry keys sit at indent 2; folded value lines sit deeper, so a
 * decision body containing a colon is never mistaken for a key.
 */
export function parseLedgerEntries(raw: string): readonly LedgerEntry[] {
  const lines = raw.split(/\r?\n/);
  const rawEntries: RawEntry[] = [];
  let cur: RawEntry | null = null;
  let foldKey: string | null = null;
  let foldLines: string[] = [];

  const flushFold = (): void => {
    if (cur !== null && foldKey !== null) {
      cur[foldKey] = foldLines.join(" ").replace(/\s+/g, " ").trim();
    }
    foldKey = null;
    foldLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();

    // Inside a folded scalar: deeper-indented (or blank) lines are continuation.
    if (foldKey !== null) {
      const indent = line.length - line.trimStart().length;
      const isContinuation = trimmed !== "" && indent >= 4 && !/^- /.test(trimmed);
      if (isContinuation && !/^#/.test(trimmed)) {
        foldLines.push(trimmed);
        continue;
      }
      flushFold();
      // fall through: this line is a new key / new entry / blank.
    }

    if (trimmed === "" || /^#/.test(trimmed)) continue;

    // New entry: "- id: VALUE" (first key carried on the dash line).
    const entryStart = trimmed.match(/^-\s+([A-Za-z_][\w-]*):\s*(.*)$/);
    if (entryStart) {
      flushFold();
      cur = {};
      rawEntries.push(cur);
      assignKey(cur, entryStart[1]!, entryStart[2]!, (k) => {
        foldKey = k;
        foldLines = [];
      });
      continue;
    }

    // Subsequent key within the current entry.
    const keyLine = trimmed.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (keyLine && cur !== null) {
      assignKey(cur, keyLine[1]!, keyLine[2]!, (k) => {
        foldKey = k;
        foldLines = [];
      });
      continue;
    }
    // Unrecognized line → ignore (defensive).
  }
  flushFold();

  return rawEntries.map(toLedgerEntry).filter((e): e is LedgerEntry => e !== null);
}

function assignKey(
  cur: RawEntry,
  key: string,
  rawValue: string,
  beginFold: (k: string) => void,
): void {
  if (!KNOWN_KEYS.has(key)) return;
  const value = rawValue.trim();
  if (value === ">" || value === "|" || value === ">-" || value === "|-") {
    beginFold(key);
    return;
  }
  cur[key] = unquote(stripInlineComment(value));
}

function toLedgerEntry(raw: RawEntry): LedgerEntry | null {
  const id = raw.id?.trim();
  const state = raw.state?.trim();
  if (!id || !state || !VALID_STATES.has(state)) return null;
  const entry: LedgerEntry = {
    id,
    origin: raw.origin ?? "",
    decision: raw.decision ?? "",
    state: state as LedgerState,
    ...(raw.into ? { into: raw.into } : {}),
    ...(raw.reason ? { reason: raw.reason } : {}),
    ...(raw.closed_in ? { closedIn: raw.closed_in } : {}),
    ...(raw.escalation ? { escalation: raw.escalation } : {}),
  };
  return entry;
}

export interface LoadedLedger {
  readonly entries: readonly LedgerEntry[];
  /** Schema violations across all entries (validateLedgerEntry), prefixed by id. */
  readonly violations: readonly string[];
}

/** Read + parse + schema-validate the root ledger. Missing file → empty. */
export function loadRootLedger(fs: Fs, repoPath: string): LoadedLedger {
  const raw = fs.read(rootLedgerPath(repoPath));
  if (raw === undefined || raw.trim().length === 0) {
    return { entries: [], violations: [] };
  }
  const entries = parseLedgerEntries(raw);
  const violations: string[] = [];
  for (const e of entries) {
    for (const v of validateLedgerEntry(e)) violations.push(`${e.id}: ${v}`);
  }
  return { entries, violations };
}

/**
 * Section 6 injection text (US-02 AC): "現サイクル + ルート台帳". The root ledger
 * (cross-cycle unresolved) is injected ALONGSIDE the current cycle's ledger so a
 * carried item from any past cycle stays in the headless AI's view. Returns
 * undefined when neither source has content (caller omits the section).
 */
export function resolveSection6(
  fs: Fs,
  repoPath: string,
  version: string,
): string | undefined {
  const rootRaw = fs.read(rootLedgerPath(repoPath));
  const currentRaw = fs.read(versionLedgerPath(repoPath, version));
  const parts: string[] = [];
  if (rootRaw !== undefined && rootRaw.trim().length > 0) {
    parts.push(`【ルート台帳 aidlc-docs/ledger.yml — 全サイクル横断の未解決】\n${rootRaw.trim()}`);
  }
  if (currentRaw !== undefined && currentRaw.trim().length > 0) {
    parts.push(`【現サイクル ledger.yml】\n${currentRaw.trim()}`);
  }
  if (parts.length === 0) return undefined;
  return parts.join("\n\n");
}

/**
 * Aggregate the still-unresolved (state=carried) entries from a set of
 * per-version ledgers into a root-ledger YAML body. Idempotent: an id seen in a
 * later source overrides an earlier one (latest state wins), so a carried item
 * that was later done/dropped drops out of the unresolved view.
 *
 * Input order matters: earliest cycle first, existing root LAST (so the root's
 * curated state/text overrides auto-aggregated duplicates).
 */
export function migrateToRootLedger(sources: readonly string[]): string {
  const byId = new Map<string, LedgerEntry>();
  for (const raw of sources) {
    for (const e of parseLedgerEntries(raw)) {
      byId.set(e.id, e); // later source overrides earlier (latest state wins)
    }
  }
  // The root ledger's purpose is the "current unresolved view": keep only carried.
  // done/dropped remain recorded in their per-version ledgers (history).
  const kept = [...byId.values()].filter((e) => e.state === "carried");
  return renderLedgerYaml(kept);
}

/**
 * Compare two vX.Y.Z version strings. Returns <0 / 0 / >0 (a before/equal/after b).
 * Non-conforming strings sort after conforming ones (defensive, deterministic).
 */
export function compareVersion(a: string, b: string): number {
  const parse = (v: string): [number, number, number] | null => {
    const m = v.match(/^v(\d+)\.(\d+)\.(\d+)$/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa === null && pb === null) return a < b ? -1 : a > b ? 1 : 0;
  if (pa === null) return 1;
  if (pb === null) return -1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  }
  return 0;
}

// ── Unit-03: reconcile check (S1 完了ゲート) ──────────────────────────────────

/**
 * Which of `candidateIds` are MENTIONED in `text` as a whole token. Used to turn
 * prior-cycle carried ledger ids into the `addressedIds` set the domain
 * (reconcileStatus) needs: an id is addressed when the current cycle references it
 * (in an S1 US `由来:` line, or in the current ledger as a re-carry/done/dropped —
 * which catches splits/renames like AUTO-ORCH-* via the origin text).
 *
 * Token boundary: the id must not be flanked by [\w-] so "S11-IMP1" does NOT match
 * inside "S11-IMP1-live-evidence-hard-gate" (the "D-1"→"D-10" hazard the domain
 * warns about, S7 D-01).
 */
export function extractMentionedIds(
  candidateIds: readonly string[],
  text: string,
): readonly string[] {
  return candidateIds.filter((id) => {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\w-])${esc}(?![\\w-])`).test(text);
  });
}

export interface ReconcileReport {
  readonly ok: boolean;
  /** carried-into-target entries not addressed by the current cycle. */
  readonly unreconciled: readonly LedgerEntry[];
  /** 2連続 carried (escalation) entries not addressed at all by the current cycle. */
  readonly escalationUnaddressed: readonly LedgerEntry[];
}

/**
 * The S1 completion gate (US-03 / kit/rules/ledger.md reconciliation rule):
 * a cycle may not finalize S1 while
 *   (a) a prior-cycle carried item targeting it is unaddressed, OR
 *   (b) a 2-consecutive-carried (escalation) item is not addressed at all.
 *
 * "Addressed" = the id is reflected in the current cycle (S1 US/D or the current
 * ledger as a re-carry/done/dropped). This is the lenient-but-explicit rule: a
 * documented forward decision counts, a SILENT loss does not (the P37 root cause).
 * The id-extraction (`由来` → ledger id) is the caller's responsibility (S7 D-01);
 * the domain compares by strict membership.
 *
 * @param allCycleEntries every per-version ledger's entries (cross-cycle, with
 *                        duplicates by id) — earliest cycle first (escalation count).
 * @param targetVersion   the cycle being started/finalized (e.g. "v0.0.6").
 * @param addressedIds    prior ids reflected anywhere in the current cycle.
 */
export function reconcileCycle(
  allCycleEntries: readonly LedgerEntry[],
  targetVersion: string,
  addressedIds: readonly string[],
): ReconcileReport {
  // Dedup carried-into-target by id for the reconcile check.
  const carriedIntoTarget = new Map<string, LedgerEntry>();
  for (const e of allCycleEntries) {
    if (e.state === "carried" && e.into === targetVersion) {
      carriedIntoTarget.set(e.id, e);
    }
  }
  const unreconciled = [...carriedIntoTarget.values()].filter(
    (e) => reconcileStatus(e, targetVersion, addressedIds) === "unreconciled",
  );

  // Escalation: an id carried in ≥2 cycles, still unresolved → must be addressed.
  const addressedSet = new Set(addressedIds);
  const escalationUnaddressed = detectEscalation(allCycleEntries).filter(
    (e) => !addressedSet.has(e.id),
  );

  return {
    ok: unreconciled.length === 0 && escalationUnaddressed.length === 0,
    unreconciled,
    escalationUnaddressed,
  };
}

/** Render entries back to the ledger YAML schema (closedIn → closed_in). */
export function renderLedgerYaml(entries: readonly LedgerEntry[]): string {
  const blocks = entries.map((e) => {
    const lines = [`- id: ${e.id}`];
    if (e.origin) lines.push(`  origin: ${e.origin}`);
    if (e.decision) lines.push(`  decision: ${JSON.stringify(e.decision)}`);
    lines.push(`  state: ${e.state}`);
    if (e.into) lines.push(`  into: ${e.into}`);
    if (e.reason) lines.push(`  reason: ${JSON.stringify(e.reason)}`);
    if (e.closedIn) lines.push(`  closed_in: ${e.closedIn}`);
    if (e.escalation) lines.push(`  escalation: ${JSON.stringify(e.escalation)}`);
    return lines.join("\n");
  });
  return blocks.join("\n\n") + (blocks.length > 0 ? "\n" : "");
}

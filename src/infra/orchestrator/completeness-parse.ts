// US-04 — parse a live evaluator's structured completeness verdict out of its
// free-text result, into the EXISTING domain CompletenessBlock so it rides the
// SAME app completeness gate the scripted path uses (no new event, no new gate /
// S4 D-01). The composer's evaluator prompt asks the model to end with a fenced
//   ```json { "requirements": [{ "key": "...", "text": "..." }], "addressed": [...] }```
// block. Parsing is total + defensive: any shape miss returns undefined (the live
// adapter then emits WITHOUT completeness = visual_review fallback, observably —
// never a silent wrong verdict).
import type { CompletenessBlock, Requirement } from "../../domain/review/brief";
import type { Text } from "../../domain/shared/primitives";

/** Fenced ```json ... ``` blocks, in document order. */
function fencedJsonBlocks(text: string): string[] {
  const out: string[] = [];
  const re = /```(?:json)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) out.push(m[1].trim());
  }
  return out;
}

function toRequirements(raw: unknown): readonly Requirement[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const reqs: Requirement[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return undefined;
    const r = item as Record<string, unknown>;
    if (typeof r["key"] !== "string" || r["key"].trim().length === 0) return undefined;
    if (typeof r["text"] !== "string") return undefined;
    reqs.push({ key: r["key"], text: r["text"] as Text });
  }
  return reqs;
}

function toAddressed(raw: unknown): readonly string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const keys: string[] = [];
  for (const k of raw) {
    if (typeof k !== "string") return undefined;
    keys.push(k);
  }
  return keys;
}

function asBlock(value: unknown): CompletenessBlock | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const o = value as Record<string, unknown>;
  const requirements = toRequirements(o["requirements"]);
  const addressed = toAddressed(o["addressed"]);
  if (requirements === undefined || addressed === undefined) return undefined;
  return { requirements, addressed };
}

/**
 * Extract a CompletenessBlock from an evaluator's result text. Prefers the LAST
 * fenced json block that parses to a valid block (the model's final verdict);
 * falls back to scanning the whole text for a bare `{...}` with the right shape.
 * Returns undefined when nothing valid is found.
 */
export function extractCompleteness(resultText: string): CompletenessBlock | undefined {
  const blocks = fencedJsonBlocks(resultText);
  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      const block = asBlock(JSON.parse(blocks[i]!));
      if (block) return block;
    } catch {
      // not JSON — try the next fenced block.
    }
  }
  // Fallback: a bare object somewhere in the text (model forgot the fence).
  const start = resultText.indexOf("{");
  const end = resultText.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return asBlock(JSON.parse(resultText.slice(start, end + 1)));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

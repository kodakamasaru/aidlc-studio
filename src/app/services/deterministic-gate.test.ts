// Deterministic gate (S5 Unit-03 §4 / D-01): AI-independent existence checks run
// BEFORE the evaluator. Two checks: (1) every BriefOut artifact path exists on
// disk (via injected Fs), (2) the Profile's required block types are all present
// in the emitted blocks (reusing domain coerceBlocks). Fail → evaluator is NOT
// launched. Pure + deterministic: no AI, FS injected.
import { describe, test, expect } from "bun:test";
import { runDeterministicGate } from "./deterministic-gate";
import { lookupProfile, emptyProfile } from "../../domain/review/profile";
import type { Fs } from "../ports/sys";

const fsWith = (present: readonly string[]): Fs => {
  const set = new Set(present);
  return { exists: (p) => set.has(p) };
};

describe("runDeterministicGate (AI-independent existence gate)", () => {
  test("ok when all artifact paths exist and required blocks present", () => {
    const profile = emptyProfile("feature"); // no required blocks
    const result = runDeterministicGate(
      profile,
      { artifacts: ["aidlc-docs/v0.0.2/s8.md"], blocks: [{ type: "summary" }] },
      fsWith(["aidlc-docs/v0.0.2/s8.md"]),
    );
    expect(result.ok).toBe(true);
  });

  test("fails with missingPaths when an artifact path is absent on disk", () => {
    const result = runDeterministicGate(
      emptyProfile("feature"),
      { artifacts: ["present.md", "gone.md"], blocks: [] },
      fsWith(["present.md"]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingPaths).toEqual(["gone.md"]);
      expect(result.missingBlocks).toEqual([]);
    }
  });

  test("fails with missingBlocks when a Profile-required block type is absent", () => {
    // bugfix profile requires summary/risk/diff/screenshot/test/video.
    const profile = lookupProfile("bugfix");
    const result = runDeterministicGate(
      profile,
      { artifacts: [], blocks: [{ type: "summary" }, { type: "diff" }] },
      fsWith([]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingPaths).toEqual([]);
      expect(result.missingBlocks).toContain("risk");
      expect(result.missingBlocks).toContain("video");
      expect(result.missingBlocks).not.toContain("summary");
    }
  });

  test("unknown block types are ignored (forward-compat), not failures by themselves", () => {
    const result = runDeterministicGate(
      emptyProfile("feature"),
      { artifacts: [], blocks: [{ type: "future-block" }] },
      fsWith([]),
    );
    expect(result.ok).toBe(true);
  });

  test("reports BOTH missing paths and missing blocks together", () => {
    const profile = lookupProfile("bugfix");
    const result = runDeterministicGate(
      profile,
      { artifacts: ["x.md"], blocks: [] },
      fsWith([]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingPaths).toEqual(["x.md"]);
      expect(result.missingBlocks.length).toBeGreaterThan(0);
    }
  });
});

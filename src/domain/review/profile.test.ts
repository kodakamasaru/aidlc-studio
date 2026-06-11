import { test, expect, describe } from "bun:test";
import {
  type Profile,
  lookupProfile,
  emptyProfile,
  coerceBlocks,
  isComplete,
} from "./profile";

describe("lookupProfile / bugfix dossier (US-05)", () => {
  test("bugfix profile requires the dossier block types (no new block types added)", () => {
    const p = lookupProfile("bugfix");
    expect(p.taskKind).toBe("bugfix");
    // 既存 ReviewBlockType の部分集合のみ(新型は足さない / S5 Unit-01 D-02)
    expect([...p.requiredBlocks].map((b) => b as string).sort()).toEqual(
      ["diff", "risk", "screenshot", "summary", "test", "video"].sort(),
    );
  });

  test("unknown taskKind falls back to a loose empty profile", () => {
    const p = lookupProfile("free-form-kind");
    expect(p.requiredBlocks).toEqual([]);
    expect(emptyProfile("x").requiredBlocks).toEqual([]);
  });
});

describe("coerceBlocks(profile, raw) — forward compatible (S6 D-02: throw しない)", () => {
  const profile: Profile = {
    taskKind: "bugfix",
    requiredBlocks: ["summary", "screenshot", "video"],
  };

  test("drops unknown block types AND reports missing required types", () => {
    const raw = [
      { type: "summary", title: "fix", body: "..." },
      { type: "future-3d-scene", payload: 1 }, // 未知 → 捨てる
      { type: "screenshot", src: "a.png", caption: "after" },
    ];
    const { kept, missing } = coerceBlocks(profile, raw);
    expect(kept.map((b) => b.type)).toEqual(["summary", "screenshot"]);
    expect(missing).toEqual(["video"]); // 必須だが不在
    expect(isComplete({ kept, missing })).toBe(false);
  });

  test("all required present → missing empty → complete", () => {
    const raw = [
      { type: "summary", title: "x", body: "y" },
      { type: "screenshot", src: "a.png", caption: "c" },
      { type: "video", src: "v.mp4", poster: "p.png" },
    ];
    const result = coerceBlocks(profile, raw);
    expect(result.missing).toEqual([]);
    expect(isComplete(result)).toBe(true);
  });

  test("loose profile (no required) is always complete even for empty blocks", () => {
    const result = coerceBlocks(emptyProfile("misc"), []);
    expect(result.kept).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(isComplete(result)).toBe(true);
  });

  test("adding a required block type does not break an old artifact (returns missing, not throw)", () => {
    // 古い成果物(summary のみ)に対し video を必須化しても壊れず missing を返す
    const evolved: Profile = { taskKind: "bugfix", requiredBlocks: ["summary", "video"] };
    const old = [{ type: "summary", title: "x", body: "y" }];
    expect(() => coerceBlocks(evolved, old)).not.toThrow();
    expect(coerceBlocks(evolved, old).missing).toEqual(["video"]);
  });
});

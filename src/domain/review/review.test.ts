import { test, expect, describe } from "bun:test";
import { unwrap } from "../shared/result";
import { instant } from "../shared/primitives";
import { Step } from "../shared/vocab";
import { CycleId, RunId, TaskId } from "../shared/ids";
import {
  type ReviewBlock,
  buildReview,
  isTaskScoped,
  isKnownBlockType,
  filterKnownBlocks,
  MVP_BLOCK_TYPES,
} from "./review";

const producedAt = unwrap(instant("2026-06-06T08:00:00Z"));

const blocks: ReviewBlock[] = [
  { type: "summary", title: "S6 done", body: "pure domain code" },
  { type: "ac-map", items: [{ ac: "AC-1", status: "met" }] },
];

describe("buildReview (INV-1 / INV-6)", () => {
  test("task-scoped review carries its taskId", () => {
    const r = buildReview({
      runId: RunId("r1"),
      cycleId: CycleId("c1"),
      step: Step("S6"),
      taskId: TaskId("t1"),
      blocks,
      producedAt,
    });
    expect(isTaskScoped(r)).toBe(true);
    expect(r.taskId as string).toBe("t1");
    expect(r.blocks).toHaveLength(2);
  });

  test("architecture review (no taskId) is cycle-scoped (taskId null)", () => {
    const r = buildReview({
      runId: RunId("r1"),
      cycleId: CycleId("c1"),
      step: Step("S5"),
      blocks,
      producedAt,
    });
    expect(r.taskId).toBeNull();
    expect(isTaskScoped(r)).toBe(false);
  });
});

describe("MVP block types", () => {
  test("the four MVP-rendered block types are summary/ac-map/mermaid/screenshot", () => {
    expect([...MVP_BLOCK_TYPES].sort()).toEqual([
      "ac-map",
      "mermaid",
      "screenshot",
      "summary",
    ]);
  });
});

describe("filterKnownBlocks (INV-2: forward compatible, unknown skipped not errored)", () => {
  test("keeps known blocks and separates unknown types", () => {
    const raw = [
      { type: "summary", title: "x", body: "y" },
      { type: "future-3d-scene", payload: 123 },
      { type: "mermaid", src: "graph TD" },
    ];
    const { blocks: kept, skipped } = filterKnownBlocks(raw);
    expect(kept.map((b) => b.type)).toEqual(["summary", "mermaid"]);
    expect(skipped).toEqual(["future-3d-scene"]);
  });

  test("isKnownBlockType recognizes reserved (v0.0.x) types too", () => {
    expect(isKnownBlockType("video")).toBe(true);
    expect(isKnownBlockType("diff")).toBe(true);
    expect(isKnownBlockType("nope")).toBe(false);
  });
});

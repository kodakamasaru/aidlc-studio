import { test, expect, describe } from "bun:test";
import { RunId, TaskId } from "../shared/ids";
import { type DomainEvent, MVP_EVENT_TYPES, isMvpEvent } from "./events";

describe("domain event contract", () => {
  test("MVP minimal contract is exactly the 3 critical-path events", () => {
    expect([...MVP_EVENT_TYPES].sort()).toEqual([
      "QuestionRaised",
      "ResultEmitted",
      "RunStateChanged",
    ]);
  });

  test("isMvpEvent classifies the critical 3 vs the v0.0.x events", () => {
    const runStateChanged: DomainEvent = {
      type: "RunStateChanged",
      runId: RunId("r1"),
      to: "done",
    };
    const resultEmitted: DomainEvent = {
      type: "ResultEmitted",
      runId: RunId("r1"),
      taskId: TaskId("t1"),
      blocks: [{ type: "summary", title: "x", body: "y" }],
    };
    const wikiUpdated: DomainEvent = {
      type: "WikiUpdated",
      runId: RunId("r1"),
      section: "facts",
    };
    expect(isMvpEvent(runStateChanged)).toBe(true);
    expect(isMvpEvent(resultEmitted)).toBe(true);
    expect(isMvpEvent(wikiUpdated)).toBe(false);
  });
});

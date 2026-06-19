// F-14: stepsGuidance — どの案内/導線を出すかを cycle 状態 + 組み直し提案有無から導く純関数。
// 旧 CycleStepsPage は「始める前にだけ調整できる」と実態(要件確定後に組み直し提案)と真逆を
// 表示していた。この3分岐を決定論的に固定し、回帰を防ぐ。
import { test, expect, describe } from "bun:test";
import { stepsGuidance } from "./cycle-state";
import type { Cycle, Phase } from "./api";

const phase = (step: string, state: Phase["state"]): Phase =>
  ({ step, state } as unknown as Phase);

const cycle = (phases: Phase[]): Cycle => ({ phases } as unknown as Cycle);

describe("stepsGuidance (F-14)", () => {
  test("要件(S1)未確定 → pre-requirements(既定で動く・確定後に提案)", () => {
    const c = cycle([phase("S1", "pending"), phase("S2", "pending")]);
    expect(stepsGuidance(c, false)).toBe("pre-requirements");
  });

  test("S1 実行中でも未 done なら pre-requirements", () => {
    const c = cycle([phase("S1", "running"), phase("S2", "pending")]);
    expect(stepsGuidance(c, false)).toBe("pre-requirements");
  });

  test("組み直し提案が存在 → reconstruction-available(本来の調整点へ導く)", () => {
    const c = cycle([phase("S1", "done"), phase("S2", "pending")]);
    expect(stepsGuidance(c, true)).toBe("reconstruction-available");
  });

  test("提案は S1 未確定でも存在すれば優先(導線を最優先で出す)", () => {
    const c = cycle([phase("S1", "running")]);
    expect(stepsGuidance(c, true)).toBe("reconstruction-available");
  });

  test("S1 確定済み・提案なし・進行中 → locked-running(構成変更不可)", () => {
    const c = cycle([phase("S1", "done"), phase("S2", "running")]);
    expect(stepsGuidance(c, false)).toBe("locked-running");
  });

  test("旧バグの逆: S1 確定後は『始める前にだけ調整』ではない(pre-requirements を返さない)", () => {
    const c = cycle([phase("S1", "done"), phase("S2", "pending")]);
    expect(stepsGuidance(c, false)).not.toBe("pre-requirements");
  });
});

// prompt-composer — operating-model 注入のパリティ検証。
//
// 不変条件(両 compose 経路で operating-model が headless prompt に届く):
//   1. legacy compose(generator): 運用モデル全文が prompt に入り、責務契約の直後に来る。
//   2. legacy compose(evaluator): 同上(評価者経路でも届く)。
//   3. structured composeWithStructuredContext(generator): 主経路でも届き、契約の直後。
//   4. operating-model 不在 → 可視マーカー(原則④)。silent fallback しない。
//
// なぜ: aidlc-operating-model.md は従来 0 参照の孤児で、固めた運用ゲート(mock 突合 / S3↔S7
// 境界 / Rule A・B / 視覚証拠ゲート)が headless worker に一切届いていなかった。
import { describe, test, expect } from "bun:test";
import {
  PromptComposer,
  skillBodyPath,
  briefBodyPath,
  responsibilityContractPath,
  operatingModelPath,
} from "./prompt-composer";
import { composeStructuredContext, type StructuredContextInput } from "./context-resolver";
import { Step, skillRefOf } from "../../domain/shared/vocab";
import type { Cycle, Phase } from "../../domain/cycle/cycle";
import { FakeFs } from "../../infra/sys/fakes";
import type { CycleId, PhaseId, ProjectId } from "../../domain/shared/ids";

const REPO = "/repo";
const CONTRACT_MARK = "CONTRACT-BODY-XYZ";
const OPMODEL_MARK = "OPMODEL-BODY-XYZ";
const SKILL_MARK = "SKILL-BODY-XYZ";

/** Fs pinned with the 3 canonical sources for step S1. */
function fsWith(opts?: { omitOperatingModel?: boolean }): FakeFs {
  const skillRef = skillRefOf(Step("S1"))!;
  const contents: Record<string, string> = {
    [skillBodyPath(REPO, skillRef)]: `# S1 本文\n${SKILL_MARK}`,
    [responsibilityContractPath(REPO)]: `# 責務契約\n${CONTRACT_MARK}`,
    [briefBodyPath(REPO)]: "# brief\nプロダクト不変",
  };
  if (opts?.omitOperatingModel !== true) {
    contents[operatingModelPath(REPO)] = `# 運用モデル\n${OPMODEL_MARK}`;
  }
  return new FakeFs(undefined, contents);
}

function makeCycle(): Cycle {
  const phase: Phase = {
    id: "ph-S1" as PhaseId,
    step: Step("S1"),
    order: 0,
    state: "running",
    runs: [],
  };
  return {
    id: "cyc-1" as CycleId,
    projectId: "proj-1" as ProjectId,
    version: "v0.0.4" as never,
    title: "テスト" as never,
    taskIds: [],
    state: "active",
    createdAt: "2026-01-01T00:00:00Z" as never,
    phases: [phase],
  };
}

describe("PromptComposer — operating-model injection (headless parity)", () => {
  test("legacy compose(generator): 運用モデル全文が契約の直後に注入される", () => {
    const composer = new PromptComposer(fsWith());
    const prompt = composer.compose({ role: "generator", step: Step("S1"), repoPath: REPO });

    expect(prompt).toContain(OPMODEL_MARK);
    expect(prompt).toContain("運用モデル — AI-DLC v2 実行規範");
    // 順序: 責務契約 → 運用モデル → スキル本文
    expect(prompt.indexOf(CONTRACT_MARK)).toBeLessThan(prompt.indexOf(OPMODEL_MARK));
    expect(prompt.indexOf(OPMODEL_MARK)).toBeLessThan(prompt.indexOf(SKILL_MARK));
  });

  test("legacy compose(evaluator): 評価者経路でも運用モデルが届く", () => {
    const composer = new PromptComposer(fsWith());
    const prompt = composer.compose({ role: "evaluator", step: Step("S1"), repoPath: REPO });

    expect(prompt).toContain(OPMODEL_MARK);
    expect(prompt.indexOf(CONTRACT_MARK)).toBeLessThan(prompt.indexOf(OPMODEL_MARK));
  });

  test("structured composeWithStructuredContext(generator): 主経路でも届き契約の直後", () => {
    const fs = fsWith();
    const composer = new PromptComposer(fs);
    const input: StructuredContextInput = { cycle: makeCycle(), step: Step("S1"), repoPath: REPO };
    const ctx = composeStructuredContext(input, { fs });
    const prompt = composer.composeWithStructuredContext(
      { role: "generator", step: Step("S1"), repoPath: REPO },
      ctx,
    );

    expect(prompt).toContain(OPMODEL_MARK);
    expect(prompt.indexOf(CONTRACT_MARK)).toBeLessThan(prompt.indexOf(OPMODEL_MARK));
    expect(prompt.indexOf(OPMODEL_MARK)).toBeLessThan(prompt.indexOf(SKILL_MARK));
  });

  test("composeReconstruction(feedback): 再提案フィードバックがプロンプトに注入される (US-08 会話で修正)", () => {
    const composer = new PromptComposer(fsWith());
    const plain = composer.composeReconstruction(REPO);
    const revised = composer.composeReconstruction(REPO, "タイトルを mock に変えて");
    // 初回(feedback なし)は修正指示セクションを出さない。
    expect(plain).not.toContain("人間からの修正指示");
    // 再提案(feedback あり)はフィードバック全文を最優先セクションとして注入する。
    expect(revised).toContain("人間からの修正指示");
    expect(revised).toContain("タイトルを mock に変えて");
  });

  test("運用モデル不在 → 可視マーカー(silent fallback しない / 原則④)", () => {
    const composer = new PromptComposer(fsWith({ omitOperatingModel: true }));
    const prompt = composer.compose({ role: "generator", step: Step("S1"), repoPath: REPO });

    expect(prompt).not.toContain(OPMODEL_MARK);
    expect(prompt).toContain("運用モデルが見つかりません");
  });
});

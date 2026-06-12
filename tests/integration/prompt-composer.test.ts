// US-03 PromptComposer — deterministic checks that the composed prompt carries the
// 3 canonical sources (skill 本文 + step identity + verification observations) and
// fails LOUDLY on a missing 本文 (no silent fallback / 原則④). The real-AI path is
// the additive live test; this pins the composition shape with a FakeFs fixture.
import { test, expect, describe } from "bun:test";
import { FakeFs } from "../../src/infra/sys/fakes";
import {
  PromptComposer,
  PromptComposerError,
  skillBodyPath,
} from "../../src/app/services/prompt-composer";
import { Step, skillRefOf } from "../../src/domain/shared/vocab";
import type { Text } from "../../src/domain/shared/primitives";

const REPO = "/repo";
const S1_BODY = "# AI-DLC S1: 要件\n\nあなたは要件ヒアリング担当。完了条件: US が展開済み。";

function composerWithS1(): PromptComposer {
  const path = skillBodyPath(REPO, skillRefOf(Step("S1"))!);
  return new PromptComposer(new FakeFs(undefined, { [path]: S1_BODY }));
}

describe("PromptComposer (US-03)", () => {
  test("generator prompt embeds skill 本文 + step identity (real dir skillRef)", () => {
    const out = composerWithS1().compose({ role: "generator", step: Step("S1"), repoPath: REPO });
    expect(out).toContain("aidlc-s1-requirements"); // real dir skillRef (not aidlc-S1)
    expect(out).toContain("S1");
    expect(out).toContain("生成者");
    expect(out).toContain(S1_BODY.trim()); // 本文 included verbatim
  });

  test("evaluator prompt embeds verification observations + addressed/gap instruction", () => {
    const verification = ["一覧が表示される", "空状態が出る"] as unknown as Text[];
    const out = composerWithS1().compose({
      role: "evaluator",
      step: Step("S1"),
      repoPath: REPO,
      verification,
    });
    expect(out).toContain("評価者");
    expect(out).toContain("一覧が表示される");
    expect(out).toContain("空状態が出る");
    expect(out).toContain("addressed");
    expect(out).toContain("gap");
  });

  test("throws PromptComposerError when the skill 本文 is missing (loud, no fallback)", () => {
    const composer = new PromptComposer(new FakeFs()); // FakeFs.read → undefined
    expect(() =>
      composer.compose({ role: "generator", step: Step("S1"), repoPath: REPO }),
    ).toThrow(PromptComposerError);
  });

  test("throws for a step with no canonical skillRef (e.g. retired S2.5)", () => {
    const composer = composerWithS1();
    expect(() =>
      composer.compose({ role: "generator", step: Step("S2.5"), repoPath: REPO }),
    ).toThrow(PromptComposerError);
  });

  test("skillBodyPath points at kit/skills/{skillRef}/SKILL.md under the repo", () => {
    expect(skillBodyPath(REPO, skillRefOf(Step("S6"))!)).toBe(
      "/repo/kit/skills/aidlc-s6-domain-model/SKILL.md",
    );
  });
});

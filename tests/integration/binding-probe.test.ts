// US-05 / Unit-05 — binding-rule reach probe.
// Verifies the mechanism that a kit/rules/*.md body actually reaches the headless
// prompt (not merely link-referenced). Run against the REAL repo (the canonical
// binding rules MUST reach) plus synthetic FakeFs cases for the pure matcher.
import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { nodeFs } from "../../src/infra/sys/fs";
import { FakeFs } from "../../src/infra/sys/fakes";
import {
  findRuleInPrompt,
  probeRuleReach,
  composeProbePrompt,
} from "../../src/app/services/binding-probe";
import {
  skillBodyPath,
  responsibilityContractPath,
  operatingModelPath,
  briefBodyPath,
} from "../../src/app/services/prompt-composer";
import { Step, skillRefOf } from "../../src/domain/shared/vocab";

const REPO_ROOT = join(import.meta.dir, "..", "..");

describe("findRuleInPrompt (pure matcher)", () => {
  test("present rule body → reached + injectionPoint = preceding header", () => {
    const prompt = ["── 最上位契約 ──", "契約の本文 ABC", "── 本文 ──", "skill"].join("\n");
    const r = findRuleInPrompt(prompt, "契約の本文 ABC");
    expect(r.reached).toBe(true);
    expect(r.injectionPoint).toBe("最上位契約");
  });

  test("absent rule body → reached:false", () => {
    expect(findRuleInPrompt("nothing here", "MISSING-BODY").reached).toBe(false);
  });

  test("empty body → reached:false", () => {
    expect(findRuleInPrompt("anything", "   ").reached).toBe(false);
  });
});

describe("probeRuleReach (synthetic composer)", () => {
  const REPO = "/repo";
  const fsWith = (extra: Record<string, string> = {}) => {
    const skillRef = skillRefOf(Step("S1"))!;
    return new FakeFs(undefined, {
      [skillBodyPath(REPO, skillRef)]: "# S1\nSKILL-BODY",
      [responsibilityContractPath(REPO)]: "# 責務契約\nCONTRACT-DISTINCTIVE-BODY-12345",
      [operatingModelPath(REPO)]: "# 運用モデル\nOPMODEL-DISTINCTIVE-BODY-67890",
      [briefBodyPath(REPO)]: "# brief\n不変",
      ...extra,
    });
  };

  test("responsibility contract reaches the prompt", () => {
    const r = probeRuleReach(fsWith(), REPO, responsibilityContractPath(REPO));
    expect(r.reached).toBe(true);
    expect(r.injectionPoint).toContain("最上位契約");
  });

  test("operating model reaches the prompt", () => {
    const r = probeRuleReach(fsWith(), REPO, operatingModelPath(REPO));
    expect(r.reached).toBe(true);
    expect(r.injectionPoint).toContain("運用モデル");
  });

  test("a rule that is NOT injected (link-only) → reached:false", () => {
    // ledger.md exists on disk but the composer does not inject its body — only a
    // link/path is referenced. The probe must catch this (US-05 D-01).
    const linkOnly = "/repo/kit/rules/ledger.md";
    const r = probeRuleReach(
      fsWith({ [linkOnly]: "# 引き継ぎ台帳\nLEDGER-RULE-BODY-not-injected" }),
      REPO,
      linkOnly,
    );
    expect(r.reached).toBe(false);
  });

  test("missing rule file → reached:false", () => {
    expect(probeRuleReach(fsWith(), REPO, "/repo/kit/rules/nope.md").reached).toBe(false);
  });
});

describe("real repo: canonical binding rules MUST reach the headless prompt", () => {
  test("responsibility-contract.md reaches", () => {
    const r = probeRuleReach(
      nodeFs,
      REPO_ROOT,
      join(REPO_ROOT, "kit/rules/responsibility-contract.md"),
    );
    expect(r.reached).toBe(true);
  });

  test("aidlc-operating-model.md reaches", () => {
    const r = probeRuleReach(
      nodeFs,
      REPO_ROOT,
      join(REPO_ROOT, "kit/rules/aidlc-operating-model.md"),
    );
    expect(r.reached).toBe(true);
  });

  test("the composed S1 prompt is non-trivial (skill body present)", () => {
    const prompt = composeProbePrompt(nodeFs, REPO_ROOT);
    expect(prompt.length).toBeGreaterThan(500);
  });
});

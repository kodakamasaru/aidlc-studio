// US-04 / Unit-04 — evidence manifest writer. The manifest it writes must be
// readable by the Unit-01 gate (FsEvidenceGate) as eligible — that round-trip is
// the contract that closes the live-evidence loop. Also pins the D-03 invariant:
// capturedAt is normalized to UTC `Z` (so a +09:00 capture still compares
// correctly against a UTC runStartedAt).
import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import {
  buildEvidenceManifest,
  writeEvidenceManifest,
  toUtcInstant,
} from "../../src/infra/evidence/evidence-manifest";
import { FsEvidenceGate } from "../../src/infra/evidence/fs-evidence-gate";
import { nodeFs } from "../../src/infra/sys/fs";
import { instant } from "../../src/domain/shared/primitives";
import { unwrap } from "../../src/domain/shared/result";

const NOW = unwrap(instant("2026-06-20T00:00:00.000Z"));

describe("toUtcInstant (D-03 normalization)", () => {
  test("a +09:00 offset is converted to the equivalent UTC Z", () => {
    expect(toUtcInstant("2026-06-20T09:00:00+09:00") as string).toBe(
      "2026-06-20T00:00:00.000Z",
    );
  });
  test("throws on an unparseable date", () => {
    expect(() => toUtcInstant("not-a-date")).toThrow();
  });
});

describe("buildEvidenceManifest (pure)", () => {
  test("defaults capturedAt to now and normalizes provided times to UTC", () => {
    const m = buildEvidenceManifest(
      "S8",
      [
        { kind: "log", path: "_evidence/S8/run.log" },
        { kind: "screenshot", path: "_evidence/S8/shot.png", capturedAt: "2026-06-20T09:00:00+09:00" },
      ],
      NOW,
    );
    expect(m.step).toBe("S8");
    expect(m.forms[0]!.capturedAt).toBe(NOW); // defaulted
    expect(m.forms[1]!.capturedAt as string).toBe("2026-06-20T00:00:00.000Z"); // normalized
  });
});

describe("writeEvidenceManifest → FsEvidenceGate round-trip", () => {
  test("written manifest is read back as eligible by the Unit-01 gate", () => {
    const repo = fs.mkdtempSync(join(os.tmpdir(), "aidlc-ev-"));
    try {
      const path = writeEvidenceManifest(
        repo,
        "v0.0.5",
        "S8",
        [
          { kind: "log", path: "_evidence/S8/run.log" },
          { kind: "screenshot", path: "_evidence/S8/shot.png" },
        ],
        NOW,
      );
      expect(fs.existsSync(path)).toBe(true);

      // The gate, started BEFORE the evidence, sees fresh + complete → eligible.
      const runStartedAt = unwrap(instant("2026-06-19T00:00:00.000Z"));
      const gate = new FsEvidenceGate(nodeFs);
      const result = gate.check({ repoPath: repo, version: "v0.0.5", step: "S8", runStartedAt });
      expect(result).toEqual({ eligibility: "eligible", missing: [] });
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test("log-only manifest is read back as blocked (missing visual/operational)", () => {
    const repo = fs.mkdtempSync(join(os.tmpdir(), "aidlc-ev-"));
    try {
      writeEvidenceManifest(repo, "v0.0.5", "S8", [{ kind: "log", path: "_evidence/S8/run.log" }], NOW);
      const runStartedAt = unwrap(instant("2026-06-19T00:00:00.000Z"));
      const result = new FsEvidenceGate(nodeFs).check({
        repoPath: repo,
        version: "v0.0.5",
        step: "S8",
        runStartedAt,
      });
      expect(result.eligibility).toBe("blocked");
      expect(result.missing).toContain("visual-or-operational");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

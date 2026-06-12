import { test, expect, describe } from "bun:test";
import { unwrap } from "../shared/result";
import {
  docPath,
  regenerateWikiBody,
  extractHumanBlocks,
} from "./external-memory";

describe("docPath (INV-2: path-traversal safety)", () => {
  test("accepts a path inside aidlc-docs and normalizes it", () => {
    expect(unwrap(docPath("aidlc-docs/s5/index.md")) as string).toBe("aidlc-docs/s5/index.md");
    expect(unwrap(docPath("a/./b/c.md")) as string).toBe("a/b/c.md");
    expect(unwrap(docPath("a/b/../c.md")) as string).toBe("a/c.md");
  });

  test("rejects absolute paths, NUL, and root escapes", () => {
    expect(docPath("/etc/passwd")).toEqual({ ok: false, error: "PathOutsideDocs" });
    expect(docPath("../secret")).toEqual({ ok: false, error: "PathOutsideDocs" });
    expect(docPath("a/../../escape")).toEqual({ ok: false, error: "PathOutsideDocs" });
    expect(docPath("a/\0/b")).toEqual({ ok: false, error: "PathOutsideDocs" });
    expect(docPath("")).toEqual({ ok: false, error: "PathOutsideDocs" });
  });
});

describe("regenerateWikiBody (INV-5: human edits preserved)", () => {
  test("keeps human-marked blocks across AI regeneration", () => {
    const oldBody = "AI text v1\n<!-- human -->keep this<!-- /human -->";
    const merged = regenerateWikiBody(oldBody, "AI text v2");
    expect(merged).toContain("AI text v2");
    expect(merged).toContain("<!-- human -->keep this<!-- /human -->");
    expect(extractHumanBlocks(merged)).toHaveLength(1);
  });

  test("does not duplicate a human block already present in the new body", () => {
    const block = "<!-- human -->note<!-- /human -->";
    const merged = regenerateWikiBody(`old ${block}`, `new ${block}`);
    expect(extractHumanBlocks(merged)).toHaveLength(1);
  });
});

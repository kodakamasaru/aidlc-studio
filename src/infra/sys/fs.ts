// NodeFs — the production Fs port (S5 Unit-03 §4). Wraps node:fs existsSync so
// the Deterministic gate can check that a generator's artifact paths actually
// exist on disk. The gate passes whatever paths the BriefOut carries, so path
// resolution policy stays at the call site.
import { existsSync, readFileSync } from "node:fs";
import type { Fs } from "../../app/ports/sys";

export const nodeFs: Fs = {
  exists(path: string): boolean {
    return existsSync(path);
  },
  // US-03: read file content for the PromptComposer. Returns undefined on any
  // read error (missing / permission / not a file) so the caller decides policy
  // (the composer turns undefined into an explicit, loud error — no silent miss).
  read(path: string): string | undefined {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  },
};

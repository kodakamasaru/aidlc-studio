// NodeFs — the production Fs port (S5 Unit-03 §4). Wraps node:fs existsSync so
// the Deterministic gate can check that a generator's artifact paths actually
// exist on disk. The gate passes whatever paths the BriefOut carries, so path
// resolution policy stays at the call site.
import { existsSync } from "node:fs";
import type { Fs } from "../../app/ports/sys";

export const nodeFs: Fs = {
  exists(path: string): boolean {
    return existsSync(path);
  },
};

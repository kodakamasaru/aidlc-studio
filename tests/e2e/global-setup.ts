// globalSetup — runs once before the whole E2E run.
//   1. Build the SPA into web/dist if it's missing, so the Hono server has
//      something to serve same-origin (the webServer commands assume it exists).
//   2. Ensure the S7 screenshot output dir exists so specs can write into it.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // tests/e2e
const repoRoot = join(here, "..", "..");

export default function globalSetup(): void {
  const distIndex = join(repoRoot, "web", "dist", "index.html");
  if (!existsSync(distIndex)) {
    // Build the SPA the same way the project does (Vite via bunx).
    execSync("bunx vite build", {
      cwd: join(repoRoot, "web"),
      stdio: "inherit",
    });
  }

  const shotsDir = join(repoRoot, "aidlc-docs", "s7", "screenshots");
  mkdirSync(shotsDir, { recursive: true });
}

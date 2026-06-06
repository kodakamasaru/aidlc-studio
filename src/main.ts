// Bun run entry. Kept separate from server.ts so importing buildServer (tests,
// tooling) never starts a listener: `bun run src/main.ts` builds the server and
// exports the Bun serve object; importing server.ts does not.
import { buildServer } from "./server";

const DEFAULT_PORT = 8787;

/** Resolve PORT: default when unset, else a valid 1..65535 integer or throw. */
function resolvePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim().length === 0) return DEFAULT_PORT;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${raw}": expected an integer in 1..65535`);
  }
  return port;
}

const { app } = buildServer();

export default {
  port: resolvePort(process.env.PORT),
  // v0 is local-only single-user; auth is deferred to the v1.0.0 publishing axis.
  hostname: "127.0.0.1",
  fetch: app.fetch,
};

// verify:test — launch the studio against an ISOLATED sandbox repo + DB so live
// harness testing never pollutes the studio's own aidlc-docs/ or its real DB.
//
// Why this exists: there is no UI yet to pick a project's target repo (F-3), and
// the web is hard-wired to projects[0]. So `verify:watch` always points live runs
// at whatever projects[0] is — in practice the studio repo itself, which then
// accumulates real S1 output + stale inbox cards (dogfood pollution). This launcher
// sidesteps that with a SEPARATE DB whose only project points at a throwaway repo,
// so the web's projects[0] is automatically that sandbox. No UI change needed.
//
// Reset to a clean sandbox any time: delete /tmp/aidlc-sandbox and /tmp/aidlc-sandbox.db*.
import { existsSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd(); // studio repo root (run via `bun run` from there)
const SANDBOX = "/tmp/aidlc-sandbox";
const DB = "/tmp/aidlc-sandbox.db";
const PORT = "8787"; // same port as verify:watch (mutually exclusive — kills it first)
const BASE = `http://127.0.0.1:${PORT}`;

// 1. Seed the throwaway repo (kit + brief) once. Persisted so you can iterate; the
//    S1 generator reads the brief — edit it to test different requirements.
if (!existsSync(SANDBOX)) {
  mkdirSync(join(SANDBOX, "aidlc-docs"), { recursive: true });
  cpSync(join(ROOT, "kit"), join(SANDBOX, "kit"), { recursive: true });
  writeFileSync(
    join(SANDBOX, "aidlc-docs", "aidlc-brief.md"),
    "# brief — サンプル新規アプリ(編集可)\n\n" +
      "ここに作りたいものを書いてください。例:\n" +
      "社員が翌日のオフィスランチを前日までに予約する新規 web アプリ。" +
      "メニュー閲覧 / 注文 / 締切前キャンセル / 管理者が当日の注文一覧を見る。" +
      "決済・通知・認証は初回スコープ外。\n",
  );
  Bun.spawnSync(["git", "init", "-q"], { cwd: SANDBOX });
  Bun.spawnSync(["git", "add", "-A"], { cwd: SANDBOX });
  Bun.spawnSync(["git", "commit", "-qm", "seed sandbox"], { cwd: SANDBOX });
  console.log(`[verify:test] サンドボックス repo を作成: ${SANDBOX}`);
}

// 2. Free the port (mutually exclusive with verify:watch).
Bun.spawnSync(["sh", "-c", `lsof -ti:${PORT} | xargs -I{} kill {} 2>/dev/null`]);

// 3. Start the backend against the ISOLATED DB (live orchestrator).
const backend = Bun.spawn(["bun", "--watch", "run", "src/main.ts"], {
  cwd: ROOT,
  env: { ...process.env, AIDLC_ORCHESTRATOR: "live", AIDLC_DB: DB, PORT },
  stdout: "inherit",
  stderr: "inherit",
});

// 4. Wait for health, then ensure exactly one project — pointing at the sandbox.
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${BASE}/api/health`)).ok) break;
  } catch {
    /* not up yet */
  }
  await Bun.sleep(500);
}
const projs = await fetch(`${BASE}/api/projects`)
  .then((r) => r.json())
  .catch(() => ({ data: [] }));
if (!projs.data?.length) {
  const r = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repoPath: SANDBOX }),
  });
  console.log(`[verify:test] サンドボックス project を作成 (repoPath=${SANDBOX}) → ${r.status}`);
} else {
  console.log(`[verify:test] 既存のサンドボックス project を使用 (${projs.data.length} 件)`);
}

// 5. Start the web (vite proxies /api → this backend on ${PORT}).
const web = Bun.spawn(["bun", "run", "dev"], {
  cwd: join(ROOT, "web"),
  env: { ...process.env },
  stdout: "inherit",
  stderr: "inherit",
});

console.log(
  `\n[verify:test] 起動完了 — studio リポは汚れません。\n` +
    `  対象リポ : ${SANDBOX}  (ここに S1 成果物が書かれる)\n` +
    `  隔離 DB  : ${DB}\n` +
    `  web      : http://localhost:5173 (通常)\n` +
    `  リセット : ${SANDBOX} と ${DB}* を削除して再実行\n`,
);

// 6. Tear both down on Ctrl+C / when either exits.
const stop = () => {
  backend.kill();
  web.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race([backend.exited, web.exited]);
stop();

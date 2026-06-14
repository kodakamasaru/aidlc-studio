// One-off: remove the legacy (pre step-model-v2, S2.5) project + its scoped rows
// from the local dev DB so the web (projects[0]) shows the canonical 12-step
// project. Backup taken first (aidlc-studio.db.bak-manual). Canonical project
// e21d83fd… is preserved. Run: bun run scripts/cleanup-legacy-project.ts
import { Database } from "bun:sqlite";

const LEGACY = "c9c4538d-2c6a-47b3-b4a9-67802f0d459a";
const db = new Database("aidlc-studio.db");

db.exec("BEGIN");
try {
  const cycleIds = db
    .query<{ id: string }, [string]>("select id from cycles where projectId=?")
    .all(LEGACY)
    .map((r) => r.id);
  const ph = cycleIds.map(() => "?").join(",");
  if (cycleIds.length) {
    for (const t of ["questions", "facts", "reviews", "artifacts", "reconstruction_proposals"]) {
      db.query(`delete from ${t} where cycleId in (${ph})`).run(...cycleIds);
    }
    db.query(`delete from ledger where cycleFrom in (${ph})`).run(...cycleIds);
    db.query(`delete from tasks where cycleId in (${ph})`).run(...cycleIds);
  }
  for (const t of ["cycles", "tasks", "proposals", "wiki", "conversations"]) {
    db.query(`delete from ${t} where projectId=?`).run(LEGACY);
  }
  db.query("delete from projects where id=?").run(LEGACY);
  db.exec("COMMIT");
  console.log("deleted legacy project + cycles:", cycleIds.length);
} catch (e) {
  db.exec("ROLLBACK");
  console.log("ROLLBACK", (e as Error).message);
}

console.log("--- remaining projects ---");
for (const r of db.query<{ id: string; data: string }, []>("select id,data from projects").all()) {
  const p = JSON.parse(r.data);
  console.log(r.id, "→", p.pipelineDef.map((s: { id: string }) => s.id).join(","));
}
db.close();

import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseTranscript } from "./core/transcript.js";
import { openStore, upsertDigest } from "./db/store.js";

/** Backfill: index every existing transcript. Spike: ~seconds for 370MB. */
export async function backfill(): Promise<{ sessions: number; ms: number }> {
  const started = Date.now();
  const projectsDir = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
  const db = openStore();
  let sessions = 0;
  for (const project of safeReaddir(projectsDir)) {
    const dir = join(projectsDir, project);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of safeReaddir(dir)) {
      if (!file.endsWith(".jsonl")) continue;
      try {
        const digest = await parseTranscript(join(dir, file));
        if (digest.records > 0) {
          upsertDigest(db, digest);
          sessions++;
        }
      } catch {
        // fail-open: one bad transcript never kills the backfill
      }
    }
  }
  db.close();
  return { sessions, ms: Date.now() - started };
}

function safeReaddir(p: string): string[] {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

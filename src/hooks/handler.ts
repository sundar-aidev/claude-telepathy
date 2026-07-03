import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderRescueBrief } from "../core/brief.js";
import { briefsDir, dataDir, rescueBriefPath } from "../core/paths.js";
import { rescueOutput } from "../core/rescue.js";
import { parseTranscript } from "../core/transcript.js";
import type { HookPayload } from "../core/types.js";
import { openStore, upsertDigest } from "../db/store.js";

/**
 * Single entrypoint for all write-path hooks. Reads the payload from stdin,
 * dispatches on hook_event_name, and — non-negotiably — exits 0. A broken
 * telepathy must degrade to "telepathy doesn't exist", never to prompt errors.
 */
export async function runHook(): Promise<void> {
  try {
    const payload = JSON.parse(await readStdin()) as HookPayload;
    await dispatch(payload);
  } catch (err) {
    try {
      mkdirSync(dataDir(), { recursive: true });
      appendFileSync(join(dataDir(), "error.log"), `${new Date().toISOString()} ${String(err)}\n`);
    } catch {
      /* even logging is best-effort */
    }
  }
  process.exit(0);
}

async function dispatch(p: HookPayload): Promise<void> {
  switch (p.hook_event_name) {
    case "PreCompact": {
      // Idempotent snapshot (spike: fires even when compaction then aborts).
      const digest = await parseTranscript(p.transcript_path);
      const db = openStore();
      db.prepare(
        "INSERT INTO snapshots (session_id, trigger, created_at, payload) VALUES (?, ?, datetime('now'), ?)",
      ).run(p.session_id, p.trigger ?? null, JSON.stringify(digest));
      db.close();
      // Write-renders / read-reads: pre-render the rescue brief to a flat file
      // NOW so the read path (compiled binary) never touches the DB.
      writeBriefAtomic(rescueBriefPath(p.session_id), renderRescueBrief(digest));
      break;
    }
    case "PostCompact": {
      const db = openStore();
      db.prepare(
        "INSERT INTO compactions (session_id, ts, trigger, summary) VALUES (?, datetime('now'), ?, ?)",
      ).run(p.session_id, p.trigger ?? null, p.compact_summary ?? null);
      if (p.compact_summary) {
        db.prepare(
          "INSERT INTO recall_fts (session_id, kind, content) VALUES (?, 'compact_summary', ?)",
        ).run(p.session_id, p.compact_summary);
      }
      db.close();
      break;
    }
    case "SessionEnd":
    case "PostToolUse": {
      const digest = await parseTranscript(p.transcript_path);
      const db = openStore();
      upsertDigest(db, digest);
      db.close();
      break;
    }
    case "SessionStart": {
      // Node fallback for the read path (the compiled binary is primary) — same
      // pure decision function, so both paths behave identically.
      const out = rescueOutput(p);
      if (out) process.stdout.write(out);
      break;
    }
    default:
      break; // unknown events ignored, fail-open
  }
}

/** Atomic flat-file write (temp + rename) so a concurrent read never sees a partial brief. */
function writeBriefAtomic(dest: string, content: string): void {
  mkdirSync(briefsDir(), { recursive: true });
  const tmp = `${dest}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, dest);
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (c) => {
      data += c;
    });
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 3000); // never hang a hook
  });
}

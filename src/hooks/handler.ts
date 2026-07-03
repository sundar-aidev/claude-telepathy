import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseTranscript } from "../core/transcript.js";
import type { HookPayload } from "../core/types.js";
import { dataDir, openStore, upsertDigest } from "../db/store.js";

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
      // Read path placeholder: v1 ships a compiled binary here (<50ms budget).
      // The TS handler only serves `source=compact` rescue until then.
      if (p.source === "compact") {
        const db = openStore();
        const snap = db
          .prepare(
            "SELECT payload FROM snapshots WHERE session_id = ? ORDER BY created_at DESC LIMIT 1",
          )
          .get(p.session_id) as { payload: string } | undefined;
        db.close();
        if (snap) {
          const d = JSON.parse(snap.payload);
          const brief = renderRescueBrief(d);
          process.stdout.write(
            JSON.stringify({
              hookSpecificOutput: {
                hookEventName: "SessionStart",
                additionalContext: brief,
              },
            }),
          );
        }
      }
      break;
    }
    default:
      break; // unknown events ignored, fail-open
  }
}

function renderRescueBrief(d: {
  aiTitle?: string;
  lastPrompt?: string;
  filesEdited?: string[];
  sessionId?: string;
}): string {
  const lines = [
    "── TELEPATHY · COMPACTION RESCUE ──",
    d.aiTitle ? `Task: ${d.aiTitle}` : null,
    d.lastPrompt ? `Last user request: ${d.lastPrompt}` : null,
    d.filesEdited?.length ? `Files in flight: ${d.filesEdited.slice(-5).join(", ")}` : null,
    `Full pre-compact state: telepathy show ${d.sessionId?.slice(0, 8) ?? ""}`,
    "───────────────────────────────────",
  ];
  return lines.filter(Boolean).join("\n");
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

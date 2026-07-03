import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { dataDir } from "../core/paths.js";
import type { SessionDigest } from "../core/types.js";

export function openStore(dbPath = join(dataDir(), "index.db")): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8");
  db.exec(schema);
  return db;
}

export function upsertDigest(db: Database.Database, d: SessionDigest): void {
  db.prepare(
    `INSERT INTO sessions (session_id, transcript_path, cwd, git_branch, ai_title, first_prompt,
       last_prompt, first_ts, last_ts, compactions, prompt_count, indexed_at)
     VALUES (@sessionId, @transcriptPath, @cwd, @gitBranch, @aiTitle, @firstPrompt,
       @lastPrompt, @firstTs, @lastTs, @compactions, @promptCount, datetime('now'))
     ON CONFLICT(session_id) DO UPDATE SET
       transcript_path=excluded.transcript_path, cwd=excluded.cwd, git_branch=excluded.git_branch,
       ai_title=excluded.ai_title, first_prompt=excluded.first_prompt,
       last_prompt=excluded.last_prompt, first_ts=excluded.first_ts, last_ts=excluded.last_ts,
       compactions=excluded.compactions, prompt_count=excluded.prompt_count,
       indexed_at=excluded.indexed_at`,
  ).run(d as unknown as Record<string, unknown>);

  const insFile = db.prepare(
    "INSERT OR IGNORE INTO file_activity (session_id, file_path, ts) VALUES (?, ?, ?)",
  );
  for (const f of d.filesEdited) insFile.run(d.sessionId, f, d.lastTs);

  db.prepare("DELETE FROM recall_fts WHERE session_id = ? AND kind = 'digest'").run(d.sessionId);
  const digestText = [d.aiTitle, d.firstPrompt, d.lastPrompt, d.filesEdited.join(" ")]
    .filter(Boolean)
    .join("\n");
  if (digestText) {
    db.prepare("INSERT INTO recall_fts (session_id, kind, content) VALUES (?, 'digest', ?)").run(
      d.sessionId,
      digestText,
    );
  }
  if (d.lastCompactSummary) {
    db.prepare(
      "INSERT INTO recall_fts (session_id, kind, content) VALUES (?, 'compact_summary', ?)",
    ).run(d.sessionId, d.lastCompactSummary);
  }
}

export interface SessionRow {
  session_id: string;
  cwd: string | null;
  git_branch: string | null;
  name: string | null;
  ai_title: string | null;
  last_prompt: string | null;
  last_ts: string | null;
  compactions: number;
  prompt_count: number;
}

export function listSessions(db: Database.Database, limit = 20): SessionRow[] {
  return db
    .prepare("SELECT * FROM sessions ORDER BY last_ts DESC LIMIT ?")
    .all(limit) as SessionRow[];
}

export function findSessions(db: Database.Database, query: string, limit = 10): SessionRow[] {
  return db
    .prepare(
      `SELECT s.* FROM recall_fts f JOIN sessions s ON s.session_id = f.session_id
       WHERE recall_fts MATCH ? GROUP BY s.session_id
       ORDER BY rank LIMIT ?`,
    )
    .all(ftsQuote(query), limit) as SessionRow[];
}

/** Quote user input for FTS5 MATCH so punctuation can't crash the query. */
function ftsQuote(q: string): string {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `"${w.replaceAll('"', '""')}"`)
    .join(" ");
}

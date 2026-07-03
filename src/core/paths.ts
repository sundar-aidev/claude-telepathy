import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Dependency-free path helpers. Imported by BOTH the write path (which also
 * loads better-sqlite3) and the compiled read binary (which must not). Keep this
 * module free of any heavy or native imports.
 */
export function dataDir(): string {
  return process.env.TELEPATHY_DIR ?? join(homedir(), ".claude-telepathy");
}

export function briefsDir(): string {
  return join(dataDir(), "briefs");
}

/** Pre-rendered compaction-rescue brief for a session (written at PreCompact). */
export function rescueBriefPath(sessionId: string): string {
  return join(briefsDir(), `${sanitize(sessionId)}.rescue`);
}

/** Guard against a hostile session_id escaping the briefs dir. */
function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

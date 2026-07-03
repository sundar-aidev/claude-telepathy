import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface LiveSession {
  sessionId: string;
  pid: number;
  name: string;
  cwd: string;
  status: string;
  ageSec: number; // seconds since it last reported activity
}

/**
 * Claude Code's own live-session registry (~/.claude/sessions/<pid>.json).
 * Returns sessions whose process is still alive, newest activity first. This is
 * the source of truth for "what's open right now" across all your tabs.
 */
export function listLive(nowMs: number): LiveSession[] {
  const dir = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "sessions");
  const out: LiveSession[] = [];
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return out;
  }
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    let d: any;
    try {
      d = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch {
      continue;
    }
    if (!d.pid || !isAlive(d.pid)) continue; // dead process → skip
    out.push({
      sessionId: d.sessionId ?? "",
      pid: d.pid,
      name: d.name ?? d.sessionId?.slice(0, 8) ?? "?",
      cwd: d.cwd ?? "?",
      status: d.status ?? "?",
      ageSec: Math.max(0, Math.round((nowMs - (d.updatedAt ?? d.startedAt ?? nowMs)) / 1000)),
    });
  }
  return out.sort((a, b) => a.ageSec - b.ageSec);
}

/** Does a process with this pid exist? (signal 0 = existence check, no signal sent.) */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === "EPERM"; // exists but owned by another user
  }
}

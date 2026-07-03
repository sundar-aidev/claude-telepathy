import { readFileSync } from "node:fs";
import { rescueBriefPath } from "./paths.js";

interface StartPayload {
  hook_event_name?: string;
  source?: string;
  session_id?: string;
}

/**
 * The shared read-path decision, used by both the compiled binary and the Node
 * fallback. Given a parsed SessionStart payload, return the hook JSON string to
 * emit, or null to inject nothing. Pure except for one flat-file read; total
 * (never throws) — the read path is fail-open by contract.
 */
export function rescueOutput(p: StartPayload): string | null {
  if (p.hook_event_name !== "SessionStart" || p.source !== "compact" || !p.session_id) return null;
  let brief: string;
  try {
    brief = readFileSync(rescueBriefPath(p.session_id), "utf8");
  } catch {
    return null; // no snapshot for this session
  }
  if (!brief.trim()) return null;
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: brief },
  });
}

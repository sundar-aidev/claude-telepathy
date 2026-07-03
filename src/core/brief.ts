import { basename } from "node:path";
import type { SessionDigest } from "./types.js";

/**
 * Render the compaction-rescue brief injected on SessionStart(source=compact).
 *
 * Pure and total (never throws) — it runs on the read path where fail-open is
 * mandatory. Design note: the brief leads with the *task*, not the last thing
 * typed. Live dogfooding (2026-07-03) showed that anchoring on `lastPrompt`
 * mislabels bulk mid-session activity as the goal; `aiTitle ?? firstPrompt`
 * reconstructs what the session was actually for.
 */
export function renderRescueBrief(d: Partial<SessionDigest>): string {
  const task =
    firstLine(d.aiTitle, 160) ??
    firstLine(d.firstPrompt, 160) ??
    "(unknown — run `telepathy show` for the full transcript)";
  const recent = firstLine(d.lastPrompt, 100);
  const files = (d.filesEdited ?? []).slice(-5).map((f) => basename(f));
  const scope = [
    d.gitBranch ? `branch ${d.gitBranch}` : null,
    d.filesEdited?.length ? `${d.filesEdited.length} file(s) touched` : null,
    d.promptCount ? `${d.promptCount} turns` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    "── TELEPATHY · COMPACTION RESCUE ──",
    `Task: ${task}`,
    scope ? `Working: ${scope}` : null,
    files.length ? `Files in flight: ${files.join(", ")}` : null,
    // Only show the last prompt when it adds information beyond the task.
    recent && recent !== task ? `Most recent step: ${recent}` : null,
    `Full pre-compact state: telepathy show ${(d.sessionId ?? "").slice(0, 8)}`,
    "───────────────────────────────────",
  ]
    .filter(Boolean)
    .join("\n");
}

/** First non-empty line of a string, trimmed and clipped. Null-safe. */
function firstLine(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const line = s.trim().split("\n")[0]?.trim();
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import type { SessionDigest } from "./types.js";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const PROMPT_PREVIEW = 200;

/**
 * Stream-parse a Claude Code transcript JSONL into a SessionDigest.
 * Spike-verified: 29MB/4.7k records in ~0.1s. Never throws on malformed lines.
 */
export async function parseTranscript(path: string): Promise<SessionDigest> {
  const d: SessionDigest = {
    sessionId: basename(path, ".jsonl"),
    transcriptPath: path,
    cwd: null,
    gitBranch: null,
    aiTitle: null,
    customTitle: null,
    firstPrompt: null,
    lastPrompt: null,
    firstTs: null,
    lastTs: null,
    promptCount: 0,
    filesEdited: [],
    compactions: 0,
    lastCompactSummary: null,
    sidechainRecords: 0,
    records: 0,
  };
  const seenFiles = new Set<string>();

  const rl = createInterface({
    input: createReadStream(path),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const line of rl) {
    if (!line) continue;
    let r: any;
    try {
      r = JSON.parse(line);
    } catch {
      continue; // fail-open: skip malformed lines
    }
    d.records++;
    const t: string = r.type ?? "";

    // Metadata entries repeat per turn; last one wins (spike watch-out).
    if (t === "ai-title" && r.aiTitle) d.aiTitle = r.aiTitle;
    if (t === "custom-title" && r.customTitle) d.customTitle = r.customTitle;
    if (t === "last-prompt" && r.lastPrompt) d.lastPrompt = r.lastPrompt;

    if (r.isSidechain) {
      d.sidechainRecords++;
      continue; // subagent traffic never contributes to the digest
    }
    if (r.cwd && !d.cwd) d.cwd = r.cwd;
    if (r.gitBranch && !d.gitBranch) d.gitBranch = r.gitBranch;
    if (r.timestamp) {
      d.firstTs ??= r.timestamp;
      d.lastTs = r.timestamp;
    }

    // Compact boundary: {type:"system", subtype:"compact_boundary"} (spike-verified).
    if (t === "system" && r.subtype === "compact_boundary") d.compactions++;
    if (r.isCompactSummary === true) {
      const text = extractText(r.message?.content);
      if (text) d.lastCompactSummary = text;
      continue; // synthetic user record, not a real prompt
    }

    if (t === "user") {
      const text = extractText(r.message?.content);
      if (text && !text.startsWith("<")) {
        d.promptCount++;
        d.firstPrompt ??= text.slice(0, PROMPT_PREVIEW);
        d.lastPrompt = text.slice(0, PROMPT_PREVIEW);
      }
    }

    if (t === "assistant") {
      for (const block of asArray(r.message?.content)) {
        if (block?.type === "tool_use" && EDIT_TOOLS.has(block.name)) {
          const fp = block.input?.file_path;
          if (typeof fp === "string" && !seenFiles.has(fp)) {
            seenFiles.add(fp);
            d.filesEdited.push(fp);
          }
        }
      }
    }
  }
  return d;
}

function asArray(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

function extractText(content: unknown): string | null {
  if (typeof content === "string") return content || null;
  for (const block of asArray(content)) {
    if (block?.type === "text" && typeof block.text === "string") return block.text;
  }
  return null;
}

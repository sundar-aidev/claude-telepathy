import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export interface SessionContext {
  cwd: string | null;
  gitBranch: string | null;
  title: string | null;
  filesEdited: string[];
  exchanges: { role: "you" | "claude"; text: string }[];
}

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/**
 * Build a transferable context digest from another session's transcript: its
 * task, branch, files touched, and the last few real exchanges. This is what
 * `telepathy pull` hands to the current session so it inherits what the other
 * one was doing — no copy-paste.
 */
export async function buildContext(
  transcriptPath: string,
  maxExchanges = 6,
): Promise<SessionContext> {
  const ctx: SessionContext = {
    cwd: null,
    gitBranch: null,
    title: null,
    filesEdited: [],
    exchanges: [],
  };
  const files = new Set<string>();
  const buf: SessionContext["exchanges"] = [];

  const rl = createInterface({
    input: createReadStream(transcriptPath),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const line of rl) {
    if (!line) continue;
    let r: any;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (r.type === "ai-title" && r.aiTitle) ctx.title = r.aiTitle;
    if (r.isSidechain || r.isCompactSummary) continue;
    if (r.cwd && !ctx.cwd) ctx.cwd = r.cwd;
    if (r.gitBranch && !ctx.gitBranch) ctx.gitBranch = r.gitBranch;

    const c = r.message?.content;
    if (r.type === "user") {
      const t =
        typeof c === "string"
          ? c
          : Array.isArray(c)
            ? c
                .filter((b: any) => b?.type === "text")
                .map((b: any) => b.text)
                .join(" ")
            : "";
      if (t?.trim() && !t.startsWith("<")) rollingPush(buf, { role: "you", text: t.trim() });
    } else if (r.type === "assistant" && Array.isArray(c)) {
      for (const b of c) {
        if (b?.type === "text" && b.text?.trim()) {
          rollingPush(buf, { role: "claude", text: b.text.trim() });
        }
        if (b?.type === "tool_use" && EDIT_TOOLS.has(b.name) && b.input?.file_path) {
          files.add(b.input.file_path);
        }
      }
    }
  }
  ctx.filesEdited = [...files];
  ctx.exchanges = buf.slice(-maxExchanges * 2);
  return ctx;
}

/** Keep memory bounded on huge transcripts — we only ever emit the tail. */
function rollingPush(buf: SessionContext["exchanges"], item: SessionContext["exchanges"][number]) {
  buf.push(item);
  if (buf.length > 60) buf.splice(0, buf.length - 60);
}

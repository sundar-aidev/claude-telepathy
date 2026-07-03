/** A parsed summary of one Claude Code session transcript. */
export interface SessionDigest {
  sessionId: string;
  transcriptPath: string;
  cwd: string | null;
  gitBranch: string | null;
  /** Latest ai-title entry wins (they repeat per turn — read from tail). */
  aiTitle: string | null;
  customTitle: string | null;
  firstPrompt: string | null;
  lastPrompt: string | null;
  firstTs: string | null;
  lastTs: string | null;
  promptCount: number;
  /** Distinct file paths touched via Edit/Write/MultiEdit, in first-seen order. */
  filesEdited: string[];
  /** Count of compact boundaries (subtype: "compact_boundary"). */
  compactions: number;
  /** Latest compact summary text, if any (record with isCompactSummary: true). */
  lastCompactSummary: string | null;
  sidechainRecords: number;
  records: number;
}

/** Base fields present on every hook payload (verified in spike). */
export interface HookPayload {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  /** SessionStart only: "startup" | "resume" | "clear" | "compact" */
  source?: string;
  /** PreCompact/PostCompact: "manual" | "auto" */
  trigger?: string;
  /** PostCompact only. */
  compact_summary?: string;
  /** SessionEnd only. */
  reason?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

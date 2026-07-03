import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "claude-telepathy";
// Write path: full parse + DB write. Not latency-critical.
const WRITE_EVENTS = ["PostToolUse", "PreCompact", "PostCompact", "SessionEnd"];
// Read path: runs before the user's turn — must be fast (compiled binary).
const READ_EVENTS = ["SessionStart"];

function settingsPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json");
}

function distDir(): string {
  return dirname(fileURLToPath(import.meta.url)); // dist/ after build
}

/** Write-path command: the Node hook dispatcher. */
function writeCommand(): string {
  return `node "${join(distDir(), "cli.js")}" hook`;
}

/** Read-path command: prefer the compiled binary, fall back to plain Node. */
function readCommand(): string {
  const bin = join(distDir(), "telepathy-read");
  return existsSync(bin) ? `"${bin}"` : `node "${join(distDir(), "read.js")}"`;
}

/** True once a telepathy entry (any generation) is recognized, so install is idempotent. */
function isTelepathy(entry: unknown): boolean {
  const s = JSON.stringify(entry);
  return s.includes(MARKER) || s.includes('cli.js" hook') || s.includes("telepathy-read");
}

export function install(): string {
  const path = settingsPath();
  const settings = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  settings.hooks ??= {};

  const wire = (event: string, command: string, matcher: string) => {
    const entries: any[] = (settings.hooks[event] ?? []).filter((e: unknown) => !isTelepathy(e));
    entries.push({ matcher, hooks: [{ type: "command", command, timeout: 10 }] });
    settings.hooks[event] = entries;
  };

  for (const event of WRITE_EVENTS) {
    wire(event, writeCommand(), event === "PostToolUse" ? "Edit|Write|MultiEdit|NotebookEdit" : "");
  }
  for (const event of READ_EVENTS) {
    wire(event, readCommand(), "");
  }

  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  return path;
}

export function uninstall(): string {
  const path = settingsPath();
  if (!existsSync(path)) return path;
  const settings = JSON.parse(readFileSync(path, "utf8"));
  for (const event of Object.keys(settings.hooks ?? {})) {
    settings.hooks[event] = settings.hooks[event].filter((e: unknown) => !isTelepathy(e));
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  return path;
}

/** True if the fast compiled read binary is present (else Node fallback is used). */
export function hasCompiledReader(): boolean {
  return existsSync(join(distDir(), "telepathy-read"));
}

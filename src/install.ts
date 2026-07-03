import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "claude-telepathy";
const WRITE_EVENTS = ["PostToolUse", "PreCompact", "PostCompact", "SessionEnd", "SessionStart"];

function settingsPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json");
}

/** Absolute command for hook entries — resolved once at install time. */
function hookCommand(): string {
  const cli = fileURLToPath(import.meta.url).replace(/install\.(ts|js)$/, "cli.js");
  return `node "${cli}" hook`;
}

export function install(): string {
  const path = settingsPath();
  const settings = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  settings.hooks ??= {};
  for (const event of WRITE_EVENTS) {
    const entries: any[] = settings.hooks[event] ?? [];
    // Idempotent: strip any previous telepathy entries, then add current.
    settings.hooks[event] = entries.filter(
      (e) => !JSON.stringify(e).includes(MARKER) && !JSON.stringify(e).includes('cli.js" hook'),
    );
    settings.hooks[event].push({
      matcher: event === "PostToolUse" ? "Edit|Write|MultiEdit|NotebookEdit" : "",
      hooks: [{ type: "command", command: hookCommand(), timeout: 10 }],
    });
  }
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  return path;
}

export function uninstall(): string {
  const path = settingsPath();
  if (!existsSync(path)) return path;
  const settings = JSON.parse(readFileSync(path, "utf8"));
  for (const event of Object.keys(settings.hooks ?? {})) {
    settings.hooks[event] = settings.hooks[event].filter(
      (e: unknown) =>
        !JSON.stringify(e).includes(MARKER) && !JSON.stringify(e).includes('cli.js" hook'),
    );
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  return path;
}

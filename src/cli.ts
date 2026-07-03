#!/usr/bin/env node
import { findSessions, listSessions, openStore } from "./db/store.js";
import { runHook } from "./hooks/handler.js";
import { backfill } from "./index-cmd.js";
import { install, uninstall } from "./install.js";

const [, , cmd, ...args] = process.argv;

async function main(): Promise<void> {
  switch (cmd) {
    case "hook":
      await runHook(); // exits 0 itself
      return;
    case "install": {
      const path = install();
      const { sessions, ms } = await backfill();
      console.log(`✓ hooks installed → ${path}`);
      console.log(`✓ backfilled ${sessions} sessions in ${(ms / 1000).toFixed(1)}s`);
      console.log("Restart running Claude sessions to activate. New sessions join automatically.");
      return;
    }
    case "uninstall":
      console.log(`✓ hooks removed → ${uninstall()} (index kept in ~/.claude-telepathy)`);
      return;
    case "index": {
      const { sessions, ms } = await backfill();
      console.log(`✓ indexed ${sessions} sessions in ${(ms / 1000).toFixed(1)}s`);
      return;
    }
    case "list": {
      const db = openStore();
      for (const s of listSessions(db, Number(args[0]) || 20)) {
        console.log(
          [
            (s.name ?? s.session_id.slice(0, 8)).padEnd(18),
            (shortCwd(s.cwd) ?? "-").padEnd(32),
            (s.git_branch ?? "-").padEnd(20),
            (s.last_ts ?? "").slice(0, 16),
            s.ai_title ?? s.last_prompt ?? "",
          ].join(" "),
        );
      }
      db.close();
      return;
    }
    case "find": {
      const q = args.join(" ");
      if (!q) return usage();
      const db = openStore();
      for (const s of findSessions(db, q)) {
        console.log(
          `${s.session_id.slice(0, 8)}  ${shortCwd(s.cwd) ?? "-"}  ${(s.last_ts ?? "").slice(0, 10)}  ${s.ai_title ?? s.last_prompt ?? ""}`,
        );
      }
      db.close();
      return;
    }
    case "version":
      console.log("claude-telepathy 0.0.1");
      return;
    default:
      return usage();
  }
}

function shortCwd(cwd: string | null): string | null {
  return cwd ? cwd.replace(process.env.HOME ?? "", "~") : null;
}

function usage(): void {
  console.log(`claude-telepathy — one brain for all your Claudes (unofficial)

  telepathy install      wire hooks + backfill your existing history
  telepathy uninstall    remove hooks (index is kept)
  telepathy index        re-run the backfill
  telepathy list [n]     recent sessions
  telepathy find <q>     full-text search across all sessions
  telepathy hook         (internal) hook entrypoint — reads payload on stdin`);
}

main().catch(() => process.exit(cmd === "hook" ? 0 : 1));

#!/usr/bin/env node
import { bestExcerpt } from "./core/recall.js";
import { findSessions, listSessions, openStore } from "./db/store.js";
import { runHook } from "./hooks/handler.js";
import { backfill } from "./index-cmd.js";
import { hasCompiledReader, install, uninstall } from "./install.js";

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
      console.log(
        hasCompiledReader()
          ? "✓ read path: compiled binary (fast)"
          : "• read path: Node fallback (run `npm run build:binary` with bun for the fast path)",
      );
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
    case "recall": {
      const q = args.join(" ");
      if (!q) return usage();
      const db = openStore();
      const hits = findSessions(db, q, 4);
      db.close();
      if (hits.length === 0) {
        console.log(`No past session mentions "${q}".`);
        return;
      }
      const top = hits[0] as (typeof hits)[number];
      const excerpt = await bestExcerpt(top.transcript_path, q.split(/\s+/));
      console.log(
        `↩ From "${top.ai_title ?? top.last_prompt ?? top.session_id.slice(0, 8)}" · ${(top.last_ts ?? "").slice(0, 10)} · ${shortCwd(top.cwd) ?? "-"}\n`,
      );
      console.log(
        excerpt
          ? clip(excerpt, 900)
          : "(session matched, but no text answer found — open it to review)",
      );
      if (hits.length > 1) {
        console.log(
          `\nAlso in: ${hits
            .slice(1)
            .map((h) => h.ai_title ?? h.session_id.slice(0, 8))
            .join(" · ")}`,
        );
      }
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

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function usage(): void {
  console.log(`claude-telepathy — one brain for all your Claudes (unofficial)

  telepathy install      wire hooks + backfill your existing history
  telepathy uninstall    remove hooks (index is kept)
  telepathy index        re-run the backfill
  telepathy list [n]     recent sessions
  telepathy find <q>     which past sessions mention <q>
  telepathy recall <q>   bring back the actual answer from a past session
  telepathy hook         (internal) hook entrypoint — reads payload on stdin`);
}

main().catch(() => process.exit(cmd === "hook" ? 0 : 1));

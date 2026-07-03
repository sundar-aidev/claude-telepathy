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
      const hits = findSessions(db, q, 5);
      db.close();
      if (hits.length === 0) {
        console.log(`No past session mentions "${q}".`);
        return;
      }
      const terms = q.split(/\s+/);
      const label = (h: (typeof hits)[number]) =>
        h.ai_title || h.last_prompt || h.session_id.slice(0, 8);
      // Fall through empty/aborted top matches to the first session that has a
      // real answer — a strongly-ranked-but-empty session shouldn't dead-end recall.
      let answer: { hit: (typeof hits)[number]; excerpt: string } | null = null;
      for (const h of hits) {
        const ex = await bestExcerpt(h.transcript_path, terms);
        if (ex) {
          answer = { hit: h, excerpt: ex };
          break;
        }
      }
      if (answer) {
        const h = answer.hit;
        console.log(
          `↩ From "${clip(label(h), 70)}" · ${(h.last_ts ?? "").slice(0, 10)} · ${shortCwd(h.cwd) ?? "-"}\n`,
        );
        console.log(clip(answer.excerpt, 900));
        const others = hits.filter((x) => x.session_id !== h.session_id);
        if (others.length > 0) {
          console.log(`\nAlso in: ${others.map((x) => clip(label(x), 40)).join(" · ")}`);
        }
      } else {
        const top = hits[0] as (typeof hits)[number];
        console.log(
          `Matched "${clip(label(top), 70)}" (${(top.last_ts ?? "").slice(0, 10)}) but no session had a substantive answer — the top match may have been aborted or empty.`,
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

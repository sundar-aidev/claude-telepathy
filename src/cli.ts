#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { buildContext } from "./core/context.js";
import { bestExcerpt } from "./core/recall.js";
import { type LiveSession, listLive } from "./core/registry.js";
import { type SessionRow, findSessions, listSessions, openStore } from "./db/store.js";
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
    case "peers": {
      const live = listLive(Date.now());
      if (live.length === 0) {
        console.log("No live Claude sessions found (other than this one may be starting up).");
        return;
      }
      const db = openStore();
      console.log("Live sessions:\n");
      live.forEach((s, i) => {
        const row = sessionById(db, s.sessionId);
        const task = row?.ai_title || row?.last_prompt || "(no task recorded yet)";
        console.log(`  ${i + 1}. ${s.name}  [${s.status}, ${fmtAge(s.ageSec)}]`);
        console.log(`     ${shortCwd(s.cwd)}`);
        console.log(`     ↳ ${clip(task, 80)}\n`);
      });
      db.close();
      console.log('Pull one in:  telepathy pull <name>   ·   Ask one:  telepathy ask <name> "…"');
      return;
    }
    case "pull": {
      const sel = args.join(" ");
      if (!sel) return usage();
      const target = resolve(sel);
      if (!target) {
        console.log(`No session matches "${sel}". Try: telepathy peers`);
        return;
      }
      const ctx = await buildContext(target.transcript_path);
      console.log(`═══ CONTEXT PULLED FROM: ${label(target)} ═══`);
      console.log(`cwd: ${shortCwd(ctx.cwd)}${ctx.gitBranch ? ` · branch ${ctx.gitBranch}` : ""}`);
      if (ctx.filesEdited.length) {
        console.log(`files touched: ${ctx.filesEdited.slice(-8).map(baseName).join(", ")}`);
      }
      console.log("\nrecent exchange:");
      for (const e of ctx.exchanges) {
        console.log(`\n[${e.role}] ${clip(e.text, 500)}`);
      }
      console.log("\n═══ end of pulled context — you now have what that session was doing ═══");
      return;
    }
    case "ask": {
      const target = resolve(args[0] ?? "");
      const question = args.slice(1).join(" ");
      if (!target || !question) {
        console.log('Usage: telepathy ask <name> "<question>"   (see: telepathy peers)');
        return;
      }
      console.log(`Asking ${label(target)} (forking its context, won't disturb the live tab)…\n`);
      try {
        const out = execFileSync(
          "claude",
          ["--resume", target.session_id, "--fork-session", "-p", question],
          {
            cwd: target.cwd ?? process.cwd(),
            encoding: "utf8",
            timeout: 120000,
            stdio: ["ignore", "pipe", "ignore"],
          },
        );
        console.log(out.trim());
      } catch {
        console.log(
          "Couldn't get an answer (the session may be busy, or resume needs its original directory). Try `telepathy pull` instead.",
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

/** Resolve a selector (name, short id, or list number) to an indexed session. */
function resolve(sel: string): SessionRow | null {
  const db = openStore();
  try {
    const live = listLive(Date.now());
    // 1) list number from the last `peers` output
    const n = Number(sel);
    if (Number.isInteger(n) && n >= 1 && n <= live.length) {
      const row = sessionById(db, live[n - 1]?.sessionId ?? "");
      if (row) return row;
    }
    // 2) exact live name
    const named = live.find((l) => l.name === sel);
    if (named) {
      const row = sessionById(db, named.sessionId);
      if (row) return row;
    }
    // 3) session-id prefix or name/title substring across the whole index
    const like = `%${sel}%`;
    return (
      (db
        .prepare(
          `SELECT * FROM sessions
         WHERE session_id LIKE ? OR name = ? OR ai_title LIKE ? OR cwd LIKE ?
         ORDER BY last_ts DESC LIMIT 1`,
        )
        .get(`${sel}%`, sel, like, like) as SessionRow | undefined) ?? null
    );
  } finally {
    db.close();
  }
}

function sessionById(db: ReturnType<typeof openStore>, id: string): SessionRow | undefined {
  if (!id) return undefined;
  return db.prepare("SELECT * FROM sessions WHERE session_id = ?").get(id) as
    | SessionRow
    | undefined;
}

function label(s: SessionRow): string {
  return s.name || s.ai_title || s.last_prompt?.slice(0, 40) || s.session_id.slice(0, 8);
}

function baseName(p: string): string {
  return p.split("/").pop() ?? p;
}

function fmtAge(sec: number): string {
  if (sec < 90) return `${sec}s ago`;
  if (sec < 5400) return `${Math.round(sec / 60)}m ago`;
  if (sec < 172800) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
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
  telepathy peers        list your LIVE sessions (other tabs/terminals)
  telepathy pull <name>  fetch a live session's context into this one
  telepathy ask <name> "…"  ask a live session's brain a question
  telepathy list [n]     recent sessions (history)
  telepathy find <q>     which past sessions mention <q>
  telepathy recall <q>   bring back the actual answer from a past session
  telepathy hook         (internal) hook entrypoint — reads payload on stdin`);
}

main().catch(() => process.exit(cmd === "hook" ? 0 : 1));

# claude-telepathy

**One brain for all your Claudes. Every session — running, ended, or compacted — is a mind your current Claude can read.**

> claude-mem gives Claude a diary.
> telepathy gives your Claudes one brain.

Status: FOR REVIEW · 2026-07-02 · rev 2 (evidence-backed pivot: amnesia-first, collision demoted to v2)
Name: LOCKED — npm `claude-telepathy` (verified available), brand "Telepathy", README carries "unofficial — not affiliated with Anthropic"
Research basis: pain evidence report → `~/Knowledge Base/AI ENGINEERING/claude-code-session-memory-pain-research-2026-07.md` · source-mine of `~/ai/claude-code-source` · office-hours lineage doc in `~/.gstack/projects/KnowledgeBase/`

---

## The pain (ranked by evidence, not vibes)

**#1 — Compaction destroys working context.** The loudest complaint in the ecosystem: "50 first dates," "dumb zone," "lobotomized mid-task." GitHub issues with 90/77/46 reactions sit open and ignored; 1,200+ issues mention compaction. Documented damage: silently deleted code, unwanted refactors. Anthropic fixes acute bugs, ignores every structural ask.

**#2 — Session amnesia.** Every new session starts knowing nothing: "asks the same questions like a new intern daily," "I'm paying for ONE Claude. I should get ONE Claude." The flagship fix request was **closed NOT PLANNED**. Native auto-memory didn't solve it: 200-line cap, grep-only recall, token bloat.

**#3 — Lost work.** "I had 1,063 conversations and couldn't find anything." Full-text session search gets refiled monthly and closed every time.

**The user-stated smoking gun:** *"The transcript is still sitting at `~/.claude/projects/` as a .jsonl file — the compaction summary just has no pointer back to it."* The memory exists on disk. Nothing wires it back in. That wiring is this product.

(Collision between parallel sessions — the previous headline — ranked #5: real but power-user-only, outnumbered 3:1. It ships in v2 as a bonus, where it belongs.)

## The spec, written by the failed workarounds

Users already tried fixing this. Their complaints about the incumbents ARE the requirements:

| Workaround | Why it fails | → Requirement |
|---|---|---|
| CLAUDE.md notes | "It can quote the rules. It then violates them." | **Hook-enforced injection** — never prose Claude can ignore |
| Memory MCPs (mem0 etc.) | "If you don't prompt it, it never calls the MCP" | **Automatic** — fires on SessionStart/PostCompact, zero user action |
| claude-mem | "Uses too much tokens" | **Retrieval-on-demand** — tiny ambient brief, deep recall only when asked |
| claude-mem | "Leaves CLAUDE.md files all over" | **Zero repo litter** — state lives in `~/.claude-telepathy/`, never in projects |
| All of them | Separate store you must build up | **Transcripts ARE the store** — the memory already exists; we index, never duplicate |

## The unlock (from the Claude Code source, verified)

Anthropic already built the pieces; nothing connects them:

- Transcripts: one JSONL per session with `cwd`, `gitBranch`, `sessionId`, timestamps on every record; titles, last-prompt, task summaries embedded.
- **A background agent already maintains `summary.md` per session** — a running digest nobody surfaces.
- `PreCompact` hook fires *before* context is destroyed; **`PostCompact` hands us the compact summary itself**.
- `SessionStart` hooks inject `additionalContext` (or an `initialUserMessage`) — enforcement-grade delivery.
- Live session registry (`~/.claude/sessions/*.json`: pid, cwd, name, status, messaging socket) + native UDS message transport → v2 rides native plumbing.
- Headless resume (`claude --resume <id> -p`, cwd recorded per session) → v3 summon path.

## The arc

| | What ships | The moment |
|---|---|---|
| **v1 — never forget** | Compaction rescue · continuity briefs · deep recall · session search | Compaction hits and Claude says: *"Restored from pre-compact snapshot — we were mid-refactor of auth.ts, you'd decided X, next step was Y"* |
| **v2 — they notice each other & talk** | Live peer briefs, named sessions, `/telepathy tell`, collision warnings | *"checkout-tests told me the User type changed — rebuilding before I continue"* |
| **v3 — summon & merge** | `/telepathy summon <name>` — pull any session, alive or dead, into this one | *"Pulled 'auth-refactor' (2h of work) in here. Next step was the refresh endpoint. Continue?"* |

Each stage stands alone. v1 must earn strangers' stars before v2 is built. The index built in v1 *is* the v2 registry and the v3 summon source — no rewrites.

---

## What the output looks like (v1)

### Compaction rescue — the headline moment

```
[context compacted]

⏺ Telepathy restored my working state from the pre-compact snapshot:
  · Task: migrating payment webhooks to the new queue
  · Decided: keep idempotency keys in Redis (you rejected DB unique-index)
  · Files in flight: src/webhooks/handler.ts (half-edited), queue.config.ts
  · Next step we'd planned: add the retry backoff, then run the integration tests
  Full pre-compact transcript: telepathy show 4f2a
  Continuing with the retry backoff.
```

### Continuity brief — every fresh session starts knowing

```
── TELEPATHY · CONTINUITY ────────────────────────────────
Last session here: 2h ago · "payment webhook migration" (4f2a)
  · fixed Redis pool exhaustion by capping maxRetriesPerRequest
  · decided: idempotency keys in Redis, not DB
  · left off: retry backoff unimplemented, integration tests failing (2)
Older: "webhook spike" 3d ago (91c0) · 12 more: telepathy list
──────────────────────────────────────────────────────────
```

### Deep recall — on demand, from your own transcripts

```
> /telepathy recall how did we fix the Redis connection issue last week

⏺ Found it — session "redis-pool-debug", June 24 (a83d):
  The pool was exhausting because maxRetriesPerRequest defaulted to 20
  under BullMQ. You capped it to 3 and set enableOfflineQueue: false in
  src/lib/redis.ts:14. Tests went green after. Want the full excerpt?
```

### Session search — the free feature

```
$ telepathy find "supplier onboarding"
  4 sessions match:
  ● kb-notes            ~/Knowledge Base      41m ago   "summarize supplier docs"
  ● supplier-flow       cs-bot                3d ago    "onboarding email sequence"
  ...
$ telepathy show supplier-flow        # digest, decisions, files touched
```

### v2/v3 previews — peer brief, tell, summon — unchanged from rev 1 (see arc table).

---

## How it's built (v1)

**Same two-path rule as rev 1: heavy work on the write path, near-zero on the read path.**

```
WRITE PATH (each session's own hooks — no daemon, no broker)
 PostToolUse  ──► activity index (files, tasks) — cheap, throttled
 PreCompact   ──► SNAPSHOT: working state extract (task, decisions, files in flight)
 PostCompact  ──► capture compact_summary + link snapshot ←→ session
 SessionEnd   ──► finalize session digest (fold in native summary.md if present)
        │
        ▼
 SQLite (~/.claude-telepathy/index.db, WAL) + FTS5 full-text over
 digests/decisions/excerpts        ← v2 registry & v3 summon source later
        │  re-render per-project continuity brief on every write
        ▼
 flat file per project (atomic write-temp+rename)

READ PATH (one tiny compiled binary — no Node spawn, no DB writes, <50ms p95)
 SessionStart (source=startup|resume) ──► inject continuity brief
 SessionStart (source=compact) + PostCompact ──► inject rescue brief
 /telepathy recall|find|show ──► on-demand FTS query (user-invoked; latency budget relaxed)
```

Load-bearing facts (verified against source):

- Injection via `hookSpecificOutput.additionalContext` on `SessionStart` (which reports `source: startup|resume|clear|compact` — we branch on it). Top-level JSON keys are silently ignored; the envelope is mandatory.
- `PostCompact` payload includes `compact_summary`; `PreCompact` includes `trigger` — both verified in the hook schemas.
- Read path: no Node cold start (30–80ms) on the hot path — pre-rendered flat file + compiled binary, as before.
- **Fail-open, always:** read-path hooks exit 0 unconditionally; broken telepathy degrades to "telepathy doesn't exist."
- **Token discipline:** continuity brief capped (~10 lines); everything deeper is on-demand. This is the anti-claude-mem stance.
- **Subagent safety:** filter sidechain transcripts; dedupe by root session_id.
- Native `summary.md` and ai-titles are read when present (free quality), never required (feature-gated).

**Install:** `npx claude-telepathy install` → hooks into `~/.claude/settings.json` + backfills the index from existing transcripts (**instant value: your history works day one**). Uninstall removes hooks cleanly, leaves the index.

**Honest limitations (README):** recall quality bounded by what transcripts capture; per-machine (no sync in v1); sessions older than Claude's 30-day cleanup are gone unless telepathy was installed (we then retain digests independently).

## Competitive position

| | claude-mem / mem0 | native auto-memory | **telepathy v1** |
|---|---|---|---|
| Compaction rescue | ✗ | ✗ | **✓ (the wedge — nobody does this)** |
| Zero config / auto-fire | partial / ✗ (MCP must be called) | ✓ | ✓ (hooks) |
| Token cost | high (always-loaded) | 200-line cap | tiny brief + on-demand |
| Source of truth | own store you must build | own notes | **your existing transcripts, backfilled** |
| Repo litter | CLAUDE.md files everywhere | ✗ | ✗ |
| Cross-session live awareness | ✗ | ✗ | v2 |
| Summon/merge | ✗ | ✗ | v3 |

## Build plan

1. **Spike (~1-2h):** parse own transcripts (cwd/branch/files/prompts extractable — includes sidechain + compact entries); **fire a real compaction and capture PreCompact/PostCompact payloads**; read a `summary.md`. De-risks everything.
2. Reserve npm name (`claude-telepathy@0.0.1` placeholder) → repo init, TS scaffold, CI.
3. Index: schema + FTS5 + transcript backfill (`telepathy index` = also the demo of instant value).
4. Write path: PostToolUse activity + SessionEnd digest; verify with 2 live sessions.
5. **Compaction rescue:** PreCompact snapshot + PostCompact link + SessionStart(source=compact) injection. The headline feature.
6. Continuity brief: SessionStart(startup|resume) injection; p95 measured including spawn.
7. `telepathy find/show/recall` CLI + `/telepathy` slash command.
8. Fail-open hardening (kill DB mid-session, zero prompt failures) + token-budget audit of the brief.
9. **The rescue trial:** 10 forced compactions mid-task; rescue brief restores task+next-step 10/10; Claude visibly continues correctly ≥8/10.
10. README (GIF: compaction hits → Claude carries on like nothing happened) → publish → launch post.

## Success criteria

- Install on a machine with existing history → `telepathy find` answers a real question from last week within 60s of install (backfill works).
- Rescue trial: 10/10 briefs correct, ≥8/10 visible correct continuations.
- Fresh-session continuity brief <50ms p95 injection incl. spawn; brief ≤10 lines; zero hook-caused prompt failures.
- README GIF ≤20s: compaction fires mid-task, Claude continues with restored state.
- ≥1 stranger issue/PR + one "this fixed the 50-first-dates thing" class of comment in the wild.

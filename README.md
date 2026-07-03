# claude-telepathy

**One brain for all your Claudes.** Every Claude Code session — running, ended, or compacted — becomes a mind your current session can read.

> claude-mem gives Claude a diary.
> telepathy gives your Claudes one brain.

*Status: building v1 — compaction rescue, continuity briefs, recall. Design: [DESIGN.md](DESIGN.md).*

## Why

- **Compaction destroys your working context** ("50 first dates", "the dumb zone") — and the full transcript is still sitting on disk with no pointer back to it.
- **Every new session is an amnesiac** — you re-explain decisions your other sessions already made.
- The fix requires nothing new: Claude Code already writes everything to `~/.claude/projects/`. Telepathy indexes it and wires it back in through official hooks — automatically, zero config.

## Install

```bash
npx claude-telepathy install   # wires hooks + backfills your existing history (seconds)
```

Restart running sessions once; every session after that participates automatically.

```bash
telepathy list                 # your sessions, all projects
telepathy find "redis retry"   # full-text recall across everything you and Claude ever did
telepathy uninstall            # removes hooks cleanly; keeps the index
```

## What v1 does

1. **Compaction rescue** — `PreCompact` snapshots your working state; after compaction the session gets it back: task, decisions, files in flight, next step.
2. **Continuity briefs** — every fresh session starts knowing what the last session here did.
3. **Recall & search** — `telepathy find` / `/telepathy recall` answer "how did we fix that last week?" from your own transcripts.

Principles: hook-enforced (never prose Claude can ignore) · retrieval-on-demand (no token bloat) · zero files in your repos · transcripts are the store (nothing to build up).

## Honest limitations

Bash-mediated edits are recorded coarsely. Per-machine (no sync yet). Sessions deleted by Claude's 30-day cleanup are indexed only if telepathy was installed before.

---

Unofficial community tool — not affiliated with Anthropic. MIT.

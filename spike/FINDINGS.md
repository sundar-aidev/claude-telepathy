# Spike findings — 2026-07-03

**Verdict: design fully de-risked. Every load-bearing claim verified against the real system. Build.**

## Verified (evidence in `hook-captures/`, parser in `parse_transcript.py`)

1. **Transcript extraction works.** Real transcripts yield everything the brief needs: `cwd`, `gitBranch`, `sessionId`, timestamps per record; `ai-title` + `last-prompt` metadata entries (latest wins — they repeat per turn); user prompts; file edits via `Edit/Write/MultiEdit` tool_use records (143 edits / 50 distinct files extracted from one session).
2. **Backfill is trivially fast.** 29MB / 4,694-record / 6-day session parses in **0.10s**. Full local history (369MB, 158 sessions, 25 projects) ≈ a few seconds. "Your history works day one" holds.
3. **`PostCompact` delivers the goods:** payload includes **`compact_summary`** (captured live). `PreCompact` fires with `trigger` — and fires **even when compaction then aborts** ("not enough messages"), so the snapshot hook must be cheap + idempotent.
4. **`SessionStart` reports `source`** — captured all three: `startup`, `resume`, **`compact`**. The rescue brief has its exact injection point.
5. **Historical compactions are detectable in backfill:** boundary = `{type: "system", subtype: "compact_boundary", parentUuid: null, logicalParentUuid: <pre-compact-link>}` followed by a `user` record with `isCompactSummary: true`. (Naive parentUuid-only heuristic is wrong — use `subtype`.)
6. **Live registry confirmed** (`~/.claude/sessions/<pid>.json`): pid, sessionId, cwd, status busy/idle, `version`, and **`name` + `nameSource: "derived"`** — Claude Code already auto-derives session names; telepathy naming can seed from it. Note: no `messagingSocketPath` on this build (UDS feature-gated off) — v2 transport needs the fallback path (file mailbox / SendMessage-less injection), as designed.
7. **Hooks work headlessly** (`claude -p --settings <json>`): full harness reproducible in CI. `--resume <id>` from the session's own cwd works; a one-turn resume costs one model call.

## Watch-outs for the build

- `summary.md` session-memory: **absent on this machine** (feature-gated). Design already treats it as optional garnish — correct.
- This machine runs a 1M-context model → compaction is rare *here*; the 200k-context majority compacts constantly. Test rig must force compaction via `/compact` (works headlessly, verified).
- Metadata entries (`ai-title`, `last-prompt`) repeat hundreds of times per transcript — read from tail, not head.
- Subagent `PreToolUse`/`PostToolUse` firing: not yet tested (v2 concern — collision guard moved out of v1). Sidechain filtering via `isSidechain` field confirmed present.

## Artifacts

- `parse_transcript.py` — working extractor (schema-verified on 3 real transcripts)
- `hook-captures/*.jsonl` — live payloads: SessionStart (startup/resume/compact), SessionEnd, PreCompact, PostCompact w/ compact_summary
- `hooks-settings.json` — reusable headless capture harness

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// rescue.ts resolves the briefs dir from TELEPATHY_DIR at call time, so point it
// at a temp dir BEFORE importing anything that reads it.
const tmp = mkdtempSync(join(tmpdir(), "telepathy-rescue-"));
process.env.TELEPATHY_DIR = tmp;

const { rescueOutput } = await import("../src/core/rescue.js");
const { rescueBriefPath, briefsDir } = await import("../src/core/paths.js");

const SID = "82ca32b1-c970-4497-9a09-5e9bea434472";
beforeAll(() => {
  mkdirSync(briefsDir(), { recursive: true });
  writeFileSync(rescueBriefPath(SID), "── RESCUE ──\nTask: fix auth timeout\n");
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("rescueOutput (read path)", () => {
  it("emits the brief for a compact SessionStart with a snapshot", () => {
    const out = rescueOutput({
      hook_event_name: "SessionStart",
      source: "compact",
      session_id: SID,
    });
    expect(out).not.toBeNull();
    const parsed = JSON.parse(out as string);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(parsed.hookSpecificOutput.additionalContext).toContain("fix auth timeout");
  });

  it("stays silent on a normal (non-compact) start", () => {
    expect(
      rescueOutput({ hook_event_name: "SessionStart", source: "startup", session_id: SID }),
    ).toBeNull();
  });

  it("stays silent when no snapshot exists for the session", () => {
    expect(
      rescueOutput({ hook_event_name: "SessionStart", source: "compact", session_id: "unknown" }),
    ).toBeNull();
  });

  it("stays silent on unrelated events and never throws", () => {
    expect(rescueOutput({ hook_event_name: "PostToolUse" })).toBeNull();
    expect(() => rescueOutput({})).not.toThrow();
  });

  it("cannot be tricked into reading outside the briefs dir", () => {
    // path traversal in session_id must be neutralized by paths.sanitize
    expect(rescueBriefPath("../../etc/passwd")).toContain(briefsDir());
    expect(rescueBriefPath("../../etc/passwd")).not.toContain("etc/passwd");
  });
});

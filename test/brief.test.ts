import { describe, expect, it } from "vitest";
import { renderRescueBrief } from "../src/core/brief.js";
import type { SessionDigest } from "../src/core/types.js";

function digest(over: Partial<SessionDigest>): Partial<SessionDigest> {
  return {
    sessionId: "82ca32b1-c970-4497-9a09-5e9bea434472",
    gitBranch: "fix/auth-timeout",
    promptCount: 4,
    filesEdited: ["/repo/src/retry.config.ts", "/repo/src/auth.ts"],
    ...over,
  };
}

describe("renderRescueBrief", () => {
  it("leads with the task, not the last thing typed (the 2026-07-03 bug)", () => {
    // The exact failure the live demo surfaced: a bulk mid-session prompt must
    // NOT be presented as the task.
    const brief = renderRescueBrief(
      digest({
        aiTitle: null,
        firstPrompt:
          "You are fixing an auth login timeout bug. Cap retries from 20 to 3 and add a login timeout.",
        lastPrompt: "Write another 300 words on AbortController.",
      }),
    );
    expect(brief).toContain("Task: You are fixing an auth login timeout bug");
    // the misleading last prompt is labeled honestly, never as the task
    expect(brief).not.toMatch(/Task:.*300 words/);
    expect(brief).toContain("Most recent step: Write another 300 words");
  });

  it("prefers aiTitle over firstPrompt when present", () => {
    const brief = renderRescueBrief(
      digest({ aiTitle: "Fix login timeout", firstPrompt: "long rambly original ask" }),
    );
    expect(brief).toContain("Task: Fix login timeout");
  });

  it("shows basenames + scope, hides a redundant recent line", () => {
    const brief = renderRescueBrief(
      digest({ aiTitle: "Same", firstPrompt: "x", lastPrompt: "Same" }),
    );
    expect(brief).toContain("Files in flight: retry.config.ts, auth.ts");
    expect(brief).toContain("branch fix/auth-timeout · 2 file(s) touched · 4 turns");
    expect(brief).not.toContain("Most recent step"); // equal to task → suppressed
  });

  it("never throws on an empty digest (fail-open contract)", () => {
    expect(() => renderRescueBrief({})).not.toThrow();
    expect(renderRescueBrief({})).toContain("unknown");
  });
});

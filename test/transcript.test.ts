import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseTranscript } from "../src/core/transcript.js";
import { findSessions, listSessions, openStore, upsertDigest } from "../src/db/store.js";

const FIXTURE = join(__dirname, "fixtures", "sample-session.jsonl");
const tmp = mkdtempSync(join(tmpdir(), "telepathy-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("parseTranscript (schemas spike-verified 2026-07-03)", () => {
  it("extracts the full digest from a realistic transcript", async () => {
    const d = await parseTranscript(FIXTURE);
    expect(d.sessionId).toBe("sample-session");
    expect(d.cwd).toBe("/tmp/demo-repo");
    expect(d.gitBranch).toBe("fix/login-timeout");
    expect(d.firstPrompt).toContain("login timeout bug");
    expect(d.lastPrompt).toContain("integration tests");
    expect(d.promptCount).toBe(3); // sidechain + compact-summary records excluded
    expect(d.filesEdited).toEqual([
      "/tmp/demo-repo/src/auth/session.ts", // deduped across two edits
      "/tmp/demo-repo/retry.config.ts",
    ]);
    expect(d.aiTitle).toBe("Fix login timeout and retry config"); // last one wins
    expect(d.compactions).toBe(1); // subtype: compact_boundary
    expect(d.lastCompactSummary).toContain("capping retries");
    expect(d.sidechainRecords).toBe(1);
  });

  it("survives malformed lines (fail-open)", async () => {
    // Fixture's final line is intentionally broken JSON; parse must not throw.
    await expect(parseTranscript(FIXTURE)).resolves.toBeTruthy();
  });
});

describe("store", () => {
  it("upserts digests and answers list + FTS find", async () => {
    const db = openStore(join(tmp, "index.db"));
    upsertDigest(db, await parseTranscript(FIXTURE));
    upsertDigest(db, await parseTranscript(FIXTURE)); // idempotent

    const rows = listSessions(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ai_title).toBe("Fix login timeout and retry config");

    // recall via digest content and via compact summary
    expect(findSessions(db, "login timeout")).toHaveLength(1);
    expect(findSessions(db, "capping retries")).toHaveLength(1);
    // FTS punctuation injection must not throw
    expect(() => findSessions(db, 'weird "quotes" AND (syntax')).not.toThrow();
    db.close();
  });
});

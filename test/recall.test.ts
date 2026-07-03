import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bestExcerpt } from "../src/core/recall.js";

const tmp = mkdtempSync(join(tmpdir(), "telepathy-recall-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function transcript(lines: object[]): string {
  const p = join(tmp, `${Math.abs(hash(JSON.stringify(lines)))}.jsonl`);
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n"));
  return p;
}
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
const assistant = (text: string, sidechain = false) => ({
  type: "assistant",
  isSidechain: sidechain,
  message: { role: "assistant", content: [{ type: "text", text }] },
});

describe("bestExcerpt (recall)", () => {
  it("returns the answer with the most term hits", async () => {
    const p = transcript([
      assistant("Something unrelated about caching."),
      assistant("The Redis pool was exhausting because maxRetriesPerRequest defaulted to 20."),
      assistant("Redis is a key-value store."),
    ]);
    const ex = await bestExcerpt(p, ["redis", "pool", "maxRetriesPerRequest"]);
    expect(ex).toContain("maxRetriesPerRequest defaulted to 20");
  });

  it("ignores subagent (sidechain) messages", async () => {
    const real = "The real answer here mentions redis exactly once in this full sentence.";
    const p = transcript([
      assistant("REDIS REDIS REDIS from a subagent that must be ignored entirely", true),
      assistant(real),
    ]);
    expect(await bestExcerpt(p, ["redis"])).toBe(real);
  });

  it("skips trivial one-liners in favor of substance", async () => {
    const p = transcript([
      assistant("redis"), // 6 chars, below the 40-char substance floor
      assistant("The redis connection was fixed by capping retries to three in the config."),
    ]);
    const ex = await bestExcerpt(p, ["redis"]);
    expect(ex).toContain("capping retries");
  });

  it("returns null when nothing matches", async () => {
    const p = transcript([assistant("nothing relevant here at all")]);
    expect(await bestExcerpt(p, ["kubernetes"])).toBeNull();
  });
});

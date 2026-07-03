/**
 * claude-telepathy read path. Runs on EVERY session start (and later every
 * prompt), so it must be brutally fast: synchronous stdin, a single flat-file
 * read, zero DB, zero native addons. Compiled to a standalone binary with
 * `bun build --compile` (~17ms warm vs ~67ms for node); falls back to plain
 * `node dist/read.js` when the binary isn't present.
 *
 * Contract: exit 0 no matter what. No brief file → emit nothing.
 */
import { readFileSync } from "node:fs";
import { rescueOutput } from "./core/rescue.js";

function run(): void {
  let raw: string;
  try {
    raw = readFileSync(0, "utf8"); // fd 0 = stdin, read fully & synchronously
  } catch {
    process.exit(0);
  }
  try {
    const out = rescueOutput(JSON.parse(raw));
    if (out) process.stdout.write(out);
  } catch {
    // fail-open: malformed payload → inject nothing
  }
  process.exit(0);
}

run();

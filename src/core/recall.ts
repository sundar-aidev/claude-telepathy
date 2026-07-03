import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/**
 * Pull the single most relevant assistant answer from a past transcript for the
 * given search terms. This is what turns "find a session" into "get the answer
 * back" — the antidote to re-explaining what a previous session already solved.
 */
export async function bestExcerpt(transcriptPath: string, terms: string[]): Promise<string | null> {
  const needles = terms.map((t) => t.toLowerCase()).filter(Boolean);
  if (needles.length === 0) return null;

  let best: string | null = null;
  let bestScore = 0;
  const rl = createInterface({
    input: createReadStream(transcriptPath),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const line of rl) {
    if (!line) continue;
    let r: any;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (r.type !== "assistant" || r.isSidechain) continue;
    const content = r.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type !== "text" || typeof block.text !== "string") continue;
      const score = termScore(block.text.toLowerCase(), needles);
      // Prefer substantive answers, not one-line acknowledgements.
      if (score > bestScore && block.text.trim().length > 40) {
        bestScore = score;
        best = block.text.trim();
      }
    }
  }
  return best;
}

function termScore(haystack: string, needles: string[]): number {
  let score = 0;
  for (const w of needles) {
    let i = haystack.indexOf(w);
    while (i >= 0) {
      score++;
      i = haystack.indexOf(w, i + w.length);
    }
  }
  return score;
}

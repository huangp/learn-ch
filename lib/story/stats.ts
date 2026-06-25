// Reader-facing story metadata (character count, reading-time estimate, unknown chars).
// Pure + synchronous — counts Han characters in a story body and diffs them against the
// learner's known set. No DB/network; the caller supplies the known-char set.

const HAN = /\p{Script=Han}/u;

// Graded-reader reading pace for teen learners (chars/min). A rough estimate for the
// "~N min read" hint — deliberately conservative vs. native adult speed (~300+).
export const READING_CHARS_PER_MIN = 150;

export interface StoryStats {
  /** Total Han characters in the body (punctuation/spaces excluded). */
  charCount: number;
  /** Distinct Han characters. */
  uniqueCharCount: number;
  /** Distinct Han chars the learner doesn't know yet, in first-appearance order. */
  unknownChars: string[];
  /** Estimated reading time in whole minutes (≥1). */
  readingMinutes: number;
}

export function computeStoryStats(hanzi: string, knownChars: Set<string>): StoryStats {
  let charCount = 0;
  const seen = new Set<string>();
  const unknownChars: string[] = [];
  for (const ch of hanzi) {
    if (!HAN.test(ch)) continue;
    charCount++;
    if (seen.has(ch)) continue;
    seen.add(ch);
    if (!knownChars.has(ch)) unknownChars.push(ch);
  }
  return {
    charCount,
    uniqueCharCount: seen.size,
    unknownChars,
    readingMinutes: Math.max(1, Math.round(charCount / READING_CHARS_PER_MIN)),
  };
}

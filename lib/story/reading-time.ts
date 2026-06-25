// Estimated reading time for a story (§11), shown on the list cards. Derived from the
// story's Han-char count — NOT actual on-screen dwell — so it's a pure, stable hint of how
// long a story will take. Graded-reader pace for teens (11–15); tunable.

export const READING_CHARS_PER_MIN = 90;

const HAN = /\p{Script=Han}/gu;

/** Estimated minutes to read `hanzi`, floored at 1 (stories run ~60–120 chars). */
export function estimateReadingMinutes(hanzi: string): number {
  const chars = (hanzi.match(HAN) ?? []).length;
  return Math.max(1, Math.ceil(chars / READING_CHARS_PER_MIN));
}

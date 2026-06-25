import { describe, expect, test } from 'vitest';
import { computeStoryStats, READING_CHARS_PER_MIN } from './stats';

describe('computeStoryStats', () => {
  test('counts Han chars, ignoring punctuation/spaces/latin', () => {
    const s = computeStoryStats('你好，世界！ ok', new Set(['你', '好', '世', '界']));
    expect(s.charCount).toBe(4);
    expect(s.uniqueCharCount).toBe(4);
  });

  test('charCount counts repeats; uniqueCharCount does not', () => {
    const s = computeStoryStats('好好好', new Set(['好']));
    expect(s.charCount).toBe(3);
    expect(s.uniqueCharCount).toBe(1);
  });

  test('unknownChars = distinct Han chars not in the known set, in first-appearance order', () => {
    const s = computeStoryStats('我念书，念念', new Set(['我', '书']));
    // 念 unknown (appears 3×, listed once); 我/书 known
    expect(s.unknownChars).toEqual(['念']);
  });

  test('reading time rounds to whole minutes, floored at 1', () => {
    expect(computeStoryStats('好', new Set()).readingMinutes).toBe(1);
    const long = '好'.repeat(READING_CHARS_PER_MIN * 2);
    expect(computeStoryStats(long, new Set(['好'])).readingMinutes).toBe(2);
  });
});

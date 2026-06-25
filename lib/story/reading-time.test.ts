import { describe, expect, test } from 'vitest';
import { estimateReadingMinutes, READING_CHARS_PER_MIN } from './reading-time';

describe('estimateReadingMinutes', () => {
  test('floors at 1 minute for empty / tiny bodies', () => {
    expect(estimateReadingMinutes('')).toBe(1);
    expect(estimateReadingMinutes('好')).toBe(1);
  });

  test('scales with Han-char count at the configured rate', () => {
    const body = '好'.repeat(READING_CHARS_PER_MIN + 1); // just over one minute → rounds up to 2
    expect(estimateReadingMinutes(body)).toBe(2);
    expect(estimateReadingMinutes('好'.repeat(READING_CHARS_PER_MIN * 2))).toBe(2);
  });

  test('ignores punctuation, digits and latin', () => {
    const han = '好'.repeat(45);
    expect(estimateReadingMinutes(han + '，。!? abc 123'.repeat(5))).toBe(estimateReadingMinutes(han));
  });
});

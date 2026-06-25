import { describe, expect, test } from 'vitest';
import { deriveLengthBand } from './length';

// §15 #4 length curve (docs/story_length.md). Pure — no DB.

describe('deriveLengthBand', () => {
  test('returns each anchor band at its known-char count', () => {
    expect(deriveLengthBand(80)).toEqual({ min: 40, max: 80 });
    expect(deriveLengthBand(150)).toEqual({ min: 100, max: 200 });
    expect(deriveLengthBand(300)).toEqual({ min: 250, max: 400 });
    expect(deriveLengthBand(500)).toEqual({ min: 400, max: 650 });
    expect(deriveLengthBand(900)).toEqual({ min: 600, max: 950 });
    expect(deriveLengthBand(1350)).toEqual({ min: 900, max: 1300 });
    expect(deriveLengthBand(2000)).toEqual({ min: 1300, max: 1800 });
  });

  test('clamps below the first and above the last anchor', () => {
    expect(deriveLengthBand(0)).toEqual({ min: 40, max: 80 });
    expect(deriveLengthBand(30)).toEqual({ min: 40, max: 80 });
    expect(deriveLengthBand(5000)).toEqual({ min: 1300, max: 1800 });
  });

  test('interpolates between anchors', () => {
    // 225 is halfway between the 150 ({100,200}) and 300 ({250,400}) rows.
    expect(deriveLengthBand(225)).toEqual({ min: 180, max: 300 });
  });

  test('min <= max and both ends are monotonic non-decreasing across a sweep', () => {
    let prevMin = -1;
    let prevMax = -1;
    for (let known = 0; known <= 2500; known += 25) {
      const { min, max } = deriveLengthBand(known);
      expect(min).toBeLessThanOrEqual(max);
      expect(min).toBeGreaterThanOrEqual(prevMin);
      expect(max).toBeGreaterThanOrEqual(prevMax);
      prevMin = min;
      prevMax = max;
    }
  });
});

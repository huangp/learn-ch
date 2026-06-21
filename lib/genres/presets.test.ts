import { describe, expect, test } from 'vitest';
import { GENRES, getGenre } from './presets';

describe('genre presets (§17.1)', () => {
  test('every preset has the required fields', () => {
    for (const g of GENRES) {
      expect(g.id).toBeTruthy();
      expect(g.label).toBeTruthy();
      expect(g.emoji).toBeTruthy();
      expect(g.blurb).toBeTruthy();
      expect(g.promptInstruction.length).toBeGreaterThan(10);
    }
  });

  test('ids are unique', () => {
    const ids = GENRES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('getGenre resolves known ids and rejects unknown/empty', () => {
    expect(getGenre('mystery')?.label).toBe('mystery');
    expect(getGenre('nope')).toBeUndefined();
    expect(getGenre(undefined)).toBeUndefined();
    expect(getGenre(null)).toBeUndefined();
    expect(getGenre('')).toBeUndefined();
  });
});

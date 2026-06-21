import { describe, expect, test } from 'vitest';
import { STORY_SEEDS, getStorySeed, seedsBySource } from './presets';

describe('story seed presets (§17.2)', () => {
  test('every preset has the required fields and ordered beats', () => {
    for (const s of STORY_SEEDS) {
      expect(s.id).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.titleEn).toBeTruthy();
      expect(s.setting).toBeTruthy();
      expect(s.characters.length).toBeGreaterThan(0);
      expect(s.beats.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('ids are unique', () => {
    const ids = STORY_SEEDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every `work` seed carries the public-domain gate + attribution (copyright rule)', () => {
    for (const s of STORY_SEEDS.filter((s) => s.source === 'work')) {
      expect(s.publicDomain).toBe(true);
      expect(s.attribution && s.attribution.length).toBeTruthy();
    }
  });

  test('allowNames chars appear in their seed title or are real hanzi proper nouns', () => {
    for (const s of STORY_SEEDS) {
      for (const name of s.allowNames ?? []) expect(name.length).toBeGreaterThan(0);
    }
  });

  test('getStorySeed resolves known ids and rejects unknown/empty', () => {
    expect(getStorySeed('mulan')?.source).toBe('history');
    expect(getStorySeed('nope')).toBeUndefined();
    expect(getStorySeed(undefined)).toBeUndefined();
    expect(getStorySeed(null)).toBeUndefined();
    expect(getStorySeed('')).toBeUndefined();
  });

  test('seedsBySource partitions every seed exactly once', () => {
    const g = seedsBySource();
    expect(g.authored.length + g.history.length + g.work.length).toBe(STORY_SEEDS.length);
    expect(g.work.every((s) => s.source === 'work')).toBe(true);
  });
});

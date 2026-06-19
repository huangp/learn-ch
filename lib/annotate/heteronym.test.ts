import { describe, expect, test } from 'vitest';
import { candidatesFor, isHardCase, SAFE_PARTICLES } from './heteronym.js';

describe('candidatesFor', () => {
  test('polyphonic chars return multiple readings', () => {
    expect(candidatesFor('行').length).toBeGreaterThan(1);
    expect(candidatesFor('还')).toEqual(expect.arrayContaining(['hái', 'huán']));
    expect(candidatesFor('重')).toEqual(expect.arrayContaining(['zhòng', 'chóng']));
    expect(candidatesFor('长')).toEqual(expect.arrayContaining(['cháng', 'zhǎng']));
  });
  test('monophonic chars return a single reading', () => {
    expect(candidatesFor('饭')).toEqual(['fàn']);
    expect(candidatesFor('银')).toEqual(['yín']);
  });
});

describe('isHardCase', () => {
  test('true when pinyin-pro stayed on a heteronym default (the 还书→hái failure)', () => {
    expect(candidatesFor('还')[0]).toBe('hái'); // default reading
    expect(isHardCase('还', 'hái')).toBe(true);
  });
  test('false when pinyin-pro moved off the default (it disambiguated by context)', () => {
    expect(candidatesFor('行')[0]).toBe('xíng');
    expect(isHardCase('行', 'háng')).toBe(false); // 银行 → háng, trusted
  });
  test('false for safe particles even on their default reading', () => {
    expect(SAFE_PARTICLES.has('的')).toBe(true);
    expect(isHardCase('的', 'de')).toBe(false);
  });
  test('false for monophonic chars', () => {
    expect(isHardCase('饭', 'fàn')).toBe(false);
  });
});

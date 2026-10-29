import { describe, expect, test } from 'vitest';
import { claimUrl, makeCode, sign } from './code';

describe('screentime code', () => {
  test('matches the shared test vector', () => {
    expect(sign('test-secret', 'jayden', 15, 'ABCDEF')).toBe('YB4NJCA4');
    expect(makeCode('test-secret', 'jayden', 15, 'ABCDEF')).toBe('15-ABCDEF-YB4NJCA4');
  });

  test('mints a fresh base32 nonce when none is given', () => {
    expect(makeCode('s', 'amelia', 10)).toMatch(/^10-[A-Z2-7]{6}-[A-Z2-7]{8}$/);
  });

  test('rejects minutes outside 1-240', () => {
    expect(() => makeCode('s', 'amelia', 0)).toThrow(RangeError);
    expect(() => makeCode('s', 'amelia', 241)).toThrow(RangeError);
  });

  test('builds the claim link', () => {
    expect(claimUrl('jayden', '15-ABCDEF-YB4NJCA4')).toBe('http://screentime.lan/claim?kid=jayden&code=15-ABCDEF-YB4NJCA4');
  });
});

import { describe, expect, test } from 'vitest';
import { checkCoverage } from './coverage.js';

// A generous known set so global/per-sentence coverage is high unless we deliberately break it.
const known = new Set([...'我你他是的有一个人去了在这那好朋友和很大小天天天看见说话来回家学校书']);

describe('checkCoverage (§8.3)', () => {
  test('targets meeting ≥K, due present, high coverage → ok', () => {
    // 兰 appears 2×, spread across two sentences; 朋 is due and present. Sentences are
    // known-char-dense so both the global and per-sentence floors clear.
    const body = '我和你他去学校看书的朋兰。我和你他去学校看书的兰。';
    const r = checkCoverage(body, { known, targets: ['兰'], due: ['朋'], k: 2 });
    expect(r.targetsMissing).toEqual([]);
    expect(r.dueMissing).toEqual([]);
    expect(r.knownCoverage).toBeGreaterThanOrEqual(0.9);
    expect(r.ok).toBe(true);
  });

  test('target appearing fewer than K times is flagged', () => {
    const body = '兰是我的朋友。我去学校。';
    const r = checkCoverage(body, { known, targets: ['兰'], k: 2 });
    expect(r.targetsMissing).toEqual(['兰']);
    expect(r.targetCoverage).toBe(0);
    expect(r.ok).toBe(false);
  });

  test('missing due char is flagged', () => {
    const body = '兰是兰的朋友。我和兰看书。';
    const r = checkCoverage(body, { known, targets: ['兰'], due: ['校'], k: 2 });
    expect(r.dueMissing).toEqual(['校']);
    expect(r.ok).toBe(false);
  });

  test('a single low-coverage sentence fails even when the global average is fine', () => {
    // Second sentence is dense with unknown chars (爱情仇恨魔法龙).
    const body = '我和朋友去学校看书。爱情仇恨魔法龙兰。';
    const r = checkCoverage(body, { known, targets: ['兰'], k: 1 });
    expect(r.lowCoverageSentences.length).toBeGreaterThan(0);
    expect(r.perSentenceMin).toBeLessThan(0.85);
    expect(r.ok).toBe(false);
  });

  test('target met ≥2× but all in one sentence is flagged as clustered', () => {
    const body = '兰兰是我的朋友。我去学校看书。';
    const r = checkCoverage(body, { known, targets: ['兰'], k: 2 });
    expect(r.clusteredTargets).toEqual(['兰']);
    expect(r.ok).toBe(false);
  });

  test('bootstrap mode skips the global known-coverage gate', () => {
    // Low known coverage, but every non-target char IS allowed; targets met & spread.
    const body = '兰去。兰来。';
    const strict = checkCoverage(body, { known: new Set(['去', '来']), targets: ['兰'], k: 2 });
    expect(strict.ok).toBe(false); // global coverage too low
    const boot = checkCoverage(body, { known: new Set(['去', '来']), targets: ['兰'], k: 2, bootstrap: true });
    expect(boot.ok).toBe(true);
  });
});

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../lib/test-utils.js';
import { createLlmProvider } from '../lib/llm/index.js';
import { validateChars } from '../lib/generation/validate.js';
import { checkCoverage } from '../lib/generation/coverage.js';
import { KNOWN_COVERAGE_FLOOR } from '../lib/generation/constants.js';
import { generateForProfile, type ProfileRun } from './run-profile.js';

// End-to-end integration test against the REAL LLM. Gated on ANTHROPIC_API_KEY so the
// default offline `pnpm test` stays green; run with the key exported (`pnpm test:integration`).
// One real generation (~30s).

const hasKey = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!hasKey)('generateForProfile — real LLM end to end', () => {
  let t: TestDb;
  let run: ProfileRun;

  beforeAll(async () => {
    t = makeTestDb();
    const llm = createLlmProvider();
    run = await generateForProfile(t.db, llm, { method: 'hsk', hsk: 3, targets: 2, due: 2, theme: 'mystery' });
  }, 120_000);
  afterAll(() => t.cleanup());

  test('returns a non-empty hanzi story', () => {
    expect(run.story.body.length).toBeGreaterThan(0);
    expect(run.story.title.length).toBeGreaterThan(0);
  });

  test('body uses only allowed characters (no evasions)', () => {
    const v = validateChars(run.story.body, run.info.allowedChars);
    expect(v.ok).toBe(true);
  });

  test('coverage gate passes: targets met, due present, coverage ≥ floor', () => {
    const known = new Set([...run.info.allowedChars]);
    for (const c of run.info.targetChars) known.delete(c);
    const cov = checkCoverage(run.story.body, {
      known,
      targets: run.info.targetChars,
      due: run.info.dueChars,
      band: KNOWN_COVERAGE_FLOOR,
    });
    expect(cov.ok).toBe(true);
    expect(run.meta.targetCoverage).toBeGreaterThanOrEqual(1);
  });
});

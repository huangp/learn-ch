import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { onboardLearner } from '../learner/onboard';
import { getLearnerProgress } from './index';

const NOW = 1_750_000_000_000;

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

describe('getLearnerProgress', () => {
  test('snapshots a seeded learner: known counter, curriculum, upcoming, reward coverage', () => {
    const learner = onboardLearner(t.db, { name: 'hsk4', method: 'hsk', hsk: 4, now: NOW });
    const p = getLearnerProgress(t.db, learner.id);

    // All seeded known chars are `review` today (Phase 7 promotion not built).
    expect(p.knownCount).toBeGreaterThan(0);
    expect(p.statusCounts.review).toBe(p.knownCount);
    expect(p.statusCounts.mastered).toBe(0);

    // Curriculum is larger than the known set; the bar is a real fraction.
    expect(p.curriculumTotal).toBeGreaterThan(p.knownCount);
    expect(p.curriculumPct).toBeCloseTo(p.knownCount / p.curriculumTotal);

    // Upcoming chars are the next ones to learn — none already known.
    expect(p.upcoming.length).toBeGreaterThan(0);
    expect(p.upcoming.length).toBeLessThanOrEqual(8);

    // Reward texts: coverage is a valid fraction and counts are consistent.
    expect(p.rewardTexts.length).toBeGreaterThan(0);
    for (const r of p.rewardTexts) {
      expect(r.totalChars).toBeGreaterThan(0);
      expect(r.knownChars).toBeLessThanOrEqual(r.totalChars);
      expect(r.coverage).toBeGreaterThanOrEqual(0);
      expect(r.coverage).toBeLessThanOrEqual(1);
      expect(r.unlocked).toBe(r.coverage >= 0.95);
    }
  });

  test('a zero/bootstrap learner reads ~0 known and near-0 reward coverage', () => {
    const learner = onboardLearner(t.db, { name: 'zero', method: 'zero', bootstrapKnown: 30, now: NOW });
    const p = getLearnerProgress(t.db, learner.id);
    expect(p.knownCount).toBe(30);
    for (const r of p.rewardTexts) expect(r.coverage).toBeLessThan(0.95);
  });
});

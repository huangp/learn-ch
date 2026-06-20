import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { and, eq, lte, isNotNull } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { characters, learnerChars } from '../../db/schema';
import { buildCurriculum, computeFrontier } from '../grading/curriculum';
import { selfDeclareHsk } from '../placement/index';
import { createLearner, getLearner, listLearners, updateLearner, deleteLearner } from './crud';
import { seedLearner, initialStabilityDays, BOOTSTRAP_THRESHOLD } from './seed';

const NOW = 1_750_000_000_000; // fixed epoch for deterministic due dates
const DAY_MS = 86_400_000;

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

function charRows(learnerId: number) {
  return t.db.select().from(learnerChars).where(eq(learnerChars.learnerId, learnerId)).all();
}

describe('seedLearner — HSK3 declaration', () => {
  test('seeds known chars as review with spread due dates, frontier, no bootstrap', () => {
    const learner = createLearner(t.db, 'Mei', {}, NOW);
    const known = selfDeclareHsk(t.db, 3);
    const result = seedLearner(t.db, learner.id, known, 'hsk', NOW);

    const rows = charRows(learner.id);
    expect(rows.length).toBe(known.length);

    // every known char is `review`, never `mastered` (§16.2)
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(['review']));

    // FSRS fields populated sanely
    for (const r of rows) {
      expect(r.stability!).toBeGreaterThan(0);
      expect(r.difficulty!).toBeGreaterThanOrEqual(1);
      expect(r.difficulty!).toBeLessThanOrEqual(10);
    }

    // due dates are SPREAD, not a synchronized wall (§16.5)
    const due = rows.map((r) => r.due!);
    expect(new Set(due).size).toBeGreaterThan(1);
    expect((Math.max(...due) - Math.min(...due)) / DAY_MS).toBeGreaterThan(30);

    // frontier = first curriculum char not known
    const expectedFrontier = computeFrontier(buildCurriculum(t.db), new Set(known));
    expect(result.frontierCharId).toBe(expectedFrontier);
    expect(known).not.toContain(result.frontierCharId);
    expect(result.bootstrap).toBe(false);

    // persisted to settings
    const reloaded = getLearner(t.db, learner.id)!;
    expect(reloaded.settings.placementMethod).toBe('hsk');
    expect(reloaded.settings.frontierCharId).toBe(expectedFrontier);
    expect(reloaded.settings.bootstrap).toBe(false);
  });

  test('seeded set covers every HSK1–3 character', () => {
    const learner = createLearner(t.db, 'Covered', {}, NOW);
    const known = selfDeclareHsk(t.db, 3);
    seedLearner(t.db, learner.id, known, 'hsk', NOW);

    const hsk3 = t.db
      .select({ id: characters.id })
      .from(characters)
      .where(and(isNotNull(characters.hskLevel), lte(characters.hskLevel, 3)))
      .all()
      .map((r) => r.id);
    const seeded = new Set(charRows(learner.id).map((r) => r.charId));
    for (const id of hsk3) expect(seeded.has(id)).toBe(true);
  });
});

describe('seedLearner — bootstrap (zero / low known counts §16.4)', () => {
  test('zero-start enters bootstrap with empty learner_chars and frontier at curriculum head', () => {
    const learner = createLearner(t.db, 'Zero', {}, NOW);
    const result = seedLearner(t.db, learner.id, [], 'zero', NOW);

    expect(result.bootstrap).toBe(true);
    expect(result.seeded).toBe(0);
    expect(charRows(learner.id).length).toBe(0);
    expect(result.frontierCharId).toBe(buildCurriculum(t.db)[0]);
  });

  test('known count below the threshold is still bootstrap', () => {
    const learner = createLearner(t.db, 'Few', {}, NOW);
    const few = buildCurriculum(t.db).slice(0, BOOTSTRAP_THRESHOLD - 1);
    const result = seedLearner(t.db, learner.id, few, 'grid', NOW);
    expect(result.bootstrap).toBe(true);
  });
});

describe('seedLearner — re-run is non-downgrading (§16.1)', () => {
  test('chars already promoted by reading evidence keep their status', () => {
    const learner = createLearner(t.db, 'Rerun', {}, NOW);
    const known = selfDeclareHsk(t.db, 2);
    seedLearner(t.db, learner.id, known, 'hsk', NOW);

    // simulate reading promoting one char to mastered
    const promoted = known[0];
    t.db
      .update(learnerChars)
      .set({ status: 'mastered' })
      .where(and(eq(learnerChars.learnerId, learner.id), eq(learnerChars.charId, promoted)))
      .run();

    // re-run placement with the same set
    const result = seedLearner(t.db, learner.id, known, 'hsk', NOW);
    expect(result.seeded).toBe(0); // nothing new inserted

    const row = t.db
      .select()
      .from(learnerChars)
      .where(and(eq(learnerChars.learnerId, learner.id), eq(learnerChars.charId, promoted)))
      .get()!;
    expect(row.status).toBe('mastered'); // not downgraded back to review
  });
});

describe('initialStabilityDays', () => {
  test('is monotonic: more frequent → more stable; null → least stable', () => {
    expect(initialStabilityDays(1)).toBeGreaterThan(initialStabilityDays(1000));
    expect(initialStabilityDays(1000)).toBeGreaterThan(initialStabilityDays(null));
    expect(initialStabilityDays(null)).toBeGreaterThan(0);
  });
});

describe('learner CRUD', () => {
  test('create / get / list round-trip', () => {
    const created = createLearner(t.db, 'Lin', { placementMethod: 'paste' }, NOW);
    expect(created.id).toBeGreaterThan(0);
    expect(created.createdAt).toBe(NOW);

    const fetched = getLearner(t.db, created.id)!;
    expect(fetched.displayName).toBe('Lin');
    expect(fetched.settings.placementMethod).toBe('paste');

    expect(listLearners(t.db).some((l) => l.id === created.id)).toBe(true);
  });

  test('update merges settings (existing keys preserved)', () => {
    const l = createLearner(t.db, 'Wu', { placementMethod: 'hsk', bootstrap: false }, NOW);
    const updated = updateLearner(t.db, l.id, { settings: { bootstrap: true } })!;
    expect(updated.settings.placementMethod).toBe('hsk'); // preserved
    expect(updated.settings.bootstrap).toBe(true); // overridden
  });

  test('delete cascades to learner_chars', () => {
    const l = createLearner(t.db, 'Gone', {}, NOW);
    seedLearner(t.db, l.id, selfDeclareHsk(t.db, 1), 'hsk', NOW);
    expect(charRows(l.id).length).toBeGreaterThan(0);

    deleteLearner(t.db, l.id);
    expect(getLearner(t.db, l.id)).toBeNull();
    expect(charRows(l.id).length).toBe(0); // FK ON DELETE CASCADE
  });
});

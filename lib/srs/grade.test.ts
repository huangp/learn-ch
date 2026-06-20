import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { characters, learnerChars } from '../../db/schema';
import { createLearner } from '../learner/crud';
import { seedLearner } from '../learner/seed';
import { selfDeclareHsk } from '../placement/index';
import { selectDueChars, selectNewChars } from '../grading/select';
import { createStory } from '../story/persist';
import { recordQuestionResult, recordReveal } from '../interactions/record';
import type { GenerationMeta, StoryJson } from '../generation/types';
import { MASTERY_STABILITY_DAYS, MIN_EXPOSURES_TO_REVIEW } from './constants';
import { gradeStory, gradeUngradedStories } from './grade';

const NOW = 1_750_000_000_000; // fixed epoch for deterministic scheduling

const META: GenerationMeta = {
  model: 'm',
  repairIterations: 0,
  knownCoverage: 1,
  targetCoverage: 1,
  perSentenceMin: 1,
  fallbackUsed: false,
  usage: { inputTokens: 0, outputTokens: 0 },
  costUsd: 0,
  latencyMs: 0,
};

let t: TestDb;
beforeAll(() => {
  t = makeTestDb();
});
afterAll(() => t.cleanup());

function charStr(id: number): string {
  return t.db.select({ char: characters.char }).from(characters).where(eq(characters.id, id)).get()!.char;
}

function row(learnerId: number, charId: number) {
  return t.db
    .select()
    .from(learnerChars)
    .where(and(eq(learnerChars.learnerId, learnerId), eq(learnerChars.charId, charId)))
    .get();
}

function makeStory(learnerId: number, body: string, targets: string[], dueChars: string[]): number {
  const story: StoryJson = { title: 't', body, targetCharsUsed: targets, comprehensionQuestions: [], choices: [] };
  return createStory(t.db, { learnerId, story, meta: META, segments: [], dueChars, now: NOW }).id;
}

describe('gradeStory — rescheduling', () => {
  test('a reveal on a review char lowers stability, pulls due earlier, counts a lapse (§16.3)', () => {
    const learner = createLearner(t.db, 'reveal', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 2), 'hsk', NOW);
    const charId = selectNewCharsKnownDue(learner.id);
    const c = charStr(charId);
    const before = row(learner.id, charId)!;

    const sid = makeStory(learner.id, c, [], [c]);
    recordReveal(t.db, { storyId: sid, learnerId: learner.id, char: c, now: NOW });
    expect(gradeStory(t.db, learner.id, sid, NOW)).toBe(true);

    const after = row(learner.id, charId)!;
    expect(after.stability!).toBeLessThan(before.stability!);
    expect(after.due!).toBeLessThan(before.due!);
    expect(after.lapses).toBeGreaterThan(before.lapses);
    expect(after.reveals).toBe(1);
    expect(after.exposures).toBe(1);
    expect(after.status).toBe('review'); // review chars stay in review on a lapse
  });

  test('question_correct on a new target introduces it as learning with a forward due date', () => {
    const learner = createLearner(t.db, 'target', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 1), 'hsk', NOW);
    const targetId = selectNewChars(t.db, learner.id, 1)[0];
    const c = charStr(targetId);
    expect(row(learner.id, targetId)).toBeUndefined(); // no row yet

    const sid = makeStory(learner.id, c, [c], []);
    recordQuestionResult(t.db, { storyId: sid, learnerId: learner.id, char: c, correct: true, now: NOW });
    gradeStory(t.db, learner.id, sid, NOW);

    const r = row(learner.id, targetId)!;
    expect(r.status).toBe('learning'); // exposures (1) < threshold → not yet review
    expect(r.reps).toBe(1);
    expect(r.exposures).toBe(1);
    expect(r.due!).toBeGreaterThan(NOW);
    expect(r.stability!).toBeGreaterThan(0);
  });
});

describe('gradeStory — status machine', () => {
  test('learning → review after enough exposures + a correct', () => {
    const learner = createLearner(t.db, 'promote', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 1), 'hsk', NOW);
    const targetId = selectNewChars(t.db, learner.id, 1)[0];
    const c = charStr(targetId);

    // one story where the target appears MIN_EXPOSURES_TO_REVIEW times + a correct answer
    const body = c.repeat(MIN_EXPOSURES_TO_REVIEW);
    const sid = makeStory(learner.id, body, [c], []);
    recordQuestionResult(t.db, { storyId: sid, learnerId: learner.id, char: c, correct: true, now: NOW });
    gradeStory(t.db, learner.id, sid, NOW);

    const r = row(learner.id, targetId)!;
    expect(r.exposures).toBe(MIN_EXPOSURES_TO_REVIEW);
    expect(r.status).toBe('review');
  });

  test('self-correction: a wrong answer on a mastered char demotes it to review (§16.3)', () => {
    const learner = createLearner(t.db, 'demote', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 2), 'hsk', NOW);
    const charId = selectNewCharsKnownDue(learner.id);
    const c = charStr(charId);
    // simulate prior mastery
    t.db
      .update(learnerChars)
      .set({ status: 'mastered' })
      .where(and(eq(learnerChars.learnerId, learner.id), eq(learnerChars.charId, charId)))
      .run();
    const before = row(learner.id, charId)!;

    const sid = makeStory(learner.id, c, [], [c]);
    recordQuestionResult(t.db, { storyId: sid, learnerId: learner.id, char: c, correct: false, now: NOW });
    gradeStory(t.db, learner.id, sid, NOW);

    const after = row(learner.id, charId)!;
    expect(after.status).toBe('review');
    expect(after.lapses).toBeGreaterThan(before.lapses);
  });

  test('review → mastered once stability passes the threshold', () => {
    const learner = createLearner(t.db, 'master', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 2), 'hsk', NOW);
    const charId = selectNewCharsKnownDue(learner.id);
    const c = charStr(charId);
    // park stability just under the mastery line so one clean correct pushes it over
    t.db
      .update(learnerChars)
      .set({ stability: MASTERY_STABILITY_DAYS, status: 'review' })
      .where(and(eq(learnerChars.learnerId, learner.id), eq(learnerChars.charId, charId)))
      .run();

    const sid = makeStory(learner.id, c, [], [c]);
    recordQuestionResult(t.db, { storyId: sid, learnerId: learner.id, char: c, correct: true, now: NOW });
    gradeStory(t.db, learner.id, sid, NOW);

    const r = row(learner.id, charId)!;
    expect(r.stability!).toBeGreaterThanOrEqual(MASTERY_STABILITY_DAYS);
    expect(r.status).toBe('mastered');
  });
});

describe('gradeStory — counters + idempotency', () => {
  test('incidental body chars bump exposures without rescheduling', () => {
    const learner = createLearner(t.db, 'incidental', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 2), 'hsk', NOW);
    const charId = selectNewCharsKnownDue(learner.id);
    const c = charStr(charId);
    const before = row(learner.id, charId)!;

    // c appears in the body but is neither a target nor a due char, and has no interaction
    const sid = makeStory(learner.id, c, [], []);
    gradeStory(t.db, learner.id, sid, NOW);

    const after = row(learner.id, charId)!;
    expect(after.exposures).toBe(before.exposures + 1);
    expect(after.stability!).toBe(before.stability!); // not rescheduled
    expect(after.due!).toBe(before.due!);
    expect(after.status).toBe(before.status);
  });

  test('grading twice is a no-op (gradedAt set; counters not double-incremented)', () => {
    const learner = createLearner(t.db, 'idem', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 2), 'hsk', NOW);
    const charId = selectNewCharsKnownDue(learner.id);
    const c = charStr(charId);

    const sid = makeStory(learner.id, c, [], [c]);
    recordReveal(t.db, { storyId: sid, learnerId: learner.id, char: c, now: NOW });
    expect(gradeStory(t.db, learner.id, sid, NOW)).toBe(true);
    const once = row(learner.id, charId)!;
    expect(gradeStory(t.db, learner.id, sid, NOW)).toBe(false); // already graded
    const twice = row(learner.id, charId)!;

    expect(twice.exposures).toBe(once.exposures);
    expect(twice.reveals).toBe(once.reveals);
    expect(twice.due!).toBe(once.due!);
  });

  test('gradeUngradedStories grades only ungraded stories, oldest first', () => {
    const learner = createLearner(t.db, 'catchup', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 2), 'hsk', NOW);
    const charId = selectNewCharsKnownDue(learner.id);
    const c = charStr(charId);

    const s1 = makeStory(learner.id, c, [], [c]);
    gradeStory(t.db, learner.id, s1, NOW); // pre-graded
    makeStory(learner.id, c, [], [c]); // ungraded
    makeStory(learner.id, c, [], [c]); // ungraded

    expect(gradeUngradedStories(t.db, learner.id, NOW)).toBe(2);
    expect(gradeUngradedStories(t.db, learner.id, NOW)).toBe(0); // nothing left
  });
});

describe('acceptance — invisible review loop (§10)', () => {
  const DAY = 86_400_000;

  function reset(learnerId: number, charId: number, patch: Partial<typeof learnerChars.$inferInsert>) {
    t.db
      .update(learnerChars)
      .set(patch)
      .where(and(eq(learnerChars.learnerId, learnerId), eq(learnerChars.charId, charId)))
      .run();
  }

  test('a revealed char resurfaces sooner than a cleanly-recalled one', () => {
    const learner = createLearner(t.db, 'loop-freq', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 2), 'hsk', NOW);
    const [c1Id, c2Id] = t.db
      .select({ charId: learnerChars.charId })
      .from(learnerChars)
      .where(eq(learnerChars.learnerId, learner.id))
      .limit(2)
      .all()
      .map((r) => r.charId);
    // identical starting state so the only difference is the reading signal
    for (const id of [c1Id, c2Id]) reset(learner.id, id, { status: 'review', stability: 5, difficulty: 5, due: NOW, lastReview: null });

    const c1 = charStr(c1Id); // recalled cleanly
    const c2 = charStr(c2Id); // tapped to reveal (weak)
    const sid = makeStory(learner.id, `${c1}${c2}`, [], [c1, c2]);
    recordQuestionResult(t.db, { storyId: sid, learnerId: learner.id, char: c1, correct: true, now: NOW });
    recordReveal(t.db, { storyId: sid, learnerId: learner.id, char: c2, now: NOW });
    gradeStory(t.db, learner.id, sid, NOW);

    const r1 = row(learner.id, c1Id)!;
    const r2 = row(learner.id, c2Id)!;
    expect(r2.due!).toBeLessThan(r1.due!); // weak char comes back first
    expect(r1.due!).toBeGreaterThan(NOW); // clean char recedes into the future
    // and the scheduler surfaces the weak char ahead of the strong one
    const dueOrder = selectDueChars(t.db, learner.id, 50);
    expect(dueOrder.indexOf(c2Id)).toBeLessThan(dueOrder.indexOf(c1Id));
  });

  test('repeated clean recall over sessions promotes a char to mastered', () => {
    const learner = createLearner(t.db, 'loop-master', {}, NOW);
    seedLearner(t.db, learner.id, selfDeclareHsk(t.db, 2), 'hsk', NOW);
    const cId = t.db.select({ charId: learnerChars.charId }).from(learnerChars).where(eq(learnerChars.learnerId, learner.id)).get()!.charId;
    reset(learner.id, cId, { status: 'review', stability: 10, difficulty: 5, due: NOW, lastReview: null });
    const c = charStr(cId);

    // review the char on its due date across several sessions, always recalling it
    for (let session = 0; session < 5; session++) {
      const now = row(learner.id, cId)!.due!; // study it exactly when it next comes due
      const sid = makeStory(learner.id, c, [], [c]);
      recordQuestionResult(t.db, { storyId: sid, learnerId: learner.id, char: c, correct: true, now });
      gradeStory(t.db, learner.id, sid, now);
    }

    const r = row(learner.id, cId)!;
    expect(r.stability!).toBeGreaterThan(MASTERY_STABILITY_DAYS);
    expect(r.status).toBe('mastered');
    expect(r.due! - NOW).toBeGreaterThan(MASTERY_STABILITY_DAYS * DAY); // intervals expanded
  });
});

/** Pick a seeded (review-status) char for the learner — i.e. an existing learner_chars row. */
function selectNewCharsKnownDue(learnerId: number): number {
  return t.db.select({ charId: learnerChars.charId }).from(learnerChars).where(eq(learnerChars.learnerId, learnerId)).get()!.charId;
}

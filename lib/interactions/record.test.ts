import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { characters, interactions } from '../../db/schema';
import { createLearner } from '../learner/crud';
import type { AnnotatedSegment } from '../annotate/index';
import type { GenerationMeta, StoryJson } from '../generation/types';
import { createStory } from '../story/persist';
import { recordInteraction, recordQuestionResult, recordReveal } from './record';

const NOW = 1_750_000_000_000;

let t: TestDb;
let learnerId: number;
let storyId: number;
beforeAll(() => {
  t = makeTestDb();
  learnerId = createLearner(t.db, 'interactions', {}, NOW).id;
  const story: StoryJson = { title: 't', body: '好', targetCharsUsed: [], comprehensionQuestions: [], choices: [] };
  const meta = { model: 'm', repairIterations: 0, knownCoverage: 1, targetCoverage: 1, perSentenceMin: 1, fallbackUsed: false, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, latencyMs: 0 } satisfies GenerationMeta;
  const segments: AnnotatedSegment[] = [];
  storyId = createStory(t.db, { learnerId, story, meta, segments, now: NOW }).id;
});
afterAll(() => t.cleanup());

function rows() {
  return t.db.select().from(interactions).where(eq(interactions.storyId, storyId)).all();
}

describe('recordInteraction', () => {
  test('resolves a char string to its charId and writes the row', () => {
    const charRow = t.db.select({ id: characters.id }).from(characters).where(eq(characters.char, '好')).get()!;
    const { id } = recordInteraction(t.db, { storyId, learnerId, char: '好', type: 'dwell', value: 1200, now: NOW });
    const row = t.db.select().from(interactions).where(eq(interactions.id, id)).get()!;
    expect(row.charId).toBe(charRow.id);
    expect(row.type).toBe('dwell');
    expect(row.value).toBe(1200);
    expect(row.learnerId).toBe(learnerId);
  });

  test('leaves charId null for an unknown char and for word-level events', () => {
    const unknown = recordInteraction(t.db, { storyId, learnerId, char: '\u{2A700}', type: 'reveal', now: NOW });
    const wordLevel = recordInteraction(t.db, { storyId, learnerId, type: 'dwell', now: NOW });
    const byId = new Map(rows().map((r) => [r.id, r]));
    expect(byId.get(unknown.id)!.charId).toBeNull();
    expect(byId.get(wordLevel.id)!.charId).toBeNull();
  });

  test('recordReveal / recordQuestionResult set the right type', () => {
    recordReveal(t.db, { storyId, learnerId, char: '好', now: NOW });
    recordQuestionResult(t.db, { storyId, learnerId, char: '好', correct: true, now: NOW });
    recordQuestionResult(t.db, { storyId, learnerId, char: '好', correct: false, now: NOW });
    const types = rows().map((r) => r.type);
    expect(types).toContain('reveal');
    expect(types).toContain('question_correct');
    expect(types).toContain('question_wrong');
  });
});

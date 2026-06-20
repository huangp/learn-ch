import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { characters, interactions } from '../../db/schema';
import { createLearner } from '../learner/crud';
import type { AnnotatedSegment } from '../annotate/index';
import type { GenerationMeta, StoryJson } from '../generation/types';
import { createStory } from '../story/persist';
import { recordDwell, recordInteraction, recordQuestionResult, recordReveal } from './record';

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

describe('recordDwell', () => {
  test('writes one dwell row per resolved char with value=valueMs; skips unknown chars', () => {
    const before = rows().length;
    const { count } = recordDwell(t.db, { storyId, learnerId, chars: ['你', '好', '\u{2A700}'], valueMs: 1500, now: NOW });
    expect(count).toBe(2); // the astral char does not resolve
    const dwell = rows().filter((r) => r.type === 'dwell' && r.value === 1500);
    expect(dwell.length).toBe(2);
    expect(rows().length).toBe(before + 2);
    const wantIds = new Set(
      t.db.select({ id: characters.id }).from(characters).where(inArray(characters.char, ['你', '好'])).all().map((r) => r.id),
    );
    expect(dwell.every((r) => r.charId != null && wantIds.has(r.charId))).toBe(true);
  });

  test('dedupes char strings and is a no-op for an empty list', () => {
    expect(recordDwell(t.db, { storyId, learnerId, chars: [], valueMs: 800, now: NOW }).count).toBe(0);
    expect(recordDwell(t.db, { storyId, learnerId, chars: ['人', '人'], valueMs: 800, now: NOW }).count).toBe(1);
  });
});

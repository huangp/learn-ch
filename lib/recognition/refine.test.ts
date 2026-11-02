import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { inArray } from 'drizzle-orm';
import { makeTestDb, type TestDb } from '../test-utils';
import { characters } from '../../db/schema';
import { selfDeclareHsk } from '../placement/index';
import { MockLlmProvider } from '../llm/mock';
import type { RecognitionDraft } from './build';
import { refineRecognition } from './refine';

let t: TestDb;
let allowed: Set<string>;
beforeAll(() => {
  t = makeTestDb();
  const ids = selfDeclareHsk(t.db, 2);
  allowed = new Set(t.db.select({ c: characters.char }).from(characters).where(inArray(characters.id, ids)).all().map((r) => r.c));
  allowed.add('馆');
});
afterAll(() => t.cleanup());

const draft: RecognitionDraft = { char: '馆', word: '图书馆', sentence: '小明去图书馆还书。', alternatives: ['饭馆'], source: 'deterministic' };
const reply = (word: string, sentence: string) => JSON.stringify([{ char: '馆', word, sentence }]);

describe('refineRecognition', () => {
  test('accepts a valid improvement and tags it llm', async () => {
    const llm = new MockLlmProvider([reply('图书馆', '我在图书馆看书。')]);
    const [d] = await refineRecognition(t.db, llm, [draft], allowed);
    expect(d).toMatchObject({ word: '图书馆', sentence: '我在图书馆看书。', source: 'llm' });
    expect(llm.calls).toHaveLength(1);
  });

  test.each([
    ['sentence uses an out-of-vocab char', reply('图书馆', '我在图书馆看龘书。')],
    ['word does not contain the char', reply('图书', '我在图书馆看书。')],
    ['word is not in the lexicon', reply('书馆馆', '我在书馆馆看书。')],
    ['sentence does not contain the word', reply('图书馆', '我在家看书。')],
    ['sentence has pinyin', reply('图书馆', '我在图书馆kàn书。')],
    ['reply is not JSON', 'sorry, no'],
  ])('keeps the draft when the %s', async (_label, text) => {
    const [d] = await refineRecognition(t.db, new MockLlmProvider([text]), [draft], allowed);
    expect(d).toEqual(draft);
  });

  test('rejects a sentence that moves the char to another reading (还 hái → huán)', async () => {
    const hai: RecognitionDraft = { char: '还', word: '还有', sentence: '他还想看一本新书。', alternatives: [], source: 'deterministic' };
    const llm = new MockLlmProvider([JSON.stringify([{ char: '还', word: '还书', sentence: '我去还书。' }])]);
    const [d] = await refineRecognition(t.db, llm, [hai], new Set([...allowed, '还']));
    expect(d).toEqual(hai);
  });

  test('makes no call when there are no drafts', async () => {
    const llm = new MockLlmProvider(['[]']);
    expect(await refineRecognition(t.db, llm, [], allowed)).toEqual([]);
    expect(llm.calls).toHaveLength(0);
  });
});

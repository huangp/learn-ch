import { describe, expect, test } from 'vitest';
import { parseStoryJson, StoryParseError } from './parse';

const valid = {
  title: '木兰',
  body: '木兰是女孩。',
  targetCharsUsed: ['兰'],
  comprehensionQuestions: [{ q: '谁是女孩？', options: ['木兰', '马'], answer: 0, testsChars: ['兰'] }],
  choices: [{ label: '去打仗', seed: 'go-war' }],
};

describe('parseStoryJson (§8.5)', () => {
  test('parses a clean JSON object', () => {
    const s = parseStoryJson(JSON.stringify(valid));
    expect(s.title).toBe('木兰');
    expect(s.comprehensionQuestions[0].answer).toBe(0);
  });

  test('strips a ```json markdown fence', () => {
    const s = parseStoryJson('```json\n' + JSON.stringify(valid) + '\n```');
    expect(s.body).toBe('木兰是女孩。');
  });

  test('applies defaults for optional arrays', () => {
    const s = parseStoryJson(JSON.stringify({ title: 'x', body: 'y' }));
    expect(s.comprehensionQuestions).toEqual([]);
    expect(s.choices).toEqual([]);
    expect(s.targetCharsUsed).toEqual([]);
  });

  test('throws on non-JSON', () => {
    expect(() => parseStoryJson('not json at all')).toThrow(StoryParseError);
  });

  test('throws on missing required fields', () => {
    expect(() => parseStoryJson(JSON.stringify({ title: 'x' }))).toThrow(StoryParseError);
  });

  test('throws when an answer index is out of range', () => {
    const bad = { ...valid, comprehensionQuestions: [{ q: '?', options: ['a', 'b'], answer: 5, testsChars: [] }] };
    expect(() => parseStoryJson(JSON.stringify(bad))).toThrow(StoryParseError);
  });
});

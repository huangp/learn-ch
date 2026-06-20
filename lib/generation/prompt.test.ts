import { describe, expect, test } from 'vitest';
import { buildUserPrompt, type UserPromptInput } from './prompt';

const base: UserPromptInput = {
  allowedWords: [{ word: '你好', pinyin: null, gloss: null, freqRank: 1, hskLevel: 1 }],
  targets: ['好'],
  due: [],
};

describe('buildUserPrompt — branch seed (§11.1 follow-up)', () => {
  test('renders a BRANCH directive when a seed is given', () => {
    const prompt = buildUserPrompt({ ...base, seed: 'mulan-goes', priorStory: '从前……' });
    expect(prompt).toContain('BRANCH: continue the branch "mulan-goes"');
  });

  test('omits the BRANCH directive when no seed is given', () => {
    const prompt = buildUserPrompt({ ...base, priorStory: '从前……' });
    expect(prompt).not.toContain('BRANCH:');
  });
});

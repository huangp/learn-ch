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

describe('buildUserPrompt — companion persona (§11)', () => {
  const persona = {
    id: 'xiaolong',
    name: '小龙',
    nameEn: 'Little Dragon',
    emoji: '🐉',
    blurb: '',
    tagline: '',
    promptInstruction: 'Feature a recurring companion named 小龙.',
  };

  test('renders a COMPANION directive naming the persona', () => {
    const prompt = buildUserPrompt({ ...base, persona });
    expect(prompt).toContain('COMPANION:');
    expect(prompt).toContain('小龙');
  });

  test('omits the COMPANION directive when no persona is given', () => {
    expect(buildUserPrompt(base)).not.toContain('COMPANION:');
  });
});

describe('buildUserPrompt — genre (§17.1)', () => {
  const genre = {
    id: 'mystery',
    label: 'mystery',
    emoji: '🔍',
    blurb: '',
    promptInstruction: 'Build a small mystery with clues and a reveal.',
  };

  test('renders a GENRE directive and uses the genre label for THEME when no theme', () => {
    const prompt = buildUserPrompt({ ...base, genre });
    expect(prompt).toContain('GENRE: Build a small mystery with clues and a reveal.');
    expect(prompt).toContain('THEME: mystery');
  });

  test('an explicit theme overrides the genre label on the THEME line', () => {
    const prompt = buildUserPrompt({ ...base, genre, theme: 'a trip to the moon' });
    expect(prompt).toContain('THEME: a trip to the moon');
    expect(prompt).toContain('GENRE:'); // directive still applies
  });

  test('omits the GENRE directive when no genre is given (regression guard)', () => {
    expect(buildUserPrompt(base)).not.toContain('GENRE:');
  });
});

describe('buildUserPrompt — story seed (§17.2)', () => {
  const storySeed = {
    id: 'mulan',
    title: '木兰从军',
    titleEn: 'Mulan',
    blurb: '',
    setting: 'Ancient China.',
    characters: ['木兰'],
    beats: ['The army calls every family.', '木兰 goes in her father’s place.'],
    themeHints: ['history', 'courage'],
    source: 'history' as const,
  };

  test('renders the STORY TO RETELL block with ordered beats', () => {
    const prompt = buildUserPrompt({ ...base, storySeed });
    expect(prompt).toContain('STORY TO RETELL');
    expect(prompt).toContain('1. The army calls every family.');
    expect(prompt).toContain('2. 木兰 goes in her father’s place.');
  });

  test('falls back to themeHints for the THEME line when no theme is given', () => {
    expect(buildUserPrompt({ ...base, storySeed })).toContain('THEME: history, courage');
  });

  test('an explicit theme overrides the seed themeHints', () => {
    expect(buildUserPrompt({ ...base, storySeed, theme: 'mystery' })).toContain('THEME: mystery');
  });

  test('omits the block when no seed is given (regression guard)', () => {
    expect(buildUserPrompt(base)).not.toContain('STORY TO RETELL');
  });
});

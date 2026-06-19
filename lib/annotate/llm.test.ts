import { describe, expect, test } from 'vitest';
import { MockLlmProvider } from '../llm/index.js';
import { candidatesFor } from './heteronym.js';
import type { AnnotatedSegment } from './index.js';
import { resolveHeteronyms } from './llm.js';

// Build a deterministic segment as annotate() would, with every char on its pinyin-pro
// default reading. In '我还书' only 还 is a hard case (我/书 are monophonic), so it is id 0.
function seg(text: string): AnnotatedSegment {
  const chars = [...text];
  return {
    text,
    pinyin: chars.map((c) => candidatesFor(c)[0]),
    gloss: null,
    chars,
    candidates: chars.map(candidatesFor),
    source: chars.map(() => 'pinyin-pro' as const),
  };
}

describe('resolveHeteronyms — opt-in LLM heteronym fallback', () => {
  test('overrides a hard case with a valid candidate and marks source=llm', async () => {
    const segs = [seg('我'), seg('还'), seg('书')];
    const llm = new MockLlmProvider(JSON.stringify([{ id: 0, pinyin: 'huán' }]));

    const out = await resolveHeteronyms(llm, '我还书', segs);

    const huan = out.find((s) => s.text === '还')!;
    expect(huan.pinyin).toEqual(['huán']);
    expect(huan.source).toEqual(['llm']);
    // untouched segments keep their provenance
    expect(out.find((s) => s.text === '我')!.source).toEqual(['pinyin-pro']);
    // input not mutated
    expect(segs[1].pinyin).toEqual(['hái']);
    expect(segs[1].source).toEqual(['pinyin-pro']);
  });

  test('ignores a reply that is not one of the char’s candidates', async () => {
    const segs = [seg('我'), seg('还'), seg('书')];
    const llm = new MockLlmProvider(JSON.stringify([{ id: 0, pinyin: 'bogus' }]));

    const out = await resolveHeteronyms(llm, '我还书', segs);

    const still = out.find((s) => s.text === '还')!;
    expect(still.pinyin).toEqual(['hái']);
    expect(still.source).toEqual(['pinyin-pro']);
  });

  test('makes no LLM call when there are no hard cases', async () => {
    const segs = [seg('我'), seg('书')];
    const llm = new MockLlmProvider('[]');

    const out = await resolveHeteronyms(llm, '我书', segs);

    expect(llm.calls.length).toBe(0);
    expect(out).toBe(segs); // returned unchanged
  });
});

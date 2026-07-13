import { describe, expect, test } from 'vitest';
import type { ComprehensionQuestion } from '../generation/types';
import { shuffleQuestionOptions } from './shuffle-options';

const q = (answer: number): ComprehensionQuestion => ({
  q: '谁好？',
  options: ['A项', 'B项', 'C项', 'D项'],
  answer,
  testsChars: ['好'],
});

describe('shuffleQuestionOptions', () => {
  test('permutes options while keeping answer pointing at the same correct text', () => {
    const [orig] = [q(0)];
    const correctText = orig.options[orig.answer];
    const [out] = shuffleQuestionOptions([orig]);

    expect([...out.options].sort()).toEqual([...orig.options].sort()); // same multiset
    expect(out.options[out.answer]).toBe(correctText); // answer still correct
    expect(out.q).toBe(orig.q);
    expect(out.testsChars).toEqual(orig.testsChars);
  });

  test('actually moves the answer off index 0 for a suitable rand', () => {
    // rand()=0 makes every Fisher–Yates step pick j=0, repeatedly swapping position 0 away.
    const [out] = shuffleQuestionOptions([q(0)], () => 0);
    expect(out.answer).not.toBe(0);
    expect(out.options[out.answer]).toBe('A项');
  });

  test('does not mutate the input', () => {
    const input = [q(2)];
    const before = JSON.parse(JSON.stringify(input));
    shuffleQuestionOptions(input, () => 0.5);
    expect(input).toEqual(before);
  });
});

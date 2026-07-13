import type { ComprehensionQuestion } from '../generation/types';

// Randomize each question's option order and remap `answer` to follow. `testsChars`,
// `q`, and everything else are untouched. Without this the correct answer is always the
// LLM-emitted index (biased to 0 by the prompt example), so it's nearly always option A.
// Pure; injectable rand for deterministic tests.
export function shuffleQuestionOptions(
  questions: ComprehensionQuestion[],
  rand: () => number = Math.random,
): ComprehensionQuestion[] {
  return questions.map((q) => {
    const perm = q.options.map((_, i) => i);
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    return {
      ...q,
      options: perm.map((i) => q.options[i]),
      answer: perm.indexOf(q.answer),
    };
  });
}

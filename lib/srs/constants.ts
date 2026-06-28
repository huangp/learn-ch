import { Rating } from 'ts-fsrs';
import type { InteractionType } from '../interactions/record';

// Phase 7 SRS constants (§10). Provisional + eval-tunable, mirroring lib/generation/constants.ts.

/** review → mastered once FSRS stability (days) reaches this. */
export const MASTERY_STABILITY_DAYS = 60;

/** learning → review (question path): needs ≥ this many exposures AND ≥1 comprehension correct. */
export const MIN_EXPOSURES_TO_REVIEW = 3;

/**
 * learning → review (passive fallback): a char the LLM never tests with a comprehension question
 * can still promote on accumulated clean-read evidence, so it can't stall in `learning` forever
 * (a stalled `learning` char blocks downstream curriculum chars that need it as a component).
 * Requires BOTH: FSRS stability ≥ STABILITY_TO_REVIEW (days) AND exposures ≥ PASSIVE_EXPOSURES_TO_REVIEW.
 * `STABILITY_TO_REVIEW` sits well under MASTERY_STABILITY_DAYS=60; since `pass`→Rating.Hard grows
 * stability slowly, ~21d implies several clean reads, not one glance. Exposures bar is double the
 * question path's, keeping the question path the fast lane. Provisional + eval-tunable (§10).
 */
export const STABILITY_TO_REVIEW = 21;
export const PASSIVE_EXPOSURES_TO_REVIEW = 6;

/**
 * The interaction signal a char carries in a story, worst-first. `gradeStory` reduces a
 * char's interactions to its strongest (lowest-index) signal, then maps to an FSRS grade:
 *  - reveal / question_wrong → Again (weak; pulls the char back into rotation, §10/§16.3)
 *  - question_correct        → Good
 *  - dwell (segment read past with no reveal/wrong) → Hard (the §10 "read past without reveal
 *    → soft good, lower weight")
 *  - unseen (no interaction at all): no evidence the char was read this story. Not rateable —
 *    `gradeStory` either skips it (dwell data present) or falls back to `pass` (no dwell data).
 */
export type CharSignal = 'weak' | 'correct' | 'pass' | 'unseen';

export function signalOfInteractions(types: InteractionType[]): CharSignal {
  if (types.some((t) => t === 'reveal' || t === 'question_wrong')) return 'weak';
  if (types.some((t) => t === 'question_correct')) return 'correct';
  if (types.some((t) => t === 'dwell')) return 'pass';
  return 'unseen';
}

export function signalToRating(signal: CharSignal): Rating.Again | Rating.Hard | Rating.Good {
  switch (signal) {
    case 'weak':
      return Rating.Again;
    case 'correct':
      return Rating.Good;
    case 'pass':
      return Rating.Hard;
    case 'unseen':
      throw new Error('unseen signal is not rateable — gradeStory must resolve it before scheduling');
  }
}

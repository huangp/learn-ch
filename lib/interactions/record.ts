import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { characters, interactions } from '../../db/schema';

// Phase 5 — reading-event capture (§10/§11). Writes `interactions` rows ONLY; it does
// NOT touch learner_chars (FSRS stability/exposures/reveals + status promotion are
// Phase 7, which consumes these rows). Keeping capture and grading separate means the
// raw signal is recorded faithfully now and graded later.

export type InteractionType = 'reveal' | 'question_correct' | 'question_wrong' | 'dwell';

export interface RecordInteractionInput {
  storyId: number;
  learnerId: number;
  /** Character the event is about; resolved to a charId. Omit for word-level events. */
  char?: string;
  charId?: number;
  type: InteractionType;
  value?: number;
  now?: number;
}

function resolveCharId(db: Db, char: string): number | null {
  const row = db.select({ id: characters.id }).from(characters).where(eq(characters.char, char)).get();
  return row?.id ?? null;
}

/** Insert one reading-interaction row; returns the new row id. */
export function recordInteraction(db: Db, input: RecordInteractionInput): { id: number } {
  const charId = input.charId ?? (input.char ? resolveCharId(db, input.char) : null);
  const row = db
    .insert(interactions)
    .values({
      storyId: input.storyId,
      learnerId: input.learnerId,
      charId,
      type: input.type,
      value: input.value ?? null,
      createdAt: input.now ?? Date.now(),
    })
    .returning({ id: interactions.id })
    .get();
  return { id: row.id };
}

/** Tap-to-reveal pinyin/gloss on a char → a weakness signal (§10). */
export function recordReveal(
  db: Db,
  args: { storyId: number; learnerId: number; char: string; now?: number },
): { id: number } {
  return recordInteraction(db, { ...args, type: 'reveal' });
}

/** Comprehension answer outcome, tied to a tested char (§8.5 testsChars). */
export function recordQuestionResult(
  db: Db,
  args: { storyId: number; learnerId: number; char?: string; correct: boolean; now?: number },
): { id: number } {
  return recordInteraction(db, {
    storyId: args.storyId,
    learnerId: args.learnerId,
    char: args.char,
    type: args.correct ? 'question_correct' : 'question_wrong',
    now: args.now,
  });
}

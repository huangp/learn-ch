import { eq, inArray } from 'drizzle-orm';
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

/**
 * Per-passage dwell: the learner had this segment on screen long enough to read it — the §10 soft
 * "read past without reveal → weak good" signal (Phase 7 grades it). Batched: resolves every char
 * to its id in one query and inserts one `dwell` row per resolved Han char with `value=valueMs`.
 * Unresolved chars are skipped. Returns the number of rows written.
 */
export function recordDwell(
  db: Db,
  args: { storyId: number; learnerId: number; chars: string[]; valueMs: number; now?: number },
): { count: number } {
  const uniq = [...new Set(args.chars)];
  if (uniq.length === 0) return { count: 0 };
  const idByChar = new Map<string, number>();
  for (const r of db.select({ id: characters.id, char: characters.char }).from(characters).where(inArray(characters.char, uniq)).all()) {
    idByChar.set(r.char, r.id);
  }
  const createdAt = args.now ?? Date.now();
  const values = uniq
    .map((c) => idByChar.get(c))
    .filter((id): id is number => id != null)
    .map((charId) => ({ storyId: args.storyId, learnerId: args.learnerId, charId, type: 'dwell' as const, value: args.valueMs, createdAt }));
  if (values.length === 0) return { count: 0 };
  db.insert(interactions).values(values).run();
  return { count: values.length };
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

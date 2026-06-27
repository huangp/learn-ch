import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { characters, learnerChars } from '../../db/schema';
import { getLearner } from './crud';
import { seedLearner } from './seed';
import type { PlacementMethod } from '../placement/index';

// Mark whole words as known (additive) — the slideshow's "I know this word" toggle. Expands each
// word to its Han chars, unions with the learner's existing known chars, and re-seeds via
// `seedLearner`: non-downgrading (`onConflictDoNothing`) and frontier-recomputing, WITHOUT changing
// the learner's recorded placement method. Self-report is seeded as `review`, never `mastered`;
// reading evidence still corrects it (§16.3). Pure DB write.

const KNOWN_STATUSES = ['learning', 'review', 'mastered'] as const;
const isHan = (c: string) => /\p{Script=Han}/u.test(c);

/** Returns the number of newly-seeded chars (0 if nothing new). */
export function markWordsKnown(db: Db, learnerId: number, knownWords: string[]): number {
  const chars = [...new Set(knownWords.flatMap((w) => [...w]).filter(isHan))];
  if (chars.length === 0) return 0;
  const newIds = db.select({ id: characters.id }).from(characters).where(inArray(characters.char, chars)).all().map((r) => r.id);
  if (newIds.length === 0) return 0;

  const existing = db
    .select({ charId: learnerChars.charId })
    .from(learnerChars)
    .where(and(eq(learnerChars.learnerId, learnerId), inArray(learnerChars.status, [...KNOWN_STATUSES])))
    .all()
    .map((r) => r.charId);

  const union = [...new Set([...existing, ...newIds])];
  const method = (getLearner(db, learnerId)?.settings.placementMethod as PlacementMethod | undefined) ?? 'grid';
  return seedLearner(db, learnerId, union, method).seeded;
}

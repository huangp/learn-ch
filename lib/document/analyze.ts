import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { characters, learnerChars } from '../../db/schema';
import { isHan } from '../../data/pipeline/lib';
import { pickTargetsFromDoc } from './targets';

// Parent document upload — readability preview. Given an uploaded text, compute its content
// metadata and, per child, how much of it they can already read. Pure DB reads, no LLM.
//
// The split is deliberately finer than the app's usual KNOWN_STATUSES (which lumps `learning`
// in with `review`/`mastered`): the preview shows the parent three separate buckets so they can
// judge fit.
//   - known    = review + mastered  (acquired)
//   - learning = learning           (in progress)
//   - new      = status `new`, or char absent from learner_chars (incl. Traditional / off-curriculum)

export interface DocumentStats {
  /** Total characters in the text (all scripts, incl. punctuation/whitespace). */
  totalChars: number;
  /** Distinct Han characters. */
  uniqueHanCount: number;
  /** The distinct Han characters (input to coverageForLearners). */
  hanChars: string[];
}

export interface LearnerCoverage {
  learnerId: number;
  displayName: string;
  /** Distinct Han chars in the document (denominator; same across learners). */
  uniqueHan: number;
  known: number;
  learning: number;
  new: number;
  knownPct: number;
  learningPct: number;
  newPct: number;
  /** The new chars this document would teach this child (what gets recorded as targetCharsUsed). */
  targets: string[];
}

/** Content metadata for an uploaded text: char count + distinct Han chars. */
export function documentStats(text: string): DocumentStats {
  const hanChars = [...new Set([...text].filter(isHan))];
  return { totalChars: text.length, uniqueHanCount: hanChars.length, hanChars };
}

const KNOWN = new Set(['review', 'mastered']);

/** Per-learner known/learning/new breakdown of the document's distinct Han chars. */
export function coverageForLearners(db: Db, learners: { id: number; displayName: string }[], hanChars: string[]): LearnerCoverage[] {
  const uniqueHan = hanChars.length;

  return learners.map((learner) => {
    // Only this learner's rows for chars that appear in the document (empty doc → no rows).
    const rows =
      hanChars.length === 0
        ? []
        : db
            .select({ status: learnerChars.status })
            .from(learnerChars)
            .innerJoin(characters, eq(learnerChars.charId, characters.id))
            .where(and(eq(learnerChars.learnerId, learner.id), inArray(characters.char, hanChars)))
            .all();

    let known = 0;
    let learning = 0;
    for (const r of rows) {
      if (KNOWN.has(r.status)) known++;
      else if (r.status === 'learning') learning++;
      // status 'new' falls through to the `new` bucket below
    }
    const seen = known + learning;
    const newCount = uniqueHan - seen;
    const pct = (n: number) => (uniqueHan > 0 ? n / uniqueHan : 0);

    return {
      learnerId: learner.id,
      displayName: learner.displayName,
      uniqueHan,
      known,
      learning,
      new: newCount,
      knownPct: pct(known),
      learningPct: pct(learning),
      newPct: pct(newCount),
      // Same helper the persist path uses, so the preview matches what gets taught.
      targets: hanChars.length === 0 ? [] : pickTargetsFromDoc(db, learner.id, hanChars),
    };
  });
}

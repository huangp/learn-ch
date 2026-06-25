import { and, count, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { interactions } from '../../db/schema';

// Read-count display (§11). A "read" is a concluded reading — one `complete` interaction
// (recorded by recordCompletion when the learner finishes or branches). Pure DB read.

/** storyId → number of concluded readings for this learner (absent ⇒ 0 ⇒ unread). */
export function getStoryReadCounts(db: Db, learnerId: number): Map<number, number> {
  const rows = db
    .select({ storyId: interactions.storyId, n: count() })
    .from(interactions)
    .where(and(eq(interactions.learnerId, learnerId), eq(interactions.type, 'complete')))
    .groupBy(interactions.storyId)
    .all();
  return new Map(rows.map((r) => [r.storyId, r.n]));
}

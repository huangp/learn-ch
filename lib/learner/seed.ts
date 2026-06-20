import { eq, inArray } from 'drizzle-orm';
import { default_w, clamp, Rating } from 'ts-fsrs';
import type { Db } from '../db';
import { characters, learnerChars, learners } from '../../db/schema';
import { buildCurriculum, computeFrontier } from '../grading/curriculum';
import type { PlacementMethod } from '../placement/index';

// §16.2/§16.4 seeding. Declared-known chars have NO review history, so we:
//  - seed them as `review` (never `mastered` — self-report is unverified; reading
//    will confirm or correct via §16.3),
//  - give generous, frequency-scaled FSRS stability (anchors like 的/是 are very
//    likely genuinely known; rarer chars are shakier and surface sooner),
//  - spread the due dates so review trickles in over weeks, not as a synchronized wall.

const DAY_MS = 86_400_000;
const MAX_RANK = 10_000; // Jun Da covers ~9.9k chars; cap unranked/rare here
export const BOOTSTRAP_THRESHOLD = 50; // below this known count → bootstrap mode (§16.4)

// FSRS-consistent initial difficulty for a "Good" first review (D0 in FSRS-6).
const INITIAL_DIFFICULTY = clamp(
  default_w[4] - Math.exp(default_w[5] * (Rating.Good - 1)) + 1,
  1,
  10,
);

/** Monotonic freqRank → initial stability (days). Most frequent → most stable. */
export function initialStabilityDays(freqRank: number | null): number {
  const r = clamp(freqRank ?? MAX_RANK, 1, MAX_RANK);
  return 1 + 60 * (1 - Math.log(r) / Math.log(MAX_RANK));
}

/** Deterministic per-char jitter in [0.8, 1.2] to de-synchronize equal-stability chars. */
function jitterFactor(charId: number): number {
  const h = (charId * 2654435761) >>> 0;
  return 0.8 + 0.4 * ((h % 1000) / 1000);
}

export interface SeedResult {
  seeded: number; // rows newly written (existing chars left untouched — no downgrade)
  frontierCharId: number | null;
  bootstrap: boolean;
}

/**
 * Seed a learner's known characters as `review` SRS state and set the curriculum
 * frontier + bootstrap flag on `learners.settings`. Idempotent: chars already in
 * `learner_chars` are left as-is (never downgraded — §16.1), so placement is
 * safely re-runnable. `now` is injectable for deterministic tests.
 */
export function seedLearner(
  db: Db,
  learnerId: number,
  knownCharIds: number[],
  method: PlacementMethod,
  now: number = Date.now(),
): SeedResult {
  const distinct = [...new Set(knownCharIds)];
  const bootstrap = distinct.length < BOOTSTRAP_THRESHOLD;
  const frontierCharId = computeFrontier(buildCurriculum(db), new Set(distinct));

  let seeded = 0;
  db.transaction((tx) => {
    if (distinct.length > 0) {
      // freqRank per known char, for stability scaling
      const freqRows = tx
        .select({ id: characters.id, freqRank: characters.freqRank })
        .from(characters)
        .where(inArray(characters.id, distinct))
        .all();
      const freq = new Map(freqRows.map((r) => [r.id, r.freqRank]));

      const rows = distinct.map((charId) => {
        const stability = initialStabilityDays(freq.get(charId) ?? null);
        const due = now + Math.round(stability * jitterFactor(charId) * DAY_MS);
        return {
          learnerId,
          charId,
          status: 'review' as const,
          stability,
          difficulty: INITIAL_DIFFICULTY,
          due,
          lastReview: null,
          reps: 0,
          lapses: 0,
          exposures: 0,
          reveals: 0,
        };
      });

      // chunk to stay well under SQLite's bound-parameter limit; skip existing (no downgrade)
      for (let i = 0; i < rows.length; i += 500) {
        const res = tx
          .insert(learnerChars)
          .values(rows.slice(i, i + 500))
          .onConflictDoNothing()
          .run();
        seeded += res.changes;
      }
    }

    // merge placement outcome into settings (preserve any existing keys)
    const learner = tx.select({ settings: learners.settings }).from(learners).where(eq(learners.id, learnerId)).get();
    const settings = { ...(learner?.settings ? JSON.parse(learner.settings) : {}), placementMethod: method, frontierCharId, bootstrap };
    tx.update(learners).set({ settings: JSON.stringify(settings) }).where(eq(learners.id, learnerId)).run();
  });

  return { seeded, frontierCharId, bootstrap };
}

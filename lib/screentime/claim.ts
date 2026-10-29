import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { interactions } from '../../db/schema';
import type { CreditClaim } from '../generation/types';
import { getStory, setStoryCreditClaim } from '../story/persist';
import { claimUrl, CREDIT_MINUTES_PER_STORY, makeCode } from './code';

// Screentime credit: a finished story earns CREDIT_MINUTES_PER_STORY, once. "Finished" = the
// learner concluded a reading (a `complete` interaction) AND answered every comprehension
// question (question rows carry the question index in `value`; see components/Questions.tsx).
// `gradedAt` is deliberately NOT used — catch-up grading sets it on stories never read.
// The claim (incl. its code) rides in `stories.meta.creditClaim`, so a reload re-shows it.

// Screentime pool names (config.yaml): letters/digits/underscore only.
const KID_NAME = /^[a-z0-9_]{1,32}$/;

/** Parse the SCREENTIME_KIDS env list ("amelia, jayden") into valid pool names for the widget. */
export function parseKidList(raw: string | undefined): string[] {
  const names = (raw ?? '').split(',').map((n) => n.trim().toLowerCase());
  return [...new Set(names.filter((n) => KID_NAME.test(n)))];
}

export interface CreditStatus {
  claimed: CreditClaim | null;
  completed: boolean;
  answered: number;
  total: number;
}

export function getCreditStatus(db: Db, learnerId: number, storyId: number): CreditStatus | null {
  const story = getStory(db, storyId);
  if (!story || story.learnerId !== learnerId) return null;
  const rows = db
    .select({ type: interactions.type, value: interactions.value })
    .from(interactions)
    .where(
      and(
        eq(interactions.storyId, storyId),
        eq(interactions.learnerId, learnerId),
        inArray(interactions.type, ['complete', 'question_correct', 'question_wrong']),
      ),
    )
    .all();
  const answered = new Set<number>();
  for (const r of rows) if (r.type !== 'complete' && r.value != null) answered.add(r.value);
  return {
    claimed: story.meta?.creditClaim ?? null,
    completed: rows.some((r) => r.type === 'complete'),
    answered: answered.size,
    total: story.questions.length,
  };
}

/**
 * Mint (or re-return) the story's screentime code. Idempotent: an existing claim is returned
 * unchanged, so a story never earns twice. Returns `{ error }` when the story isn't done yet.
 */
export function claimStoryCredit(
  db: Db,
  learnerId: number,
  storyId: number,
  kid: string,
  secret: string,
  now: number = Date.now(),
): CreditClaim | { error: string } {
  // Check-then-write needs no transaction: better-sqlite3 is synchronous, so nothing else on this
  // (single-threaded) server can run between the read and the write.
  const status = getCreditStatus(db, learnerId, storyId);
  if (!status) return { error: 'Story not found.' };
  if (status.claimed) return status.claimed;
  if (!status.completed) return { error: "Tap \"I'm done reading\" first." };
  if (status.answered < status.total) {
    return { error: `Answer all ${status.total} questions first (${status.answered}/${status.total}).` };
  }
  const name = kid.trim().toLowerCase();
  if (!KID_NAME.test(name)) return { error: 'Enter your screentime name (letters, digits, _).' };
  const code = makeCode(secret, name, CREDIT_MINUTES_PER_STORY);
  const claim: CreditClaim = { kid: name, minutes: CREDIT_MINUTES_PER_STORY, code, url: claimUrl(name, code), claimedAt: now };
  setStoryCreditClaim(db, storyId, claim);
  return claim;
}

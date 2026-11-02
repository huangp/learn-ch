import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { interactions, stories } from '../../db/schema';
import type { BonusClaim } from '../generation/types';
import { getLearner, updateLearner } from '../learner/crud';
import { localDay } from '../progress/index';
import { toRecord } from '../story/persist';
import { creditProgress, KID_NAME, questionTotal } from './claim';
import {
  BONUS_MINUTES_PARTIAL,
  BONUS_MINUTES_STREAK,
  BONUS_PARTIAL_DAYS,
  BONUS_STREAK_DAYS,
  claimUrl,
  makeCode,
  MAX_CODE_MINUTES,
} from './code';

// Weekly streak bonus, on top of the per-story credit (claim.ts). A week (keyed by its Monday,
// server-local) earns BONUS_MINUTES_STREAK for a finished story on all 5 weekdays, else
// BONUS_MINUTES_PARTIAL for ≥3 of them. "Finished" is the per-story credit rule (complete + every
// question answered), dated by the story's first `complete`. Weekend reading doesn't count.
// Claimable only on Sat/Sun; unclaimed weeks carry over. Claims live in learners.settings.bonusClaims.

export interface BonusStatus {
  isWeekend: boolean;
  /** This week's Mon–Fri finished days so far, and what they'd earn. */
  thisWeek: { monday: string; daysRead: string[]; minutes: number };
  /** What the next claim mints: earned, unclaimed weeks (oldest first, ≤ MAX_CODE_MINUTES total). */
  pending: { weeks: string[]; minutes: number };
  lastClaim: BonusClaim | null;
}

/** Local days on which the learner finished a story (including stories deleted afterwards). */
export function finishedDays(db: Db, learnerId: number): Set<string> {
  const rows = db
    .select({ storyId: interactions.storyId, type: interactions.type, value: interactions.value, createdAt: interactions.createdAt })
    .from(interactions)
    .where(
      and(
        eq(interactions.learnerId, learnerId),
        inArray(interactions.type, ['complete', 'question_correct', 'question_wrong']),
      ),
    )
    .all();
  const byStory = new Map<number, typeof rows>();
  for (const r of rows) byStory.set(r.storyId, [...(byStory.get(r.storyId) ?? []), r]);

  // Soft-deleted stories still count — a kid may tidy away a story they already read.
  const totals = new Map(
    db.select().from(stories).where(eq(stories.learnerId, learnerId)).all().map((row) => [row.id, questionTotal(toRecord(row))]),
  );
  const days = new Set<string>();
  for (const [storyId, storyRows] of byStory) {
    const { completed, answered } = creditProgress(storyRows);
    const total = totals.get(storyId);
    if (!completed || total == null || answered < total) continue;
    const firstComplete = Math.min(...storyRows.filter((r) => r.type === 'complete').map((r) => r.createdAt));
    days.add(localDay(firstComplete));
  }
  return days;
}

/** Local midnight of the Monday on/before `ms`. */
function mondayOf(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

/** The 'YYYY-MM-DD' keys of Mon–Fri for the week starting `monday`. */
function weekdays(monday: Date): string[] {
  return Array.from({ length: 5 }, (_, i) =>
    localDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i).getTime()),
  );
}

export function weekBonusMinutes(daysRead: number): number {
  if (daysRead >= BONUS_STREAK_DAYS) return BONUS_MINUTES_STREAK;
  if (daysRead >= BONUS_PARTIAL_DAYS) return BONUS_MINUTES_PARTIAL;
  return 0;
}

export function getBonusStatus(db: Db, learnerId: number, now: number = Date.now()): BonusStatus | null {
  const learner = getLearner(db, learnerId);
  if (!learner) return null;
  const claims = learner.settings.bonusClaims ?? [];
  const claimed = new Set(claims.flatMap((c) => c.weeks));
  const days = finishedDays(db, learnerId);
  const dow = new Date(now).getDay();
  const isWeekend = dow === 0 || dow === 6;

  const current = mondayOf(now);
  const thisDays = weekdays(current).filter((d) => days.has(d));
  const thisWeek = { monday: localDay(current.getTime()), daysRead: thisDays, minutes: weekBonusMinutes(thisDays.length) };

  // Earned weeks: from the learner's first week through the last one whose Mon–Fri is over.
  const pending = { weeks: [] as string[], minutes: 0 };
  const last = isWeekend ? current : new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7);
  for (let m = mondayOf(learner.createdAt); m <= last; m = new Date(m.getFullYear(), m.getMonth(), m.getDate() + 7)) {
    const key = localDay(m.getTime());
    const minutes = weekBonusMinutes(weekdays(m).filter((d) => days.has(d)).length);
    if (minutes === 0 || claimed.has(key)) continue;
    if (pending.minutes + minutes > MAX_CODE_MINUTES) break; // the rest waits for the next claim
    pending.weeks.push(key);
    pending.minutes += minutes;
  }
  return { isWeekend, thisWeek, pending, lastClaim: claims.at(-1) ?? null };
}

/** Mint one code for every pending week (see BonusStatus.pending). Weekend-only. */
export function claimWeeklyBonus(
  db: Db,
  learnerId: number,
  kid: string,
  secret: string,
  now: number = Date.now(),
): BonusClaim | { error: string } {
  // Check-then-write needs no transaction: better-sqlite3 is synchronous (see claim.ts).
  const status = getBonusStatus(db, learnerId, now);
  if (!status) return { error: 'Learner not found.' };
  if (!status.isWeekend) return { error: 'The weekly bonus can be claimed on Saturday or Sunday.' };
  if (status.pending.minutes === 0) return { error: 'No weekly bonus to claim yet.' };
  const name = kid.trim().toLowerCase();
  if (!KID_NAME.test(name)) return { error: 'Enter your screentime name (letters, digits, _).' };
  const { minutes, weeks } = status.pending;
  const code = makeCode(secret, name, minutes);
  const claim: BonusClaim = { kid: name, minutes, code, url: claimUrl(name, code), claimedAt: now, weeks };
  const prev = getLearner(db, learnerId)?.settings.bonusClaims ?? [];
  updateLearner(db, learnerId, { settings: { bonusClaims: [...prev, claim] } });
  return claim;
}

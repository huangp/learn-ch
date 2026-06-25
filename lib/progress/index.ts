import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { characters, interactions, learnerChars } from '../../db/schema';
import { getLearner } from '../learner/crud';
import { buildCurriculum } from '../grading/curriculum';
import { selectNewChars } from '../grading/select';
import { listStoriesForLearner } from '../story/persist';
import { REWARD_TEXTS, REWARD_UNLOCK_THRESHOLD } from './reward-texts';

// §11 progress view — a read-only snapshot of where a learner stands: how many chars
// they can read, how far through the curriculum, what's next, and how close real reward
// texts are. Pure DB read; writes nothing. Promotion of statuses + exposures/reveals is
// Phase 7, so today's known set is the seeded `review` set (mastered ≈ 0).

// Statuses that count as "known" (can read) — same set as the allowlist (§7).
const KNOWN_STATUSES = ['learning', 'review', 'mastered'] as const;

// How many upcoming curriculum chars to preview.
const UPCOMING_COUNT = 8;

export interface RewardProgress {
  id: string;
  title: string;
  author: string;
  text: string;
  knownChars: number;
  totalChars: number;
  coverage: number; // 0..1
  unlocked: boolean;
}

export interface LearnerProgress {
  knownCount: number;
  statusCounts: { learning: number; review: number; mastered: number };
  curriculumTotal: number;
  /** Position of the learner's frontier in curriculum order, or null if all known / unset. */
  frontierIndex: number | null;
  curriculumPct: number; // knownCount / curriculumTotal, 0..1
  upcoming: string[]; // next chars to learn, curriculum order
  storiesRead: number;
  rewardTexts: RewardProgress[];
}

const isHan = (c: string) => /\p{Script=Han}/u.test(c);

// Reading-time estimate (§11 activity view). Provisional, eval-tunable like the other
// lib magic numbers: graded-reader pace for an 11–15yo learner, in hanzi/minute.
export const READING_HANZI_PER_MIN = 120;

export interface DailyActivity {
  date: string; // 'YYYY-MM-DD' (local server day)
  storiesRead: number; // # of `complete` events that day
  uniqueChars: number; // distinct Han chars across the stories read
  totalChars: number; // Han chars with repetition
  readingMinutes: number; // totalChars / READING_HANZI_PER_MIN, rounded (≥1 if any chars)
}

// Local 'YYYY-MM-DD' for an epoch-ms instant. Bucketing uses server-local time — fine for a
// single-family app; if multi-tz ever matters, pass a tz/offset in and format against it.
function localDay(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Per-day reading activity for the weekly calendar (§11). A "reading" = a `complete` interaction
 * (story the learner finished); re-reading counts again. All four metrics key off the completed
 * stories of that day so estimated reading-time (derived from chars) matches what was read. Pure
 * DB read; only days with activity are returned, ascending by date (the UI fills empty days).
 */
export function getReadingActivity(db: Db, learnerId: number): DailyActivity[] {
  const completes = db
    .select({ storyId: interactions.storyId, createdAt: interactions.createdAt })
    .from(interactions)
    .where(and(eq(interactions.learnerId, learnerId), eq(interactions.type, 'complete')))
    .all();
  if (completes.length === 0) return [];

  // storyId → hanzi body (cascade-delete keeps complete rows in sync, so no dangling refs).
  const hanziById = new Map(listStoriesForLearner(db, learnerId).map((s) => [s.id, s.hanzi]));

  const buckets = new Map<string, { stories: number; total: number; chars: Set<string> }>();
  for (const c of completes) {
    const day = localDay(c.createdAt);
    let b = buckets.get(day);
    if (!b) {
      b = { stories: 0, total: 0, chars: new Set<string>() };
      buckets.set(day, b);
    }
    b.stories++;
    for (const ch of hanziById.get(c.storyId) ?? '') {
      if (!isHan(ch)) continue;
      b.total++;
      b.chars.add(ch);
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      storiesRead: b.stories,
      uniqueChars: b.chars.size,
      totalChars: b.total,
      readingMinutes: b.total > 0 ? Math.max(1, Math.round(b.total / READING_HANZI_PER_MIN)) : 0,
    }));
}

export function getLearnerProgress(db: Db, learnerId: number): LearnerProgress {
  const learner = getLearner(db, learnerId);

  // Per-status counts + the known-char string set (one scan of learner_chars + join).
  const knownRows = db
    .select({ char: characters.char, status: learnerChars.status })
    .from(learnerChars)
    .innerJoin(characters, eq(learnerChars.charId, characters.id))
    .where(and(eq(learnerChars.learnerId, learnerId), inArray(learnerChars.status, [...KNOWN_STATUSES])))
    .all();

  const statusCounts = { learning: 0, review: 0, mastered: 0 };
  const knownChars = new Set<string>();
  for (const r of knownRows) {
    knownChars.add(r.char);
    if (r.status in statusCounts) statusCounts[r.status as keyof typeof statusCounts]++;
  }
  const knownCount = knownChars.size;

  const order = buildCurriculum(db);
  const curriculumTotal = order.length;
  const frontierCharId = learner?.settings.frontierCharId ?? null;
  const idx = frontierCharId == null ? -1 : order.indexOf(frontierCharId);
  const frontierIndex = idx >= 0 ? idx : null;
  const curriculumPct = curriculumTotal > 0 ? knownCount / curriculumTotal : 0;

  // Upcoming: next curriculum chars, resolved id → string preserving order.
  const upcomingIds = selectNewChars(db, learnerId, UPCOMING_COUNT);
  const upcomingRows =
    upcomingIds.length === 0
      ? []
      : db.select({ id: characters.id, char: characters.char }).from(characters).where(inArray(characters.id, upcomingIds)).all();
  const idToChar = new Map(upcomingRows.map((r) => [r.id, r.char]));
  const upcoming = upcomingIds.map((id) => idToChar.get(id)).filter((c): c is string => c != null);

  const storiesRead = listStoriesForLearner(db, learnerId).length;

  const rewardTexts: RewardProgress[] = REWARD_TEXTS.map((rt) => {
    const distinct = [...new Set([...rt.text].filter(isHan))];
    const totalChars = distinct.length;
    const known = distinct.filter((c) => knownChars.has(c)).length;
    const coverage = totalChars > 0 ? known / totalChars : 0;
    return {
      id: rt.id,
      title: rt.title,
      author: rt.author,
      text: rt.text,
      knownChars: known,
      totalChars,
      coverage,
      unlocked: coverage >= REWARD_UNLOCK_THRESHOLD,
    };
  });

  return { knownCount, statusCounts, curriculumTotal, frontierIndex, curriculumPct, upcoming, storiesRead, rewardTexts };
}

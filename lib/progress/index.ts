import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { characters, learnerChars } from '../../db/schema';
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

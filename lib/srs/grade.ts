import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import { characters, interactions, learnerChars, stories } from '../../db/schema';
import type { InteractionType } from '../interactions/record';
import {
  MASTERY_STABILITY_DAYS,
  MIN_EXPOSURES_TO_REVIEW,
  signalOfInteractions,
  signalToRating,
  type CharSignal,
} from './constants';
import { schedule, type CardState } from './fsrs';

// Phase 7 — the heart: consume a story's captured `interactions` and advance each learner's
// `learner_chars` FSRS state + mastery status (§10, §16.3). Capture (Phase 5) wrote the raw
// signal faithfully; this is where it becomes schedule. Idempotent per story via `stories.gradedAt`.

export type LearnerCharStatus = 'new' | 'learning' | 'review' | 'mastered';

const HAN = /\p{Script=Han}/gu;

function parseStrArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * §10/§16.3 status machine. Applied after FSRS scheduling, using the new stability and the
 * char's running exposure count. Promotions: new→learning on introduction; learning→review
 * after enough exposures + a comprehension correct; review→mastered past the stability
 * threshold. Self-correction: a weak signal (reveal/wrong) demotes an over-claimed mastered
 * char back to review (FSRS already pulls its due date in).
 */
function nextStatus(
  cur: LearnerCharStatus,
  signal: CharSignal,
  newStability: number,
  newExposures: number,
): LearnerCharStatus {
  let status: LearnerCharStatus = cur === 'new' ? 'learning' : cur;
  if (signal === 'weak') {
    if (status === 'mastered') status = 'review'; // self-correction (§16.3)
    return status;
  }
  if (status === 'learning' && signal === 'correct' && newExposures >= MIN_EXPOSURES_TO_REVIEW) {
    status = 'review';
  }
  if (status === 'review' && newStability >= MASTERY_STABILITY_DAYS) {
    status = 'mastered';
  }
  return status;
}

/**
 * Grade one story's interactions into the learner's `learner_chars` state. No-op (returns
 * `false`) if the story was already graded. Returns `true` when it grades. `now` is injectable
 * for deterministic tests.
 */
export function gradeStory(db: Db, learnerId: number, storyId: number, now: number = Date.now()): boolean {
  return db.transaction((tx) => {
    const story = tx.select().from(stories).where(eq(stories.id, storyId)).get();
    if (!story || story.learnerId !== learnerId) throw new Error(`story ${storyId} not found for learner ${learnerId}`);
    if (story.gradedAt != null) return false; // idempotent — already consumed

    // --- gather signals -------------------------------------------------------------------
    const bodyCount = new Map<string, number>(); // char string → occurrences in body
    for (const m of (story.hanzi ?? '').matchAll(HAN)) bodyCount.set(m[0], (bodyCount.get(m[0]) ?? 0) + 1);

    const targetChars = parseStrArray(story.targetChars);
    const dueChars = parseStrArray(story.dueCharsUsed);

    // resolve every char string we care about to its id (one query)
    const wantStrings = [...new Set([...bodyCount.keys(), ...targetChars, ...dueChars])];
    const strToId = new Map<string, number>();
    if (wantStrings.length > 0) {
      for (const r of tx.select({ id: characters.id, char: characters.char }).from(characters).where(inArray(characters.char, wantStrings)).all()) {
        strToId.set(r.char, r.id);
      }
    }
    const idOf = (s: string) => strToId.get(s);

    const interactionsByChar = new Map<number, InteractionType[]>();
    const revealCount = new Map<number, number>();
    let storyHasDwell = false; // did the reader emit dwell at all? gates the `unseen` fallback below
    for (const row of tx.select({ charId: interactions.charId, type: interactions.type }).from(interactions).where(eq(interactions.storyId, storyId)).all()) {
      if (row.charId == null) continue; // word-level events don't grade a char
      const t = row.type as InteractionType;
      if (t === 'dwell') storyHasDwell = true;
      const arr = interactionsByChar.get(row.charId);
      if (arr) arr.push(t);
      else interactionsByChar.set(row.charId, [t]);
      if (t === 'reveal') revealCount.set(row.charId, (revealCount.get(row.charId) ?? 0) + 1);
    }

    const exposureById = new Map<number, number>(); // charId → body occurrences
    for (const [s, n] of bodyCount) {
      const id = idOf(s);
      if (id != null) exposureById.set(id, n);
    }

    // focus set = chars we reschedule this story: targets ∪ due ∪ any char with a NON-dwell
    // interaction. Dwell alone must NOT pull a char in — otherwise nearly every read (already-known)
    // char would join focus and get rescheduled every story. Dwell only refines a focus char's signal.
    const focus = new Set<number>();
    for (const s of targetChars) { const id = idOf(s); if (id != null) focus.add(id); }
    for (const s of dueChars) { const id = idOf(s); if (id != null) focus.add(id); }
    for (const [id, types] of interactionsByChar) if (types.some((t) => t !== 'dwell')) focus.add(id);

    // --- load current rows for everything we'll touch -------------------------------------
    const touch = new Set<number>([...focus, ...exposureById.keys()]);
    const existing = new Map<number, typeof learnerChars.$inferSelect>();
    if (touch.size > 0) {
      for (const row of tx.select().from(learnerChars).where(and(eq(learnerChars.learnerId, learnerId), inArray(learnerChars.charId, [...touch]))).all()) {
        existing.set(row.charId, row);
      }
    }

    // --- reschedule + promote the focus set -----------------------------------------------
    const rescheduled = new Set<number>();
    for (const charId of focus) {
      const signal = signalOfInteractions(interactionsByChar.get(charId) ?? []);
      // `unseen` = focus char with no interaction. With dwell data present, that means the learner
      // demonstrably did NOT read it this story → no reschedule (exposure-only, handled below). With
      // no dwell data (pre-feature stories / JS off) we can't tell, so fall back to the legacy `pass`.
      if (signal === 'unseen' && storyHasDwell) continue;
      const effective: CharSignal = signal === 'unseen' ? 'pass' : signal;
      const row = existing.get(charId) ?? null;
      const sched = schedule(
        row
          ? ({ status: row.status as LearnerCharStatus, stability: row.stability, difficulty: row.difficulty, due: row.due, lastReview: row.lastReview, reps: row.reps, lapses: row.lapses } satisfies CardState)
          : null,
        signalToRating(effective),
        now,
      );
      const newExposures = (row?.exposures ?? 0) + (exposureById.get(charId) ?? 0);
      const newReveals = (row?.reveals ?? 0) + (revealCount.get(charId) ?? 0);
      const status = nextStatus((row?.status as LearnerCharStatus) ?? 'new', effective, sched.stability, newExposures);

      tx.insert(learnerChars)
        .values({
          learnerId,
          charId,
          status,
          stability: sched.stability,
          difficulty: sched.difficulty,
          due: sched.due,
          lastReview: sched.lastReview,
          reps: sched.reps,
          lapses: sched.lapses,
          exposures: newExposures,
          reveals: newReveals,
        })
        .onConflictDoUpdate({
          target: [learnerChars.learnerId, learnerChars.charId],
          set: {
            status,
            stability: sched.stability,
            difficulty: sched.difficulty,
            due: sched.due,
            lastReview: sched.lastReview,
            reps: sched.reps,
            lapses: sched.lapses,
            exposures: newExposures,
            reveals: newReveals,
          },
        })
        .run();
      rescheduled.add(charId);
    }

    // --- incidental body chars: bump exposures only (no reschedule) ------------------------
    // Also covers focus chars we skipped above (unseen + dwell data): they get their exposure bump
    // here but no FSRS reschedule. Keyed on `rescheduled`, not `focus`, so nothing slips the gap.
    for (const [charId, n] of exposureById) {
      if (rescheduled.has(charId)) continue;
      const row = existing.get(charId);
      if (!row) continue; // only count chars the learner already tracks
      tx.update(learnerChars)
        .set({ exposures: row.exposures + n })
        .where(and(eq(learnerChars.learnerId, learnerId), eq(learnerChars.charId, charId)))
        .run();
    }

    tx.update(stories).set({ gradedAt: now }).where(eq(stories.id, storyId)).run();
    return true;
  });
}

/**
 * Catch-up backstop: grade every not-yet-graded story for a learner, oldest first. Called
 * before selecting the next story's targets/due so selection reflects everything read so far.
 */
export function gradeUngradedStories(db: Db, learnerId: number, now: number = Date.now()): number {
  const ids = db
    .select({ id: stories.id })
    .from(stories)
    .where(and(eq(stories.learnerId, learnerId), isNull(stories.gradedAt)))
    .orderBy(asc(stories.createdAt), asc(stories.id))
    .all()
    .map((r) => r.id);
  let graded = 0;
  for (const id of ids) if (gradeStory(db, learnerId, id, now)) graded++;
  return graded;
}

import { fsrs, createEmptyCard, State, type Card, type Grade } from 'ts-fsrs';
import type { LearnerCharStatus } from './grade';

// Phase 7 scheduling primitives. The `learner_chars` row stores `status` (our 4-value enum,
// incl. `mastered`) + the FSRS scalars, but NOT the FSRS `state`/`scheduled_days`/`learning_steps`.
// We reconstruct a Card from `createEmptyCard` + the stored scalars (FSRS recomputes from
// stability/difficulty/elapsed time, which we do store) and let the scheduler advance it.

const scheduler = fsrs();

/** Map our status enum onto an FSRS lifecycle state for Card reconstruction. */
export function statusToState(status: LearnerCharStatus): State {
  switch (status) {
    case 'new':
      return State.New;
    case 'learning':
      return State.Learning;
    case 'review':
    case 'mastered':
      return State.Review;
  }
}

/** The FSRS scalars `gradeStory` writes back to a `learner_chars` row. */
export interface ScheduledState {
  stability: number;
  difficulty: number;
  due: number; // epoch ms
  lastReview: number; // epoch ms
  reps: number;
  lapses: number;
}

/** Current FSRS scalars of a char being graded, or null if it has no row yet (new target). */
export interface CardState {
  status: LearnerCharStatus;
  stability: number | null;
  difficulty: number | null;
  due: number | null;
  lastReview: number | null;
  reps: number;
  lapses: number;
}

function toCard(state: CardState | null, now: number): Card {
  const card = createEmptyCard(now);
  if (!state) return card;
  return {
    ...card,
    state: statusToState(state.status),
    stability: state.stability ?? card.stability,
    difficulty: state.difficulty ?? card.difficulty,
    due: state.due != null ? new Date(state.due) : card.due,
    last_review: state.lastReview != null ? new Date(state.lastReview) : undefined,
    reps: state.reps,
    lapses: state.lapses,
  };
}

/**
 * Advance a char's FSRS state by one review at `grade`. Pure: builds a Card from the stored
 * scalars (or an empty New card for a brand-new target), runs the scheduler, and returns the
 * new scalars to persist. `now` is the review time.
 */
export function schedule(state: CardState | null, grade: Grade, now: number): ScheduledState {
  const { card } = scheduler.next(toCard(state, now), now, grade);
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.getTime(),
    lastReview: (card.last_review ?? new Date(now)).getTime(),
    reps: card.reps,
    lapses: card.lapses,
  };
}

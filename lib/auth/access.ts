import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { stories } from '../../db/schema';
import { listLearnersByOwner, getLearner, type Learner } from '../learner/crud';

// Per-learner authorization (plan Part B3). This is the single chokepoint every server
// action and learner page goes through, closing the "change the id in the URL" hole.
//
//   - child session  → may touch exactly its own learnerId.
//   - adult session  → may touch any learner it owns (ownerId === userId), so a parent
//                       can review their children's stories/progress.
//
// These functions are PURE DB reads (no next-auth import) so they stay unit-testable with
// makeTestDb. The Auth.js session → SessionContext mapping lives in ./session.

export type SessionContext =
  | { kind: 'adult'; userId: string }
  | { kind: 'child'; learnerId: number };

export class AccessError extends Error {
  constructor(message = 'Not authorized') {
    super(message);
    this.name = 'AccessError';
  }
}

export function canAccessLearner(db: Db, ctx: SessionContext, learnerId: number): boolean {
  if (ctx.kind === 'child') return ctx.learnerId === learnerId;
  const learner = getLearner(db, learnerId);
  return learner != null && learner.ownerId === ctx.userId;
}

export function canAccessStory(db: Db, ctx: SessionContext, storyId: number): boolean {
  const row = db.select({ learnerId: stories.learnerId }).from(stories).where(eq(stories.id, storyId)).get();
  return row != null && canAccessLearner(db, ctx, row.learnerId);
}

export function assertLearnerAccess(db: Db, ctx: SessionContext, learnerId: number): void {
  if (!canAccessLearner(db, ctx, learnerId)) throw new AccessError();
}

export function assertStoryAccess(db: Db, ctx: SessionContext, storyId: number): void {
  if (!canAccessStory(db, ctx, storyId)) throw new AccessError();
}

/** Learners visible to this session: a child sees only itself, an adult sees its children. */
export function listAccessibleLearners(db: Db, ctx: SessionContext): Learner[] {
  if (ctx.kind === 'adult') return listLearnersByOwner(db, ctx.userId);
  const own = getLearner(db, ctx.learnerId);
  return own ? [own] : [];
}

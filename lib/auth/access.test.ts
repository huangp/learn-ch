import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb, type TestDb } from '../test-utils';
import { users, stories } from '../../db/schema';
import { createLearner } from '../learner/crud';
import {
  AccessError,
  assertLearnerAccess,
  assertStoryAccess,
  canAccessLearner,
  canAccessStory,
  listAccessibleLearners,
  type SessionContext,
} from './access';

// Isolation contract (plan Part B): adults reach only their own children; children reach only
// themselves; cross-owner / cross-learner access is denied.

let t: TestDb;
let c1: number; // child of adult A
let c2: number; // child of adult A
let c3: number; // child of adult B
let storyOfC1: number;

const adultA: SessionContext = { kind: 'adult', userId: 'userA' };
const adultB: SessionContext = { kind: 'adult', userId: 'userB' };

beforeEach(() => {
  t = makeTestDb();
  t.db.insert(users).values([
    { id: 'userA', email: 'a@example.com', createdAt: 0 },
    { id: 'userB', email: 'b@example.com', createdAt: 0 },
  ]).run();
  c1 = createLearner(t.db, 'C1', {}, 0, 'userA').id;
  c2 = createLearner(t.db, 'C2', {}, 0, 'userA').id;
  c3 = createLearner(t.db, 'C3', {}, 0, 'userB').id;
  storyOfC1 = t.db.insert(stories).values({ learnerId: c1, createdAt: 0 }).returning().get().id;
});

afterEach(() => t.cleanup());

describe('canAccessLearner', () => {
  it('adult reaches their own children but not another adult’s', () => {
    expect(canAccessLearner(t.db, adultA, c1)).toBe(true);
    expect(canAccessLearner(t.db, adultA, c2)).toBe(true);
    expect(canAccessLearner(t.db, adultA, c3)).toBe(false);
    expect(canAccessLearner(t.db, adultB, c1)).toBe(false);
  });

  it('child reaches only itself', () => {
    const child1: SessionContext = { kind: 'child', learnerId: c1 };
    expect(canAccessLearner(t.db, child1, c1)).toBe(true);
    expect(canAccessLearner(t.db, child1, c2)).toBe(false);
    expect(canAccessLearner(t.db, child1, c3)).toBe(false);
  });
});

describe('canAccessStory', () => {
  it('follows the story’s owning learner', () => {
    expect(canAccessStory(t.db, adultA, storyOfC1)).toBe(true);
    expect(canAccessStory(t.db, adultB, storyOfC1)).toBe(false);
    expect(canAccessStory(t.db, { kind: 'child', learnerId: c1 }, storyOfC1)).toBe(true);
    expect(canAccessStory(t.db, { kind: 'child', learnerId: c2 }, storyOfC1)).toBe(false);
  });

  it('denies unknown stories', () => {
    expect(canAccessStory(t.db, adultA, 999999)).toBe(false);
  });
});

describe('listAccessibleLearners', () => {
  it('adult gets their children; child gets only itself', () => {
    expect(listAccessibleLearners(t.db, adultA).map((l) => l.id).sort()).toEqual([c1, c2].sort());
    expect(listAccessibleLearners(t.db, adultB).map((l) => l.id)).toEqual([c3]);
    expect(listAccessibleLearners(t.db, { kind: 'child', learnerId: c1 }).map((l) => l.id)).toEqual([c1]);
  });
});

describe('assert helpers', () => {
  it('throw AccessError when denied, pass when allowed', () => {
    expect(() => assertLearnerAccess(t.db, adultA, c1)).not.toThrow();
    expect(() => assertLearnerAccess(t.db, adultA, c3)).toThrow(AccessError);
    expect(() => assertStoryAccess(t.db, adultB, storyOfC1)).toThrow(AccessError);
  });
});

import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db';
import { learners, stories } from '../../db/schema';
import type { AnnotatedSegment } from '../annotate/index';
import type { Choice, ComprehensionQuestion, GenerationMeta, GlossaryEntry, StoryJson } from '../generation/types';

// Phase 5 — story persistence. The generation engine (Phase 3) and annotation layer
// (Phase 4) are both pure and write nothing; this module is the first writer of the
// `stories` table. The annotated body, comprehension questions and branch choices all
// live together in the `annotated` JSON column so the reader has one payload to load.

interface AnnotatedPayload {
  segments: AnnotatedSegment[];
  questions: ComprehensionQuestion[];
  choices: Choice[];
  /** §8.5 soft-gloss: the out-of-vocab words declared for this story (also flagged on segments). */
  glossary: GlossaryEntry[];
}

export interface StoryRecord {
  id: number;
  learnerId: number;
  title: string | null;
  hanzi: string;
  segments: AnnotatedSegment[];
  questions: ComprehensionQuestion[];
  choices: Choice[];
  glossary: GlossaryEntry[];
  targetChars: string[];
  dueCharsUsed: string[];
  theme: string | null;
  parentStoryId: number | null;
  meta: GenerationMeta | null;
  createdAt: number;
}

export interface CreateStoryInput {
  learnerId: number;
  story: StoryJson;
  meta: GenerationMeta;
  segments: AnnotatedSegment[];
  /** Resolved due-char strings actually woven into this story (for §5.3 dueCharsUsed). */
  dueChars?: string[];
  theme?: string;
  parentStoryId?: number;
  now?: number;
}

/** Persist a generated + annotated story; returns the new row id. */
export function createStory(db: Db, input: CreateStoryInput): { id: number } {
  const { story, meta, segments } = input;
  const annotated: AnnotatedPayload = {
    segments,
    questions: story.comprehensionQuestions,
    choices: story.choices,
    glossary: story.glossary,
  };
  const row = db
    .insert(stories)
    .values({
      learnerId: input.learnerId,
      title: story.title,
      hanzi: story.body,
      annotated: JSON.stringify(annotated),
      targetChars: JSON.stringify(story.targetCharsUsed),
      dueCharsUsed: JSON.stringify(input.dueChars ?? []),
      theme: input.theme ?? null,
      parentStoryId: input.parentStoryId ?? null,
      meta: JSON.stringify(meta),
      createdAt: input.now ?? Date.now(),
    })
    .returning({ id: stories.id })
    .get();
  return { id: row.id };
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toRecord(row: typeof stories.$inferSelect): StoryRecord {
  const annotated = parseJson<Partial<AnnotatedPayload>>(row.annotated, {});
  return {
    id: row.id,
    learnerId: row.learnerId,
    title: row.title,
    hanzi: row.hanzi ?? '',
    segments: annotated.segments ?? [],
    questions: annotated.questions ?? [],
    choices: annotated.choices ?? [],
    glossary: annotated.glossary ?? [],
    targetChars: parseJson<string[]>(row.targetChars, []),
    dueCharsUsed: parseJson<string[]>(row.dueCharsUsed, []),
    theme: row.theme,
    parentStoryId: row.parentStoryId,
    meta: parseJson<GenerationMeta | null>(row.meta, null),
    createdAt: row.createdAt,
  };
}

// Learner-facing reads hide soft-deleted stories (deletedAt set). Stats/grading queries
// (lib/interactions/stats, lib/srs/grade) intentionally do NOT filter, so deleting keeps progress.
export function getStory(db: Db, id: number): StoryRecord | null {
  const row = db.select().from(stories).where(and(eq(stories.id, id), isNull(stories.deletedAt))).get();
  return row ? toRecord(row) : null;
}

/** A reuse candidate: a story owned by ANOTHER learner under the same account, + its owner's name. */
export interface ReusableCandidate extends StoryRecord {
  /** Display name of the source learner (same parent account) — the reuse attribution. */
  sourceLearnerName: string;
}

/**
 * Cross-learner reuse pool (lib/story/reuse.ts): live, non-branch stories owned by OTHER learners
 * under the **same parent account** (`learners.ownerId`). The same-owner join is the privacy
 * boundary — siblings on one account share stories; different families never do.
 */
export function listReusableCandidates(db: Db, learnerId: number, ownerId: string): ReusableCandidate[] {
  return db
    .select({ story: stories, name: learners.displayName })
    .from(stories)
    .innerJoin(learners, eq(stories.learnerId, learners.id))
    .where(
      and(
        isNull(stories.deletedAt),
        isNull(stories.parentStoryId),
        ne(stories.learnerId, learnerId),
        eq(learners.ownerId, ownerId),
      ),
    )
    .all()
    .map((r) => ({ ...toRecord(r.story), sourceLearnerName: r.name }));
}

export interface ReuseStoryInput {
  learnerId: number;
  /** The story being cloned (its body-derived content carries over verbatim). */
  source: StoryRecord;
  /** New chars this story teaches the RECIPIENT (their own targets, not the source's). */
  targetChars: string[];
  /** Recipient's due chars the body reinforces. */
  dueChars: string[];
  /** Reuse-tagged meta (source meta + reusedFrom* attribution). */
  meta: GenerationMeta;
  now?: number;
}

/**
 * Clone a story for a different learner (same account). Copies the learner-agnostic content
 * (title/hanzi/annotated segments+questions+choices+glossary) verbatim — no re-annotation, no LLM —
 * but records the RECIPIENT's targets/due and a fresh `createdAt`. `parentStoryId` is null (a fresh
 * story in the recipient's tree). Returns the new row id.
 */
export function reuseStory(db: Db, input: ReuseStoryInput): { id: number } {
  const { source } = input;
  const annotated: AnnotatedPayload = {
    segments: source.segments,
    questions: source.questions,
    choices: source.choices,
    glossary: source.glossary,
  };
  const row = db
    .insert(stories)
    .values({
      learnerId: input.learnerId,
      title: source.title,
      hanzi: source.hanzi,
      annotated: JSON.stringify(annotated),
      targetChars: JSON.stringify(input.targetChars),
      dueCharsUsed: JSON.stringify(input.dueChars),
      theme: source.theme,
      parentStoryId: null,
      meta: JSON.stringify(input.meta),
      createdAt: input.now ?? Date.now(),
    })
    .returning({ id: stories.id })
    .get();
  return { id: row.id };
}

/** Stories for a learner, newest first (excludes soft-deleted). */
export function listStoriesForLearner(db: Db, learnerId: number): StoryRecord[] {
  return db
    .select()
    .from(stories)
    .where(and(eq(stories.learnerId, learnerId), isNull(stories.deletedAt)))
    .orderBy(desc(stories.createdAt), desc(stories.id))
    .all()
    .map(toRecord);
}

/**
 * Soft-delete a story: hide it from the learner (list + reader) while keeping its interactions and
 * the FSRS progress they fed. Idempotent — re-deleting an already-deleted story is a no-op. Returns
 * true when a live story was deleted.
 */
export function softDeleteStory(db: Db, storyId: number, now?: number): boolean {
  const res = db
    .update(stories)
    .set({ deletedAt: now ?? Date.now() })
    .where(and(eq(stories.id, storyId), isNull(stories.deletedAt)))
    .run();
  return res.changes > 0;
}

/**
 * Permanently delete a story (adult-only path). Removes the row and — via the `interactions` FK
 * `onDelete: 'cascade'` — its captured reading events. Returns true when a row was deleted.
 */
export function hardDeleteStory(db: Db, storyId: number): boolean {
  const res = db.delete(stories).where(eq(stories.id, storyId)).run();
  return res.changes > 0;
}

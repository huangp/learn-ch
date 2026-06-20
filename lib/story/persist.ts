import { desc, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { stories } from '../../db/schema';
import type { AnnotatedSegment } from '../annotate/index';
import type { Choice, ComprehensionQuestion, GenerationMeta, StoryJson } from '../generation/types';

// Phase 5 — story persistence. The generation engine (Phase 3) and annotation layer
// (Phase 4) are both pure and write nothing; this module is the first writer of the
// `stories` table. The annotated body, comprehension questions and branch choices all
// live together in the `annotated` JSON column so the reader has one payload to load.

interface AnnotatedPayload {
  segments: AnnotatedSegment[];
  questions: ComprehensionQuestion[];
  choices: Choice[];
}

export interface StoryRecord {
  id: number;
  learnerId: number;
  title: string | null;
  hanzi: string;
  segments: AnnotatedSegment[];
  questions: ComprehensionQuestion[];
  choices: Choice[];
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
    targetChars: parseJson<string[]>(row.targetChars, []),
    dueCharsUsed: parseJson<string[]>(row.dueCharsUsed, []),
    theme: row.theme,
    parentStoryId: row.parentStoryId,
    meta: parseJson<GenerationMeta | null>(row.meta, null),
    createdAt: row.createdAt,
  };
}

export function getStory(db: Db, id: number): StoryRecord | null {
  const row = db.select().from(stories).where(eq(stories.id, id)).get();
  return row ? toRecord(row) : null;
}

/** Stories for a learner, newest first. */
export function listStoriesForLearner(db: Db, learnerId: number): StoryRecord[] {
  return db
    .select()
    .from(stories)
    .where(eq(stories.learnerId, learnerId))
    .orderBy(desc(stories.createdAt), desc(stories.id))
    .all()
    .map(toRecord);
}

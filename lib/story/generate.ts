import { inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { characters } from '../../db/schema';
import type { LlmProvider } from '../llm/index';
import { getLearner } from '../learner/crud';
import { selectDueChars, selectNewChars } from '../grading/select';
import { generateGradedStory } from '../generation/generate';
import { annotate } from '../annotate/index';
import { resolveHeteronyms } from '../annotate/llm';
import { createStory, getStory, type StoryRecord } from './persist';

// Phase 5 — persistent analog of cli/run-profile.ts `generateForProfile`, but against an
// EXISTING learner and with the two steps the CLI/pure layer omit: the explicit
// `resolveHeteronyms` heteronym pass (CLAUDE.md: Phase 5 must call it after annotate())
// and persistence to the `stories` table. Targets/due come from the Phase-6 selectors.

export interface GenerateStoryOptions {
  theme?: string;
  /** New target chars to introduce; defaults to 2 in bootstrap, else 3 (mirrors the CLI). */
  targets?: number;
  /** Due review chars to weave in; defaults to 0 in bootstrap, else 3. */
  due?: number;
  lengthChars?: number;
  maxWords?: number;
  /** Branch continuation: the parent story body + its id (§8 priorStory / parentStoryId). */
  priorStory?: string;
  parentStoryId?: number;
  model?: string;
  now?: number;
}

function resolveChars(db: Db, ids: number[]): string[] {
  if (ids.length === 0) return [];
  const rows = db.select({ id: characters.id, char: characters.char }).from(characters).where(inArray(characters.id, ids)).all();
  const map = new Map(rows.map((r) => [r.id, r.char]));
  return ids.map((id) => map.get(id)).filter((c): c is string => c != null);
}

/** Generate, annotate (incl. heteronym pass), and persist the next story for a learner. */
export async function generateAndPersistStory(
  db: Db,
  llm: LlmProvider,
  learnerId: number,
  opts: GenerateStoryOptions = {},
): Promise<StoryRecord> {
  const learner = getLearner(db, learnerId);
  if (!learner) throw new Error(`learner ${learnerId} not found`);
  const bootstrap = learner.settings.bootstrap === true;

  const targets = opts.targets ?? (bootstrap ? 2 : 3);
  const due = opts.due ?? (bootstrap ? 0 : 3);

  const targetCharIds = selectNewChars(db, learnerId, targets);
  const dueCharIds = selectDueChars(db, learnerId, due);

  const { story, meta } = await generateGradedStory(db, llm, learnerId, {
    targetCharIds,
    dueCharIds,
    theme: opts.theme,
    lengthChars: opts.lengthChars,
    maxWords: opts.maxWords,
    bootstrap,
    priorStory: opts.priorStory,
    model: opts.model,
  });

  let segments = annotate(db, story.body);
  segments = await resolveHeteronyms(llm, story.body, segments);

  const { id } = createStory(db, {
    learnerId,
    story,
    meta,
    segments,
    dueChars: resolveChars(db, dueCharIds),
    theme: opts.theme,
    parentStoryId: opts.parentStoryId,
    now: opts.now,
  });

  // createStory just wrote this row, so getStory cannot be null here.
  return getStory(db, id)!;
}

import { inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { characters } from '../../db/schema';
import type { LlmProvider } from '../llm/index';
import { getLearner } from '../learner/crud';
import { getPersona } from '../persona/presets';
import { getGenre } from '../genres/presets';
import { getStorySeed } from '../seeds/presets';
import { selectDueChars, selectNewChars } from '../grading/select';
import { gradeUngradedStories } from '../srs/grade';
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
  /** Stable branch identity (chosen choices[].seed) — threaded into the prompt + persisted in meta. */
  seed?: string;
  /** Override the learner's saved companion (§11); defaults to learner.settings.personaId. */
  personaId?: string;
  /** Per-story genre (§17.1); falls back to learner.settings.genreId unless a custom `theme` is set. */
  genreId?: string;
  /** Retell a plot skeleton (§17.2) — resolved via getStorySeed and woven into generation. */
  seedId?: string;
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

  // Phase 7: grade anything read-but-ungraded first, so target/due selection reflects the
  // learner's latest FSRS state (idempotent — stories finished via gradeStoryAction are skipped).
  gradeUngradedStories(db, learnerId, opts.now);

  const targetCharIds = selectNewChars(db, learnerId, targets);
  const dueCharIds = selectDueChars(db, learnerId, due);
  const persona = getPersona(opts.personaId ?? (learner.settings.personaId as string | undefined));
  const storySeed = getStorySeed(opts.seedId);
  // Genre precedence (§17.1): explicit per-story genre wins; a custom free-text theme suppresses the
  // saved default; otherwise fall back to the learner's saved default genre.
  const genre = getGenre(opts.genreId ?? (opts.theme ? undefined : (learner.settings.genreId as string | undefined)));

  const { story, meta } = await generateGradedStory(db, llm, learnerId, {
    targetCharIds,
    dueCharIds,
    theme: opts.theme,
    lengthChars: opts.lengthChars,
    maxWords: opts.maxWords,
    bootstrap,
    priorStory: opts.priorStory,
    seed: opts.seed,
    persona,
    genre,
    storySeed,
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
    theme: opts.theme ?? genre?.label,
    parentStoryId: opts.parentStoryId,
    now: opts.now,
  });

  // createStory just wrote this row, so getStory cannot be null here.
  return getStory(db, id)!;
}

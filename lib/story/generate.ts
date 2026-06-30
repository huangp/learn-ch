import { and, count, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { characters, learnerChars } from '../../db/schema';
import type { LlmProvider } from '../llm/index';
import type { GenerationMeta, LengthBand } from '../generation/types';
import { deriveLengthBand } from './length';
import { getLearner } from '../learner/crud';
import { getPersona } from '../persona/presets';
import { getGenre } from '../genres/presets';
import { getStorySeed } from '../seeds/presets';
import { selectDueChars, selectNewChars } from '../grading/select';
import { gradeUngradedStories } from '../srs/grade';
import { generateGradedStory } from '../generation/generate';
import { annotate } from '../annotate/index';
import { resolveHeteronyms } from '../annotate/llm';
import { createStory, getStory, reuseStory, type StoryRecord } from './persist';
import { findReusableStory } from './reuse';

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
  /** Override the learner-derived length band (§15 #4); defaults to deriveLengthBand(knownCount). */
  lengthChars?: LengthBand;
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
  /** Try reusing an existing story from a sibling on the same account before generating (default true). */
  reuse?: boolean;
  now?: number;
}

// Statuses that count as "known" (can read) — same set as the allowlist (§7) / progress view.
const KNOWN_STATUSES = ['learning', 'review', 'mastered'] as const;

/** Count of characters the learner can already read — the §15 #4 length-curve input. */
function countKnownChars(db: Db, learnerId: number): number {
  const [row] = db
    .select({ n: count() })
    .from(learnerChars)
    .where(and(eq(learnerChars.learnerId, learnerId), inArray(learnerChars.status, [...KNOWN_STATUSES])))
    .all();
  return row?.n ?? 0;
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

  // Cross-learner reuse (lib/story/reuse.ts): a sibling on the SAME parent account may already have a
  // story that fits this learner. The fit check is pure + fast, so try it before the slow LLM loop.
  // Only for a plain next story — branch continuations (priorStory/parentStoryId) and explicit seed
  // retellings (seedId) are content-constrained, so they always generate fresh.
  const reuseEligible = opts.reuse !== false && !opts.priorStory && opts.parentStoryId == null && !opts.seedId;
  if (reuseEligible) {
    const hit = findReusableStory(db, learnerId, { targets, due, bootstrap });
    if (hit) {
      console.log(
        `[gen] learner ${learnerId}: reusing story #${hit.source.id} from learner ${hit.source.learnerId} ` +
          `(${hit.source.sourceLearnerName}) — instant, no LLM`,
      );
      const base = hit.source.meta;
      const reuseMeta: GenerationMeta = {
        model: 'reuse',
        repairIterations: 0,
        knownCoverage: hit.knownCoverage,
        targetCoverage: hit.targetCoverage,
        perSentenceMin: base?.perSentenceMin ?? 1,
        fallbackUsed: false,
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 0,
        latencyMs: 0,
        personaId: base?.personaId,
        genreId: base?.genreId,
        seedId: base?.seedId,
        reusedFromStoryId: hit.source.id,
        reusedFromLearnerId: hit.source.learnerId,
        reusedFromLearnerName: hit.source.sourceLearnerName,
      };
      const { id } = reuseStory(db, {
        learnerId,
        source: hit.source,
        targetChars: hit.targetChars,
        dueChars: hit.dueCharsUsed,
        meta: reuseMeta,
        now: opts.now,
      });
      return getStory(db, id)!;
    }
  }

  const targetCharIds = selectNewChars(db, learnerId, targets);
  const dueCharIds = selectDueChars(db, learnerId, due);
  // §15 #4: story length grows with the learner — derive the band from known-char count
  // (post-grading, so it reflects the latest state). An explicit override still wins.
  const lengthChars = opts.lengthChars ?? deriveLengthBand(countKnownChars(db, learnerId));
  const storySeed = getStorySeed(opts.seedId);
  // §11: a seed where a recurring companion doesn't fit (real history, public-domain classics)
  // suppresses the persona — content fit wins over the learner's saved/override persona.
  const persona = storySeed?.suppressPersona
    ? undefined
    : getPersona(opts.personaId ?? (learner.settings.personaId as string | undefined));
  // Genre precedence (§17.1): explicit per-story genre wins; a custom free-text theme suppresses the
  // saved default; otherwise fall back to the learner's saved default genre.
  const genre = getGenre(opts.genreId ?? (opts.theme ? undefined : (learner.settings.genreId as string | undefined)));

  // Progress logging — generation runs up to ~6 serial LLM calls (initial + repairs + fallback),
  // during which the browser request just sits "pending". Log each attempt server-side so the dev
  // terminal shows what the loop is doing (which call, pass/fail, why).
  const t0 = Date.now();
  const elapsed = () => Math.round((Date.now() - t0) / 1000);
  console.log(`[gen] learner ${learnerId}: ${targetCharIds.length} target(s), ${dueCharIds.length} due — generating…`);

  const { story, meta } = await generateGradedStory(db, llm, learnerId, {
    targetCharIds,
    dueCharIds,
    theme: opts.theme,
    lengthChars,
    maxWords: opts.maxWords,
    bootstrap,
    priorStory: opts.priorStory,
    seed: opts.seed,
    persona,
    genre,
    storySeed,
    model: opts.model,
    onAttempt: (info) => {
      const tag = `${info.phase}#${info.attempt}`;
      if (info.passed) console.log(`[gen]   ${tag}: ✓ passed (${elapsed()}s)`);
      else {
        const truncated = info.stopReason && info.stopReason !== 'end_turn' && info.stopReason !== 'stop';
        const stop = info.stopReason ? ` [stop: ${info.stopReason}${truncated ? ' — output truncated, raise max_tokens' : ''}]` : '';
        console.log(`[gen]   ${tag}: ✗ ${info.reasons.join('; ') || info.parseError || 'failed'}${stop}`);
      }
    },
  });

  if (meta.belowTarget) console.log(`[gen] ⚠ below target — persisting best-effort draft (${meta.shortfalls?.join('; ')})`);
  console.log(`[gen] story generated in ${elapsed()}s — annotating + resolving heteronyms…`);
  let segments = annotate(db, story.body);
  segments = await resolveHeteronyms(llm, story.body, segments);
  // §8.5 soft-gloss: mark segments matching a declared out-of-vocab word so the reader surfaces them
  // (always-on pinyin + gloss). Pinyin stays whatever the deterministic pipeline produced; the
  // model's English gloss only backfills when the lexicon had none.
  if (story.glossary.length > 0) {
    const glossByWord = new Map(story.glossary.map((g) => [g.word, g.gloss]));
    segments = segments.map((seg) => {
      const g = glossByWord.get(seg.text);
      return g == null ? seg : { ...seg, oov: true, gloss: seg.gloss ?? g };
    });
  }
  console.log(`[gen] done in ${elapsed()}s (model ${meta.model})`);

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

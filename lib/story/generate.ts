import { and, count, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { characters, learnerChars } from '../../db/schema';
import type { LlmProvider } from '../llm/index';
import { GenerationFailed, type AttemptDiagnostics, type GenerationMeta, type LengthBand } from '../generation/types';
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
import { shuffleQuestionOptions } from './shuffle-options';
import { buildAllowlist, getKnownChars } from '../allowlist/index';
import { buildRecognitionItems, draftRecognition, finalizeRecognition } from '../recognition/build';
import { refineRecognition } from '../recognition/refine';

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

type Outcome = 'passed' | 'fallback' | 'below-target' | 'reuse' | 'failed';

const fmtMs = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
const fmtTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
const attemptTag = (a: AttemptDiagnostics) => `${a.phase}#${a.attempt}`;

function outcomeOf(meta: GenerationMeta): Outcome {
  if (meta.belowTarget) return 'below-target';
  return meta.fallbackUsed ? 'fallback' : 'passed';
}

/** End-of-generation metrics block: step timings, per-call LLM latency, gate-failure counts, usage. */
function logSummary(s: {
  learnerId: number;
  storyId?: number;
  outcome: Outcome;
  totalMs: number;
  steps: [string, number][];
  attempts: AttemptDiagnostics[];
  meta?: GenerationMeta;
}): void {
  const story = s.storyId != null ? ` → story #${s.storyId}` : '';
  const lines = [`[gen] ── summary learner ${s.learnerId}${story} ── outcome: ${s.outcome}`];
  lines.push(`[gen]   total ${fmtMs(s.totalMs)} · ${s.steps.map(([n, ms]) => `${n} ${fmtMs(ms)}`).join(' · ')}`);
  if (s.attempts.length) {
    const calls = s.attempts.map((a) => `${attemptTag(a)} ${fmtMs(a.llmMs)} ${a.passed ? '✓' : '✗'}`).join(', ');
    const llmMs = s.attempts.reduce((t, a) => t + a.llmMs, 0);
    const checkMs = s.attempts.reduce((t, a) => t + a.checkMs, 0);
    lines.push(`[gen]   llm calls ${s.attempts.length} (${calls}) · llm total ${fmtMs(llmMs)} · checks ${fmtMs(checkMs)}`);
    const gates = new Map<string, number>();
    for (const a of s.attempts) for (const g of a.failedGates) gates.set(g, (gates.get(g) ?? 0) + 1);
    const ranked = [...gates].sort((x, y) => y[1] - x[1]);
    lines.push(`[gen]   gate failures: ${ranked.length ? ranked.map(([g, n]) => `${g}×${n}`).join(', ') : 'none'}`);
  }
  if (s.meta) {
    const u = s.meta.usage;
    lines.push(
      `[gen]   tokens in ${fmtTok(u.inputTokens)} / out ${fmtTok(u.outputTokens)} / cache r ${fmtTok(u.cacheReadTokens ?? 0)} ` +
        `w ${fmtTok(u.cacheWriteTokens ?? 0)} · cost $${s.meta.costUsd.toFixed(4)} · model ${s.meta.model}`,
    );
    if (s.meta.shortfalls?.length) lines.push(`[gen]   shortfalls: ${s.meta.shortfalls.join('; ')}`);
  }
  console.log(lines.join('\n'));
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

  // Instrumentation — generation runs up to ~6 serial LLM calls (initial + repairs + fallback) plus a
  // heteronym pass, during which the browser request just sits "pending". Time each step, log each
  // attempt (which call, pass/fail, which gates, why), and close with a summary block.
  const t0 = Date.now();
  const steps: [string, number][] = [];
  const attempts: AttemptDiagnostics[] = [];
  const time = <T>(name: string, fn: () => T): T => {
    const start = Date.now();
    const done = () => {
      const ms = Date.now() - start;
      steps.push([name, ms]);
      console.log(`[gen]   step ${name}: ${fmtMs(ms)}`);
    };
    const r = fn();
    if (r instanceof Promise) return r.finally(done) as T;
    done();
    return r;
  };

  // Phase 7: grade anything read-but-ungraded first, so target/due selection reflects the
  // learner's latest FSRS state (idempotent — stories finished via gradeStoryAction are skipped).
  time('grade', () => gradeUngradedStories(db, learnerId, opts.now));

  // Cross-learner reuse (lib/story/reuse.ts): a sibling on the SAME parent account may already have a
  // story that fits this learner. The fit check is pure + fast, so try it before the slow LLM loop.
  // Only for a plain next story — branch continuations (priorStory/parentStoryId) and explicit seed
  // retellings (seedId) are content-constrained, so they always generate fresh.
  const reuseEligible = opts.reuse !== false && !opts.priorStory && opts.parentStoryId == null && !opts.seedId;
  if (reuseEligible) {
    const hit = time('reuse', () => findReusableStory(db, learnerId, { targets, due, bootstrap }));
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
      // Recognition questions follow the RECIPIENT's targets: keep the source's (LLM-refined) items
      // for shared targets, build the rest deterministically — reuse stays instant, no LLM.
      const recognition = time('recognition', () => {
        const fromSource = new Map(hit.source.recognition.map((r) => [r.char, r]));
        const missing = hit.targetChars.filter((c) => !fromSource.has(c));
        const allowed = new Set([...getKnownChars(db, learnerId), ...hit.targetChars]);
        const built = new Map(buildRecognitionItems(db, missing, hit.source.hanzi, allowed).map((r) => [r.char, r]));
        return hit.targetChars.map((c) => fromSource.get(c) ?? built.get(c)).filter((r) => r != null);
      });
      const { id } = time('persist', () =>
        reuseStory(db, {
          learnerId,
          source: hit.source,
          targetChars: hit.targetChars,
          dueChars: hit.dueCharsUsed,
          recognition,
          meta: reuseMeta,
          now: opts.now,
        }),
      );
      logSummary({ learnerId, storyId: id, outcome: 'reuse', totalMs: Date.now() - t0, steps, attempts });
      return getStory(db, id)!;
    }
  }

  const { targetCharIds, dueCharIds, lengthChars } = time('select', () => ({
    targetCharIds: selectNewChars(db, learnerId, targets),
    dueCharIds: selectDueChars(db, learnerId, due),
    // §15 #4: story length grows with the learner — derive the band from known-char count
    // (post-grading, so it reflects the latest state). An explicit override still wins.
    lengthChars: opts.lengthChars ?? deriveLengthBand(countKnownChars(db, learnerId)),
  }));
  const storySeed = getStorySeed(opts.seedId);
  // §11: a seed where a recurring companion doesn't fit (real history, public-domain classics)
  // suppresses the persona — content fit wins over the learner's saved/override persona.
  const persona = storySeed?.suppressPersona
    ? undefined
    : getPersona(opts.personaId ?? (learner.settings.personaId as string | undefined));
  // Genre precedence (§17.1): explicit per-story genre wins; a custom free-text theme suppresses the
  // saved default; otherwise fall back to the learner's saved default genre.
  const genre = getGenre(opts.genreId ?? (opts.theme ? undefined : (learner.settings.genreId as string | undefined)));

  console.log(`[gen] learner ${learnerId}: ${targetCharIds.length} target(s), ${dueCharIds.length} due — generating…`);

  let generated: Awaited<ReturnType<typeof generateGradedStory>>;
  try {
    generated = await time('generate', () =>
      generateGradedStory(db, llm, learnerId, {
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
          attempts.push(info);
          const tag = attemptTag(info);
          const cost = `llm ${fmtMs(info.llmMs)}, check ${fmtMs(info.checkMs)}, tok ${fmtTok(info.inputTokens)}/${fmtTok(info.outputTokens)}`;
          if (info.passed) console.log(`[gen]   ${tag}: ✓ passed (${cost})`);
          else {
            const truncated = info.stopReason && info.stopReason !== 'end_turn' && info.stopReason !== 'stop';
            const stop = info.stopReason ? ` [stop: ${info.stopReason}${truncated ? ' — output truncated, raise max_tokens' : ''}]` : '';
            console.log(
              `[gen]   ${tag}: ✗ [gates: ${info.failedGates.join(', ')}] ${info.reasons.join('; ') || info.parseError || 'failed'}${stop} (${cost})`,
            );
          }
        },
      }),
    );
  } catch (e) {
    if (e instanceof GenerationFailed) {
      logSummary({ learnerId, outcome: 'failed', totalMs: Date.now() - t0, steps, attempts, meta: e.meta });
    }
    throw e;
  }
  const { story, meta } = generated;

  let segments = time('annotate', () => annotate(db, story.body));
  segments = await time('heteronyms', () => resolveHeteronyms(llm, story.body, segments));
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

  // Character-recognition questions (组词造句) for the story's targets: deterministic drafts, then one
  // LLM judge pass that may improve the word/sentence (validated; drafts kept on any failure).
  // Allowed = the same set generation used: known ∪ targets ∪ persona/seed names ∪ glossary chars.
  const recognition = await time('recognition', async () => {
    const allowed = buildAllowlist(db, learnerId, targetCharIds).allowedChars;
    for (const name of [persona?.name ?? '', ...(storySeed?.allowNames ?? []), ...story.glossary.map((g) => g.word)]) {
      for (const c of name) allowed.add(c);
    }
    const drafts = draftRecognition(db, story.targetCharsUsed, story.body, allowed);
    const refined = await refineRecognition(db, llm, drafts, allowed, { model: opts.model });
    return finalizeRecognition(db, refined, story.body);
  });

  // Randomize option order so the correct answer isn't always the LLM's biased index (option A).
  const persisted = { ...story, comprehensionQuestions: shuffleQuestionOptions(story.comprehensionQuestions) };
  const { id } = time('persist', () =>
    createStory(db, {
      learnerId,
      story: persisted,
      meta,
      segments,
      recognition,
      dueChars: resolveChars(db, dueCharIds),
      theme: opts.theme ?? genre?.label,
      parentStoryId: opts.parentStoryId,
      now: opts.now,
    }),
  );
  logSummary({ learnerId, storyId: id, outcome: outcomeOf(meta), totalMs: Date.now() - t0, steps, attempts, meta });

  // createStory just wrote this row, so getStory cannot be null here.
  return getStory(db, id)!;
}

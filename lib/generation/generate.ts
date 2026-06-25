import { inArray } from 'drizzle-orm';
import { buildAllowlist } from '../allowlist/index';
import type { Db } from '../db';
import { characters } from '../../db/schema';
import { costUsd } from '../llm/pricing';
import type { LlmMessage, LlmProvider, LlmUsage } from '../llm/provider';
import { DEFAULT_LENGTH_BAND, K as DEFAULT_K, KNOWN_COVERAGE_FLOOR, MAX_GLOSSED_WORDS, MAX_REPAIRS, MAX_UNKNOWN_CHARS, RELAX_KNOWN_THRESHOLD } from './constants';
import { checkCoverage, type CoverageResult } from './coverage';
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt } from './prompt';
import { parseStoryJson, StoryParseError } from './parse';
import { GenerationFailed, type GenerationConfig, type GenerationMeta, type GenerationResult, type StoryJson } from './types';
import { validateChars, type ValidationResult } from './validate';

// §8.1 the heart — generate → validate → repair. Pure functions do the checking;
// this orchestrates the LLM loop, targeted repair, and the reduced-ambition fallback.

interface Attempt {
  raw: string;
  story?: StoryJson;
  parseError?: string;
  validation?: ValidationResult;
  coverage?: CoverageResult;
  /** §8.5: model declared more glossary words than the budget allows. */
  glossOver?: boolean;
  passed: boolean;
}

const HAN = /\p{Script=Han}/u;

const uniq = (hits: { char: string }[]): string => [...new Set(hits.map((h) => h.char))].join('、');

/** Human-readable reasons an attempt failed its gates (empty = passed). */
function describeFailures(a: Attempt, k: number, bootstrap: boolean, maxUnknown?: number, maxGlossed = MAX_GLOSSED_WORDS): string[] {
  const relaxed = maxUnknown != null;
  const reasons: string[] = [];
  if (a.parseError) reasons.push(`bad JSON: ${a.parseError}`);
  const v = a.validation;
  if (v) {
    // Remaining violations are UNDECLARED out-of-vocab chars (glossed ones aren't violations).
    // Permitted in relaxed mode (bounded by the unknown-char budget below).
    if (v.violations.length && !relaxed) reasons.push(`undeclared out-of-vocab chars: 「${uniq(v.violations)}」`);
    if (v.evasions.length) reasons.push(`evasions (latin/pinyin): 「${uniq(v.evasions)}」`);
  }
  if (a.glossOver) reasons.push(`too many glossary words (max ${maxGlossed}): ${a.story?.glossary.length ?? 0}`);
  const c = a.coverage;
  if (c) {
    if (c.targetsMissing.length) reasons.push(`targets below ${k}×: 「${c.targetsMissing.join('、')}」`);
    if (c.dueMissing.length) reasons.push(`due chars absent: 「${c.dueMissing.join('、')}」`);
    if (relaxed) {
      if (c.unknownChars.length > maxUnknown) {
        reasons.push(`${c.unknownChars.length} unknown chars (max ${maxUnknown}): 「${c.unknownChars.join('、')}」`);
      }
    } else {
      if (c.clusteredTargets.length) reasons.push(`targets clustered in one sentence: 「${c.clusteredTargets.join('、')}」`);
      if (c.lowCoverageSentences.length) {
        const worst = c.lowCoverageSentences.reduce((a, b) => (b.coverage < a.coverage ? b : a));
        reasons.push(
          `${c.lowCoverageSentences.length} sentence(s) below the per-sentence floor (worst ${worst.coverage.toFixed(2)}: 「${worst.text}」)`,
        );
      }
      if (!bootstrap && c.knownCoverage < KNOWN_COVERAGE_FLOOR) {
        reasons.push(`global knownCoverage ${c.knownCoverage.toFixed(3)} below floor ${KNOWN_COVERAGE_FLOOR}`);
      }
    }
  }
  return reasons;
}

/** Resolve charIds → their char strings, preserving caller order. */
function resolveChars(db: Db, ids: number[]): string[] {
  if (ids.length === 0) return [];
  const rows = db.select({ id: characters.id, char: characters.char }).from(characters).where(inArray(characters.id, ids)).all();
  const map = new Map(rows.map((r) => [r.id, r.char]));
  return ids.map((id) => map.get(id)).filter((c): c is string => c != null);
}

export async function generateGradedStory(
  db: Db,
  llm: LlmProvider,
  learnerId: number,
  config: GenerationConfig,
): Promise<GenerationResult> {
  const start = Date.now();
  const k = config.k ?? DEFAULT_K;
  const lengthChars = config.lengthChars ?? DEFAULT_LENGTH_BAND;
  const maxRepairs = config.maxRepairs ?? MAX_REPAIRS;
  const maxGlossed = config.maxGlossed ?? MAX_GLOSSED_WORDS;

  const { allowedChars, allowedWords, targetChars } = buildAllowlist(db, learnerId, config.targetCharIds, {
    maxWords: config.maxWords,
  });
  const due = resolveChars(db, config.dueCharIds ?? []);

  // Companion (§11): the persona recurs in the prose, so its name must pass validateChars and be
  // offered as vocab. The name is a proper noun the learner absorbs by repetition (not an SRS
  // target), so it joins the allowed/known set rather than the target list.
  if (config.persona) {
    for (const c of config.persona.name) allowedChars.add(c);
    if (!allowedWords.some((w) => w.word === config.persona!.name)) {
      allowedWords.push({ word: config.persona.name, pinyin: null, gloss: config.persona.nameEn, freqRank: null, hskLevel: null });
    }
  }

  // Story seed (§17.2): proper nouns in a retelling (e.g. 木兰) must pass validateChars and be
  // offered as vocab, same as the persona name — absorbed by repetition, never SRS targets.
  for (const name of config.storySeed?.allowNames ?? []) {
    for (const c of name) allowedChars.add(c);
    if (!allowedWords.some((w) => w.word === name)) {
      allowedWords.push({ word: name, pinyin: null, gloss: null, freqRank: null, hskLevel: null });
    }
  }

  // "known" = everything the learner can already read = allowedChars minus the new targets.
  const known = new Set(allowedChars);
  for (const t of targetChars) known.delete(t);

  // Small-vocabulary relaxation: below the threshold, the % coverage floors are mathematically
  // hostile, so swap them for an absolute budget of DISTINCT unknown chars and let the model
  // reach beyond the allowed set (those chars still get pinyin/gloss downstream). See §8.3.
  const relaxed = known.size < RELAX_KNOWN_THRESHOLD;
  const maxUnknown = relaxed ? MAX_UNKNOWN_CHARS : undefined;

  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  let model = config.model ?? 'unknown';

  let attemptIndex = 0;

  // Run one LLM turn against the current message thread and check it.
  const runAttempt = async (
    messages: LlmMessage[],
    system: string,
    targets: string[],
    phase: 'initial' | 'repair' | 'fallback',
  ): Promise<Attempt> => {
    // Cache the stable prefix (system + first user msg) on the multi-turn main thread, where
    // repair turns reuse it. The fallback is a single fresh-thread shot — caching it only adds
    // a cache-write surcharge with no read, so leave it off.
    const res = await llm.generate({ system, messages, model: config.model, cache: phase !== 'fallback' });
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
    usage.cacheReadTokens = (usage.cacheReadTokens ?? 0) + (res.usage.cacheReadTokens ?? 0);
    usage.cacheWriteTokens = (usage.cacheWriteTokens ?? 0) + (res.usage.cacheWriteTokens ?? 0);
    model = res.model;

    let a: Attempt;
    try {
      const story = parseStoryJson(res.text);
      // §8.5 soft-gloss: the chars of the model's DECLARED out-of-vocab words pass validation and
      // count as comprehensible in coverage; the count is bounded by maxGlossed.
      const glossedChars = new Set<string>();
      for (const g of story.glossary) for (const c of g.word) if (HAN.test(c)) glossedChars.add(c);
      const glossOver = story.glossary.length > maxGlossed;
      const validation = validateChars(story.body, allowedChars, { relaxed, glossedChars });
      const coverage = checkCoverage(story.body, {
        known,
        targets,
        due,
        k,
        band: config.coverageBand,
        minSentenceCoverage: config.minSentenceCoverage,
        bootstrap: config.bootstrap,
        maxUnknownChars: maxUnknown,
        glossedChars,
      });
      a = { raw: res.text, story, validation, coverage, glossOver, passed: validation.ok && coverage.ok && !glossOver };
    } catch (e) {
      if (e instanceof StoryParseError) a = { raw: res.text, parseError: e.message, passed: false };
      else throw e;
    }

    config.onAttempt?.({
      phase,
      attempt: attemptIndex++,
      passed: a.passed,
      reasons: a.passed ? [] : describeFailures(a, k, config.bootstrap ?? false, maxUnknown, maxGlossed),
      parseError: a.parseError,
      stopReason: res.stopReason,
      knownCoverage: a.coverage?.knownCoverage,
      targetCoverage: a.coverage?.targetCoverage,
      perSentenceMin: a.coverage?.perSentenceMin,
      body: a.story?.body,
    });
    return a;
  };

  const buildMeta = (
    repairIterations: number,
    fallbackUsed: boolean,
    a: Attempt,
    belowTarget = false,
    shortfalls: string[] = [],
  ): GenerationMeta => ({
    model,
    repairIterations,
    knownCoverage: a.coverage?.knownCoverage ?? 0,
    targetCoverage: a.coverage?.targetCoverage ?? 0,
    perSentenceMin: a.coverage?.perSentenceMin ?? 0,
    fallbackUsed,
    usage,
    costUsd: costUsd(model, usage),
    latencyMs: Date.now() - start,
    branchSeed: config.seed,
    personaId: config.persona?.id,
    genreId: config.genre?.id,
    seedId: config.storySeed?.id,
    glossedCount: a.story?.glossary.length ?? 0,
    belowTarget,
    shortfalls,
  });

  // --- Main loop: initial generation + up to maxRepairs targeted repairs. ---
  const system = buildSystemPrompt({ k, lengthChars, maxGlossed });
  const messages: LlmMessage[] = [
    { role: 'user', content: buildUserPrompt({ allowedWords, targets: targetChars, due, theme: config.theme, lengthChars, k, priorStory: config.priorStory, seed: config.seed, persona: config.persona, genre: config.genre, storySeed: config.storySeed, relaxed, maxUnknown, maxGlossed }) },
  ];

  let best: Attempt | null = null;
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const a = await runAttempt(messages, system, targetChars, attempt === 0 ? 'initial' : 'repair');
    best = pickBest(best, a);
    if (a.passed) return { story: a.story!, meta: buildMeta(attempt, false, a) };

    messages.push({ role: 'assistant', content: a.raw });
    messages.push({
      role: 'user',
      content: buildRepairPrompt({
        validation: a.validation,
        coverage: a.coverage,
        parseError: a.parseError,
        k,
        relaxed,
        maxUnknown,
        glossOver: a.glossOver ? { count: a.story?.glossary.length ?? 0, max: maxGlossed } : undefined,
      }),
    });
  }

  // --- Fallback (§8.1): reduce ambition — one target, shorter — fresh thread. ---
  const fbTargets = targetChars.slice(0, 1);
  const fbLength = {
    min: Math.max(40, Math.round(lengthChars.min * 0.7)),
    max: Math.max(60, Math.round(lengthChars.max * 0.7)),
  };
  const fbSystem = buildSystemPrompt({ k, lengthChars: fbLength, maxGlossed });
  const fbMessages: LlmMessage[] = [
    { role: 'user', content: buildUserPrompt({ allowedWords, targets: fbTargets, due, theme: config.theme, lengthChars: fbLength, k, priorStory: config.priorStory, seed: config.seed, persona: config.persona, genre: config.genre, storySeed: config.storySeed, relaxed, maxUnknown, maxGlossed }) },
  ];
  const fb = await runAttempt(fbMessages, fbSystem, fbTargets, 'fallback');
  best = pickBest(best, fb);
  if (fb.passed) return { story: fb.story!, meta: buildMeta(maxRepairs + 1, true, fb) };

  const bestAttempt = best ?? fb;
  const shortfalls = describeFailures(bestAttempt, k, config.bootstrap ?? false, maxUnknown, maxGlossed);

  // Keep the best draft rather than dead-ending: if any attempt parsed into a story, return it
  // flagged belowTarget so the caller can persist + surface it. Only throw when nothing parsed.
  if (bestAttempt.story) {
    return { story: bestAttempt.story, meta: buildMeta(maxRepairs + 1, true, bestAttempt, true, shortfalls) };
  }
  throw new GenerationFailed(
    'No attempt produced a parseable story within the repair + fallback budget.',
    buildMeta(maxRepairs + 1, true, bestAttempt),
    shortfalls,
  );
}

/** Higher score = closer to passing. Used only to attach the best attempt to a failure. */
function score(a: Attempt): number {
  if (!a.story) return -1000;
  const v = a.validation!;
  const c = a.coverage!;
  const defects =
    v.violations.length +
    v.evasions.length +
    c.targetsMissing.length +
    c.dueMissing.length +
    c.lowCoverageSentences.length +
    c.clusteredTargets.length;
  return -defects + c.knownCoverage;
}

function pickBest(best: Attempt | null, a: Attempt): Attempt {
  if (!best) return a;
  return score(a) > score(best) ? a : best;
}

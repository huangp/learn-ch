import { inArray } from 'drizzle-orm';
import { buildAllowlist } from '../allowlist/index.js';
import type { Db } from '../db.js';
import { characters } from '../../db/schema.js';
import { costUsd } from '../llm/pricing.js';
import type { LlmMessage, LlmProvider, LlmUsage } from '../llm/provider.js';
import { DEFAULT_LENGTH_CHARS, K as DEFAULT_K, MAX_REPAIRS } from './constants.js';
import { checkCoverage, type CoverageResult } from './coverage.js';
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt } from './prompt.js';
import { parseStoryJson, StoryParseError } from './parse.js';
import { GenerationFailed, type GenerationConfig, type GenerationMeta, type GenerationResult, type StoryJson } from './types.js';
import { validateChars, type ValidationResult } from './validate.js';

// §8.1 the heart — generate → validate → repair. Pure functions do the checking;
// this orchestrates the LLM loop, targeted repair, and the reduced-ambition fallback.

interface Attempt {
  raw: string;
  story?: StoryJson;
  parseError?: string;
  validation?: ValidationResult;
  coverage?: CoverageResult;
  passed: boolean;
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
  const lengthChars = config.lengthChars ?? DEFAULT_LENGTH_CHARS;
  const maxRepairs = config.maxRepairs ?? MAX_REPAIRS;

  const { allowedChars, allowedWords, targetChars } = buildAllowlist(db, learnerId, config.targetCharIds, {
    maxWords: config.maxWords,
  });
  const due = resolveChars(db, config.dueCharIds ?? []);

  // "known" = everything the learner can already read = allowedChars minus the new targets.
  const known = new Set(allowedChars);
  for (const t of targetChars) known.delete(t);

  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  let model = config.model ?? 'unknown';

  // Run one LLM turn against the current message thread and check it.
  const runAttempt = async (
    messages: LlmMessage[],
    system: string,
    targets: string[],
  ): Promise<Attempt> => {
    const res = await llm.generate({ system, messages, model: config.model });
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
    model = res.model;

    let story: StoryJson;
    try {
      story = parseStoryJson(res.text);
    } catch (e) {
      if (e instanceof StoryParseError) return { raw: res.text, parseError: e.message, passed: false };
      throw e;
    }
    const validation = validateChars(story.body, allowedChars);
    const coverage = checkCoverage(story.body, { known, targets, due, k, bootstrap: config.bootstrap });
    return { raw: res.text, story, validation, coverage, passed: validation.ok && coverage.ok };
  };

  const buildMeta = (repairIterations: number, fallbackUsed: boolean, a: Attempt): GenerationMeta => ({
    model,
    repairIterations,
    knownCoverage: a.coverage?.knownCoverage ?? 0,
    targetCoverage: a.coverage?.targetCoverage ?? 0,
    perSentenceMin: a.coverage?.perSentenceMin ?? 0,
    fallbackUsed,
    usage,
    costUsd: costUsd(model, usage),
    latencyMs: Date.now() - start,
  });

  // --- Main loop: initial generation + up to maxRepairs targeted repairs. ---
  const system = buildSystemPrompt({ k, lengthChars });
  const messages: LlmMessage[] = [
    { role: 'user', content: buildUserPrompt({ allowedWords, targets: targetChars, due, theme: config.theme, lengthChars, k, priorStory: config.priorStory }) },
  ];

  let best: Attempt | null = null;
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const a = await runAttempt(messages, system, targetChars);
    best = pickBest(best, a);
    if (a.passed) return { story: a.story!, meta: buildMeta(attempt, false, a) };

    messages.push({ role: 'assistant', content: a.raw });
    messages.push({
      role: 'user',
      content: buildRepairPrompt({ validation: a.validation, coverage: a.coverage, parseError: a.parseError, k }),
    });
  }

  // --- Fallback (§8.1): reduce ambition — one target, shorter — fresh thread. ---
  const fbTargets = targetChars.slice(0, 1);
  const fbLength = Math.max(40, Math.round(lengthChars * 0.7));
  const fbSystem = buildSystemPrompt({ k, lengthChars: fbLength });
  const fbMessages: LlmMessage[] = [
    { role: 'user', content: buildUserPrompt({ allowedWords, targets: fbTargets, due, theme: config.theme, lengthChars: fbLength, k, priorStory: config.priorStory }) },
  ];
  const fb = await runAttempt(fbMessages, fbSystem, fbTargets);
  best = pickBest(best, fb);
  if (fb.passed) return { story: fb.story!, meta: buildMeta(maxRepairs + 1, true, fb) };

  throw new GenerationFailed(
    'No attempt produced a valid story within the repair + fallback budget.',
    buildMeta(maxRepairs + 1, true, best ?? fb),
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

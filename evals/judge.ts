import { fileURLToPath } from 'node:url';
import { makeTestDb } from '../lib/test-utils';
import { createLlmProvider, type LlmProvider } from '../lib/llm/index';
import { generateGradedStory } from '../lib/generation/generate';
import type { StoryJson } from '../lib/generation/types';
import { buildFixtures } from './fixtures';

// LLM-judge coherence rating (§12). Generates one story per fixture, then asks a
// (configurable, usually stronger) model to rate narrative sense + age-appropriateness
// 1–5. Run on demand: `pnpm eval:judge`. Subjective signal — not part of the CI gate.
// `judgeStory` is reused by the story CLI's `--judge` flag.

export const JUDGE_MODEL = process.env.LLM_JUDGE_MODEL ?? 'claude-sonnet-4-6';

export const JUDGE_SYSTEM = `You are evaluating very short graded Chinese stories written for a teenage
learner (age 11–15) who is learning to read Chinese. Rate two things from 1 (poor) to 5 (excellent):
- coherence: does it tell a sensible little story (not random sentences)?
- ageAppropriateness: is the tone right for a teen (not childish, not adult)?
Reply with ONLY a JSON object: {"coherence": n, "ageAppropriateness": n, "comment": "one short sentence"}.`;

export interface Rating {
  coherence: number;
  ageAppropriateness: number;
  comment: string;
}

function parseRating(raw: string): Rating {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(t);
}

/** Ask the judge model to rate one story's coherence + age-appropriateness (§12). */
export async function judgeStory(judge: LlmProvider, story: StoryJson): Promise<Rating> {
  const res = await judge.generate({
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content: `Title: ${story.title}\n\n${story.body}` }],
  });
  return parseRating(res.text);
}

async function main() {
  const gen = createLlmProvider();
  const judge = createLlmProvider({ model: JUDGE_MODEL });
  const t = makeTestDb();
  try {
    const fixtures = buildFixtures(t.db);
    const scores: number[] = [];

    for (const fx of fixtures) {
      const theme = fx.themes[0];
      process.stdout.write(`· ${fx.name} / ${theme} … `);
      try {
        const { story } = await generateGradedStory(t.db, gen, fx.learnerId, {
          targetCharIds: fx.targetCharIds,
          dueCharIds: fx.dueCharIds,
          theme,
          lengthChars: fx.lengthChars,
          bootstrap: fx.bootstrap,
        });
        const r = await judgeStory(judge, story);
        scores.push(r.coherence, r.ageAppropriateness);
        console.log(`coherence ${r.coherence}/5, age-fit ${r.ageAppropriateness}/5 — ${r.comment}`);
      } catch (e) {
        console.log(`skipped: ${(e as Error).message}`);
      }
    }

    if (scores.length) {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      console.log(`\nmean rating: ${mean.toFixed(2)}/5 over ${scores.length} judgements`);
    }
  } finally {
    t.cleanup();
  }
}

// Only run the CLI when invoked directly (`pnpm eval:judge`), not when imported
// (the story CLI reuses judgeStory).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

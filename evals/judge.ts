import { makeTestDb } from '../lib/test-utils.js';
import { createLlmProvider } from '../lib/llm/index.js';
import { generateGradedStory } from '../lib/generation/generate.js';
import { buildFixtures } from './fixtures.js';

// LLM-judge coherence rating (§12). Generates one story per fixture, then asks a
// (configurable, usually stronger) model to rate narrative sense + age-appropriateness
// 1–5. Run on demand: `pnpm eval:judge`. Subjective signal — not part of the CI gate.

const JUDGE_MODEL = process.env.LLM_JUDGE_MODEL ?? 'claude-sonnet-4-6';

const JUDGE_SYSTEM = `You are evaluating very short graded Chinese stories written for a teenage
learner (age 11–15) who is learning to read Chinese. Rate two things from 1 (poor) to 5 (excellent):
- coherence: does it tell a sensible little story (not random sentences)?
- ageAppropriateness: is the tone right for a teen (not childish, not adult)?
Reply with ONLY a JSON object: {"coherence": n, "ageAppropriateness": n, "comment": "one short sentence"}.`;

function parseRating(raw: string): { coherence: number; ageAppropriateness: number; comment: string } {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(t);
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
        const res = await judge.generate({
          system: JUDGE_SYSTEM,
          messages: [{ role: 'user', content: `Title: ${story.title}\n\n${story.body}` }],
        });
        const r = parseRating(res.text);
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

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

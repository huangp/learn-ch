import { parseArgs } from 'node:util';
import { makeTestDb } from '../lib/test-utils';
import { createLlmProvider } from '../lib/llm/index';
import { KNOWN_COVERAGE_TARGET } from '../lib/generation/constants';
import { GenerationFailed, type AttemptDiagnostics } from '../lib/generation/types';
import { judgeStory, JUDGE_MODEL } from '../evals/judge';
import { generateForProfile, type Profile } from './run-profile';

// `pnpm story` — end-to-end driver. Give a learner profile, get back a validated, graded
// hanzi story plus its eval-harness score. Uses an ephemeral DB copy (no writes to hanzi.db).

const HELP = `Usage: pnpm story [profile] [options]

Profile (pick one; defaults to --hsk 3):
  --hsk <1-6>           known = all chars at/below this HSK level
  --paste "<text>"      known = the distinct Han chars in this text
  --bootstrap           zero-start: known = first N curriculum chars (bootstrap mode)
  --bootstrap-known <n> N for --bootstrap (default 30)

Options:
  --targets <n>         new target chars to introduce (default 3; bootstrap 2)
  --due <n>             review (due) chars to weave in (default 3; bootstrap 0)
  --theme "<text>"      custom story theme (free text; overrides --genre)
  --genre <id>          genre tone steer (§17.1); ids: adventure | mystery | scifi | fantasy |
                        history | friendship | sport | slice-of-life
  --seed <id>           retell a plot skeleton (§17.2); ids: lost-dog | new-school | space-rescue |
                        mulan | sima-guang | silk-road | journey-west-start | tortoise-hare | gua-fu-sun
  --persona <id>        companion persona (xiaolong | xiaoyue | afu)
  --length <n>          approx story length in characters
  --max-words <n>       cap on the vocabulary list given to the model
  --min-sentence-coverage <0-1>  per-sentence known-coverage floor (default 0.85; lower = more lenient)
  --coverage-band <0-1>          global known-coverage hard gate (default 0.90)
  --model <id>          LLM model id (default claude-haiku-4-5)
  --judge               also run the LLM coherence judge (extra LLM call)
  --verbose             log each generation attempt and why it failed
  --help`;

function num(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`expected a number, got "${v}"`);
  return n;
}

function buildProfile(values: Record<string, string | boolean | undefined>): Profile {
  const isBootstrap = values.bootstrap === true;
  const hasPaste = typeof values.paste === 'string';
  const method: Profile['method'] = hasPaste ? 'paste' : isBootstrap ? 'bootstrap' : 'hsk';

  return {
    method,
    hsk: num(values.hsk as string | undefined) ?? 3,
    paste: values.paste as string | undefined,
    bootstrapKnown: num(values['bootstrap-known'] as string | undefined),
    targets: num(values.targets as string | undefined) ?? (isBootstrap ? 2 : 3),
    due: num(values.due as string | undefined) ?? (isBootstrap ? 0 : 3),
    theme: values.theme as string | undefined,
    genreId: values.genre as string | undefined,
    personaId: values.persona as string | undefined,
    seedId: values.seed as string | undefined,
    lengthChars: num(values.length as string | undefined),
    maxWords: num(values['max-words'] as string | undefined),
    minSentenceCoverage: num(values['min-sentence-coverage'] as string | undefined),
    coverageBand: num(values['coverage-band'] as string | undefined),
    model: values.model as string | undefined,
  };
}

function section(title: string): void {
  console.log(`\n${'─'.repeat(60)}\n${title}\n${'─'.repeat(60)}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      hsk: { type: 'string' },
      paste: { type: 'string' },
      bootstrap: { type: 'boolean' },
      'bootstrap-known': { type: 'string' },
      targets: { type: 'string' },
      due: { type: 'string' },
      theme: { type: 'string' },
      genre: { type: 'string' },
      seed: { type: 'string' },
      persona: { type: 'string' },
      length: { type: 'string' },
      'max-words': { type: 'string' },
      'min-sentence-coverage': { type: 'string' },
      'coverage-band': { type: 'string' },
      model: { type: 'string' },
      judge: { type: 'boolean' },
      verbose: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const profile = buildProfile(values);
  const llm = createLlmProvider({ model: profile.model });
  const t = makeTestDb();
  try {
    console.log(`Generating a story (${profile.method}, model ${profile.model ?? 'default'}) …`);
    const onAttempt = values.verbose
      ? (a: AttemptDiagnostics) => {
          const head = `  [attempt ${a.attempt} · ${a.phase}] ${a.passed ? '✓ passed' : '✗ failed'}`;
          const cov = a.knownCoverage != null ? ` (cov ${a.knownCoverage.toFixed(3)}, sentMin ${a.perSentenceMin?.toFixed(2)})` : '';
          console.log(head + cov);
          for (const r of a.reasons) console.log(`      - ${r}`);
        }
      : undefined;
    const { story, meta, info } = await generateForProfile(t.db, llm, profile, { onAttempt });

    section('PROFILE');
    console.log(`method:        ${info.method}${info.bootstrap ? ' (bootstrap)' : ''}`);
    if (profile.genreId) console.log(`genre:         ${profile.genreId}`);
    if (profile.seedId) console.log(`seed:          ${profile.seedId}`);
    console.log(`known chars:   ${info.knownCount}`);
    console.log(`target chars:  ${info.targetChars.join('') || '∅'}`);
    console.log(`due chars:     ${info.dueChars.join('') || '∅'}`);

    section(`STORY — ${story.title}`);
    console.log(story.body);
    if (story.comprehensionQuestions.length > 0) {
      console.log('\nQuestions:');
      for (const q of story.comprehensionQuestions) {
        console.log(`  ${q.q}`);
        q.options.forEach((o, i) => console.log(`    ${i === q.answer ? '✓' : ' '} ${i}. ${o}`));
      }
    }
    if (story.choices.length > 0) {
      console.log('\nBranches:');
      for (const c of story.choices) console.log(`  • ${c.label}  [${c.seed}]`);
    }

    section('SCORE');
    const coverageOk = info.bootstrap || meta.knownCoverage >= KNOWN_COVERAGE_TARGET;
    const pass = meta.targetCoverage >= 1 && !meta.fallbackUsed && meta.repairIterations <= 2 && coverageOk;
    console.log(`knownCoverage:    ${meta.knownCoverage.toFixed(3)}${info.bootstrap ? ' (bootstrap: gate relaxed)' : ` (target ${KNOWN_COVERAGE_TARGET})`}`);
    console.log(`targetCoverage:   ${(meta.targetCoverage * 100).toFixed(0)}% of targets met ≥K`);
    console.log(`perSentenceMin:   ${meta.perSentenceMin.toFixed(3)}`);
    console.log(`repairs:          ${meta.repairIterations}${meta.fallbackUsed ? ' + fallback' : ''}`);
    console.log(`model:            ${meta.model}`);
    console.log(`latency:          ${(meta.latencyMs / 1000).toFixed(1)}s`);
    console.log(`cost:             $${meta.costUsd.toFixed(4)}  (in ${meta.usage.inputTokens} / out ${meta.usage.outputTokens})`);
    console.log(`verdict:          ${pass ? '✓ PASS' : '⚠ WARN (valid story, below the quality bar)'}`);

    if (values.judge) {
      section('COHERENCE JUDGE');
      console.log(`(judge model: ${JUDGE_MODEL})`);
      const judge = createLlmProvider({ model: JUDGE_MODEL });
      const r = await judgeStory(judge, story);
      console.log(`coherence:        ${r.coherence}/5`);
      console.log(`ageAppropriate:   ${r.ageAppropriateness}/5`);
      console.log(`comment:          ${r.comment}`);
    }
  } catch (e) {
    if (e instanceof GenerationFailed) {
      section('GENERATION FAILED');
      console.error(e.message);
      console.error(`best attempt — knownCoverage ${e.meta.knownCoverage.toFixed(3)}, targetCoverage ${(e.meta.targetCoverage * 100).toFixed(0)}%, repairs ${e.meta.repairIterations}, cost $${e.meta.costUsd.toFixed(4)}`);
      if (e.reasons.length) {
        console.error('why the best attempt still failed:');
        for (const r of e.reasons) console.error(`  - ${r}`);
      }
      console.error('\nTip: re-run with --verbose to see every attempt, or relax with --bootstrap / fewer --targets / a higher --max-words.');
      process.exitCode = 1;
    } else {
      throw e;
    }
  } finally {
    t.cleanup();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

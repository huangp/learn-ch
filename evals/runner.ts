import { mkdirSync, writeFileSync } from 'node:fs';
import { makeTestDb } from '../lib/test-utils.js';
import { createLlmProvider } from '../lib/llm/index.js';
import { generateGradedStory } from '../lib/generation/generate.js';
import { GenerationFailed } from '../lib/generation/types.js';
import { buildFixtures } from './fixtures.js';
import { checkGate, type Aggregate } from './thresholds.js';

// Real-LLM eval runner (§12). Run on demand: `pnpm eval` (needs ANTHROPIC_API_KEY).
// Writes a timestamped metrics file and exits non-zero if the regression gate fails.

interface RunRecord {
  fixture: string;
  theme: string;
  success: boolean;
  repairIterations: number;
  fallbackUsed: boolean;
  knownCoverage: number;
  targetCoverage: number;
  perSentenceMin: number;
  latencyMs: number;
  costUsd: number;
  error?: string;
  title?: string;
  body?: string;
}

function aggregate(records: RunRecord[]): Aggregate & {
  total: number;
  fallbackRate: number;
  meanLatencyMs: number;
  totalCostUsd: number;
  repairHistogram: Record<number, number>;
} {
  const total = records.length;
  const ok = records.filter((r) => r.success);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const repairHistogram: Record<number, number> = {};
  for (const r of records) repairHistogram[r.repairIterations] = (repairHistogram[r.repairIterations] ?? 0) + 1;

  return {
    total,
    successRate: total ? ok.length / total : 0,
    withinTwoRepairsRate: total ? records.filter((r) => r.success && !r.fallbackUsed && r.repairIterations <= 2).length / total : 0,
    meanKnownCoverage: mean(ok.map((r) => r.knownCoverage)),
    targetCoverageRate: ok.length ? ok.filter((r) => r.targetCoverage >= 1).length / ok.length : 0,
    fallbackRate: total ? records.filter((r) => r.fallbackUsed).length / total : 0,
    meanLatencyMs: mean(records.map((r) => r.latencyMs)),
    totalCostUsd: records.reduce((a, r) => a + r.costUsd, 0),
    repairHistogram,
  };
}

async function main() {
  const llm = createLlmProvider();
  const t = makeTestDb();
  try {
    const fixtures = buildFixtures(t.db);
    const records: RunRecord[] = [];

    for (const fx of fixtures) {
      for (const theme of fx.themes) {
        process.stdout.write(`· ${fx.name} / ${theme} … `);
        try {
          const { story, meta } = await generateGradedStory(t.db, llm, fx.learnerId, {
            targetCharIds: fx.targetCharIds,
            dueCharIds: fx.dueCharIds,
            theme,
            lengthChars: fx.lengthChars,
            bootstrap: fx.bootstrap,
          });
          records.push({
            fixture: fx.name,
            theme,
            success: true,
            repairIterations: meta.repairIterations,
            fallbackUsed: meta.fallbackUsed,
            knownCoverage: meta.knownCoverage,
            targetCoverage: meta.targetCoverage,
            perSentenceMin: meta.perSentenceMin,
            latencyMs: meta.latencyMs,
            costUsd: meta.costUsd,
            title: story.title,
            body: story.body,
          });
          console.log(`ok (repairs ${meta.repairIterations}${meta.fallbackUsed ? '+fallback' : ''}, cov ${meta.knownCoverage.toFixed(2)})`);
        } catch (e) {
          const meta = e instanceof GenerationFailed ? e.meta : undefined;
          records.push({
            fixture: fx.name,
            theme,
            success: false,
            repairIterations: meta?.repairIterations ?? -1,
            fallbackUsed: meta?.fallbackUsed ?? false,
            knownCoverage: meta?.knownCoverage ?? 0,
            targetCoverage: meta?.targetCoverage ?? 0,
            perSentenceMin: meta?.perSentenceMin ?? 0,
            latencyMs: meta?.latencyMs ?? 0,
            costUsd: meta?.costUsd ?? 0,
            error: (e as Error).message,
          });
          console.log(`FAILED: ${(e as Error).message}`);
        }
      }
    }

    const agg = aggregate(records);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
    const outPath = new URL(`./results/${stamp}.json`, import.meta.url);
    writeFileSync(outPath, JSON.stringify({ stamp, aggregate: agg, records }, null, 2));

    console.log('\n=== Aggregate ===');
    console.log(`runs:                  ${agg.total}`);
    console.log(`success rate:          ${(agg.successRate * 100).toFixed(0)}%`);
    console.log(`within ≤2 repairs:     ${(agg.withinTwoRepairsRate * 100).toFixed(0)}%`);
    console.log(`mean knownCoverage:    ${agg.meanKnownCoverage.toFixed(3)}`);
    console.log(`target coverage rate:  ${(agg.targetCoverageRate * 100).toFixed(0)}%`);
    console.log(`fallback rate:         ${(agg.fallbackRate * 100).toFixed(0)}%`);
    console.log(`repair histogram:      ${JSON.stringify(agg.repairHistogram)}`);
    console.log(`mean latency:          ${(agg.meanLatencyMs / 1000).toFixed(1)}s`);
    console.log(`total cost:            $${agg.totalCostUsd.toFixed(4)}`);
    console.log(`\nresults → ${outPath.pathname}`);

    const failures = checkGate(agg);
    if (failures.length > 0) {
      console.error('\n✗ Regression gate FAILED:');
      for (const f of failures) console.error(`  ${f.metric}: ${f.actual.toFixed(3)} < ${f.threshold}`);
      process.exitCode = 1;
    } else {
      console.log('\n✓ Regression gate passed.');
    }
  } finally {
    t.cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

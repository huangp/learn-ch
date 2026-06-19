# Evals (Phase 3, §12)

The generation engine's health metric. Real-LLM runs are **on demand** (cost + need a key);
the deterministic checks live in the vitest suite (`lib/generation/*.test.ts`).

## Run

```bash
cp .env.example .env   # set ANTHROPIC_API_KEY
pnpm eval              # generate over fixtures → metrics + regression gate
pnpm eval:judge        # LLM-judge coherence (1–5) on a sample
```

`pnpm eval` writes a timestamped JSON to `evals/results/` (gitignored) and exits non-zero if the
regression gate (`thresholds.ts`) fails.

## Pieces
- `fixtures.ts` — ~5 learner profiles (HSK1→HSK4 + bootstrap), seeded in an ephemeral DB copy.
  Targets/due come from a **thin local helper** standing in for the deferred Phase 6
  `selectNewChars`/`selectDueChars`.
- `runner.ts` — runs each fixture × theme, aggregates first-pass/repair/coverage/fallback/latency/cost.
- `judge.ts` — coherence + age-appropriateness rating (subjective; not gated).
- `thresholds.ts` — the regression gate (provisional §8 acceptance numbers).

## Deferred (not faked)
The §12 **coverage-vs-comprehension regression** — regressing comprehension-question accuracy and
tap-to-reveal rate against measured `knownCoverage` to empirically tune the coverage band (§8.3.1) —
needs real reading-session interaction data, first produced in Phase 5/7. The harness structure and
the static metric gate are here; that analysis is intentionally left for later.

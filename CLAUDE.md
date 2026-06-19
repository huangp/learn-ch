# Project: Hanzi Graded Reader

Goal: teach teens (11–15) to READ Chinese via personalized graded stories.
Generation is constrained by a WORD allowlist (not char list) and validated at char level.
LLM emits hanzi-only JSON; pinyin/gloss are added deterministically by pinyin-pro — never trust the model for pinyin.
Curriculum is a component-aware topological order (a char never precedes its components).
SRS (FSRS) drives WHICH due chars appear in the next story, not flashcards.
Always keep the eval harness (/evals) green when touching /lib/generation or /prompts.
Build order: Phase 0 → 1 → 2 → 6 → 3 (+evals) → 4 → 5 → 7 → 8.

See IMPLEMENTATION_PLAN.md for the full spec.

## Data layer (Phase 0 — done)

- `pnpm data:download` — fetch raw sources to `/data/raw/` (gitignored) + write `manifest.json` checksums.
- `pnpm db:generate` — regenerate Drizzle migrations from `db/schema.ts` (only after schema edits).
- `pnpm data:build` — (auto-downloads if missing) create `data/hanzi.db` via migrations and seed `characters`, `char_components`, `words`.
- `pnpm data:verify` — assert Phase 0 acceptance (row counts, no orphan edges, every HSK1 char resolvable).

Schema lives in `db/schema.ts`; migrations in `db/migrations/`. v1 is Simplified-only.

## Learner layer (Phase 1 — done)

Schema + four-path placement (§16) + `seedLearner` + learner CRUD. Pure lib/DB layer — no UI
yet (the four paths are resolver functions; Phase 5 wires UIs to them).

- `pnpm db:migrate` — apply pending migrations to the **existing** `hanzi.db` **without** reseeding
  (unlike `data:build`, which wipes + reseeds). Run this after `db:generate`, never `data:build`,
  for learner-table changes.
- `pnpm test` — vitest unit tests (`lib/**/*.test.ts`). Keep green when touching `/lib`.

Tables added (§5.3): `learners`, `learner_chars` (composite PK, FSRS columns, `ON DELETE CASCADE`).
`stories` + `interactions` are defined but **unused until Phase 5** (Phase 3 generation is pure and
does not persist; added now to avoid a migration each later phase). `lib/db.ts` is the shared Drizzle
handle (`foreign_keys = ON`).

Key modules:
- `lib/grading/curriculum.ts` — `buildCurriculum`/`computeFrontier`. This is the **Phase 6 core**
  pulled forward (build order says 6 after 1, but the frontier needs it). Phase 6 adds
  `selectNewChars`/`selectDueChars` on top — extend this file, don't rewrite it.
- `lib/placement/index.ts` — `selfDeclareHsk` · `fromPastedText` · `fromToggleGrid` · `fromZero`,
  all returning `charId[]`.
- `lib/learner/seed.ts` — `seedLearner`: known chars → `review` (never `mastered`), freq-scaled
  FSRS stability (via `ts-fsrs`), jittered/spread due dates, bootstrap flag (`<50` chars), frontier.
  Re-runs are non-downgrading (`onConflictDoNothing`).
- `lib/learner/crud.ts` — create/get/list/update(merge settings)/delete.

## Allowlist layer (Phase 2 — done)

`buildAllowlist(db, learnerId, targetCharIds, opts?)` in `lib/allowlist/index.ts` (§7). Given a
learner + the new target chars, returns `{ allowedChars, targetChars, allowedWords }` — the
word-level vocabulary the generation engine (Phase 3) feeds the LLM. Pure DB read (no writes).

- `allowedChars` — Han set: known chars (`learner_chars` status `learning`/`review`/`mastered`)
  ∪ targets. Punctuation/digits are **not** included — Phase 3's `validateChars` strips them.
- `targetChars` — target ids resolved to strings, **kept in input (curriculum) order**.
- `allowedWords` — every char ∈ `allowedChars`, sorted by `freqRank` asc (nulls last), capped at
  `DEFAULT_MAX_WORDS = 600`. Target-coverage backfill guarantees each target has ≥1 example word,
  which can push the list slightly past the cap (≤ +1/target).

## Generation engine + evals (Phase 3 — done)

The generate → validate → repair heart (§8). `generateGradedStory(db, llm, learnerId, config)` in
`lib/generation/generate.ts`: builds the allowlist, runs the LLM loop, returns `{ story, meta }`.
**Pure** — reads only via `buildAllowlist`; does **not** write `stories` (persistence is Phase 5).

- `pnpm test` — vitest (`lib/**/*.test.ts`); now includes the deterministic `lib/generation` tests.
- `pnpm typecheck` — `tsc` over `lib` + `evals` + `cli`. Keep both green when touching `/lib/generation`,
  `/lib/llm`, or `/prompts`.
- `pnpm eval` / `pnpm eval:judge` — **real-LLM, on-demand** (need `ANTHROPIC_API_KEY` in `.env`,
  loaded via `tsx --env-file`). `eval` runs fixtures → metrics + regression gate; `eval:judge` rates
  coherence. Not part of CI (unit tests cover the deterministic logic with a mock).
- `pnpm story` — **end-to-end driver** (`cli/`). Give a profile (`--hsk N` / `--paste "…"` /
  `--bootstrap`), get a validated, graded hanzi story + its SCORE block; `--judge` adds the coherence
  rating. Uses an ephemeral DB copy (no writes to `hanzi.db`). `cli/run-profile.ts` (`generateForProfile`)
  is the shared glue: placement → seed → `evals/select.ts` targets/due → `generateGradedStory`.
- `pnpm test:integration` — the gated `cli/story.integration.test.ts` (real LLM, skipped unless
  `ANTHROPIC_API_KEY` is set); run with the key exported.

Targets/due are **explicit inputs** (`config.targetCharIds`/`dueCharIds`) — the Phase 6 selectors
`selectNewChars`/`selectDueChars` are deferred; `evals/fixtures.ts` has a thin local stand-in.

Key modules:
- `lib/generation/validate.ts` — `validateChars(body, allowedChars)`: out-of-vocab Han chars +
  evasions (latin/pinyin tone marks). Pure, unit-tested (§8.2).
- `lib/generation/coverage.ts` — `checkCoverage(body, opts)`: target ≥`K`, due present, global +
  per-sentence coverage floors, target spread. `bootstrap:true` relaxes the coverage gates (§16.4);
  `validateChars` still enforces the allowed set. Pure, unit-tested (§8.3).
- `lib/generation/types.ts` — **Zod**-validated §8.5 output contract (`StoryJson`); `parse.ts`
  tolerates markdown fences and yields repair-friendly errors.
- `lib/generation/constants.ts` — provisional, eval-tunable: `K=2`, `DEFAULT_LENGTH_CHARS=100`,
  `MAX_REPAIRS=4`, `KNOWN_COVERAGE_TARGET=0.95`, `KNOWN_COVERAGE_FLOOR=0.90` (hard gate),
  `MIN_SENTENCE_COVERAGE=0.85`.
- `lib/llm/` — provider-agnostic `LlmProvider`; `createLlmProvider()` defaults to Anthropic +
  `claude-haiku-4-5` (override via `LLM_PROVIDER`/`LLM_MODEL`). `MockLlmProvider` drives the loop in
  tests with no key/network.
- `/prompts/generate.system.md` + `/prompts/repair.user.md` — the system + targeted-repair templates
  (the vocab-heavy user prompt is assembled in `lib/generation/prompt.ts`).
- `/evals/` — `fixtures.ts`, `runner.ts`, `judge.ts`, `thresholds.ts`. The §12 coverage-vs-
  comprehension regression is a documented stub (needs Phase 5/7 reading data).

Deferred to later phases: story persistence (5), `selectNewChars`/`selectDueChars` (6),
`repairBySubstitution` synonym fallback, the coverage-band empirical regression (5/7).

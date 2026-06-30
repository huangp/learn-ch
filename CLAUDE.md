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
`stories` + `interactions` are written by **Phase 5** (story persistence + interaction capture);
defined here early to avoid a migration each later phase. `lib/db.ts` is the shared Drizzle
handle (`foreign_keys = ON`).

Key modules:
- `lib/grading/curriculum.ts` — `buildCurriculum`/`computeFrontier`. This is the **Phase 6 core**
  pulled forward (build order says 6 after 1, but the frontier needs it).
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
- `pnpm typecheck` — `tsc -p tsconfig.node.json` over `lib` + `evals` + `cli` + `db` + `data`. Keep
  both green when touching `/lib/generation`, `/lib/llm`, or `/prompts`. (The Next app is type-checked
  separately by `pnpm build`; see "App + tooling".)
- `pnpm eval` / `pnpm eval:judge` — **real-LLM, on-demand** (need `ANTHROPIC_API_KEY` in `.env`,
  loaded via `tsx --env-file`). `eval` runs fixtures → metrics + regression gate; `eval:judge` rates
  coherence. Not part of CI (unit tests cover the deterministic logic with a mock).
- `pnpm story` — **end-to-end driver** (`cli/`). Give a profile (`--hsk N` / `--paste "…"` /
  `--bootstrap`), get a validated, graded hanzi story + its SCORE block; `--judge` adds the coherence
  rating. Uses an ephemeral DB copy (no writes to `hanzi.db`). `cli/run-profile.ts` (`generateForProfile`)
  is the shared glue: placement → seed → `lib/grading/select.ts` targets/due → `generateGradedStory`.
- `pnpm test:integration` — the gated `cli/story.integration.test.ts` (real LLM, skipped unless
  `ANTHROPIC_API_KEY` is set); run with the key exported.

Targets/due are **explicit inputs** (`config.targetCharIds`/`dueCharIds`), now supplied by the
Phase 6 selectors `selectNewChars`/`selectDueChars` (`lib/grading/select.ts`).

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

Deferred to later phases: `repairBySubstitution` synonym fallback, the coverage-band empirical
regression (5/7). (Story persistence landed in Phase 5 — see "App + tooling".)

## Grading selectors (Phase 6 — done)

`lib/grading/select.ts` — the SRS-aware progression selectors (§6.2, §8.1) that pick what the
next story teaches and reviews. Both are pure DB reads over `learner_chars`:

- `selectNewChars(db, learnerId, n)` — next `n` curriculum targets: walks `buildCurriculum`
  order from the learner's frontier, skips already-known chars (status `learning`/`review`/
  `mastered`), and only offers a char whose every prerequisite component the learner has reached
  **`review`/`mastered`** on (a `learning` prereq does not unlock it).
- `selectDueChars(db, learnerId, maxDue)` — soonest-due `review` chars (overdue first via
  `due ASC`), capped at `maxDue`.

Wired into `cli/run-profile.ts`, `evals/fixtures.ts`, and Phase 5's `lib/story/generate.ts` (these
replaced the old `evals/select.ts` stand-in). Promotion of chars between statuses
(`new`→`learning`→`review`→`mastered`) is **Phase 7** (Phase 5 only captures interactions); for a
freshly seeded learner (all known = `review`) output matches the prior stand-in.

## Annotation layer (Phase 4 — done)

`annotate(db, hanzi)` in `lib/annotate/index.ts` (§9) turns a validated hanzi-only body into
render-ready `AnnotatedSegment[]` (`{ text, pinyin[], gloss, chars[], candidates[][], source[] }`).
**Pure, synchronous, no network** — writes nothing (persisting to `stories.annotated` is Phase 5).
Two passes aligned by char offset: `pinyin-pro` per *sentence* for heteronym context (1:1 per Han
char), and greedy longest-match segmentation against the `words` lexicon (gloss attached). `pnpm test`
covers it deterministically (no key).

**Pinyin uses a layered fallback chain**, with per-char `candidates` (from pinyin-pro `multiple:true`,
**not** `characters.pinyin` — the DB stores one reading even for heteronyms) and a `source` tag:
1. **pinyin-pro** (primary, context-aware).
2. **CC-CEDICT** (`cedict.ts`) — synchronous/deterministic: matched multi-char words prefer
   `words.pinyin`, applied only when it diverges *and* the reading ∈ the char's candidates. This is
   what fixes 还书→`huán` (it's a CC-CEDICT word; no LLM needed).
3. **LLM** (`lib/annotate/llm.ts` `resolveHeteronyms(llm, hanzi, segments)`) — **OPT-IN, async,
   SEPARATE entry point**. `annotate()` never calls it. One batched, constrained call for "hard cases"
   (`heteronym.ts` `isHardCase`); the model only *selects among candidate readings* (out-of-set replies
   ignored) — preserving "never trust the model for pinyin". Zero calls when there are no hard cases.

> **Phase 5 does this:** `lib/story/generate.ts` calls `resolveHeteronyms` after `annotate()` before
> persisting, for LLM-grade heteronym accuracy. Bare `annotate()` stays purely deterministic
> (pinyin-pro + CC-CEDICT only); any new caller that wants heteronym resolution must opt in the same way.

## Reader UI + interaction capture (Phase 5 — done)

The first UI phase (§11): **Next.js (App Router) + React + Tailwind v4 + shadcn/ui**. Scope is the
**core reading loop** — onboard a learner, generate & **persist** a story, read it (characters first,
pinyin off by default), tap a char for pinyin/gloss/components, answer comprehension questions, pick a
branch to continue. (Stubs + deferrals are listed at the end of this section.)

- `pnpm dev` / `pnpm build` / `pnpm start` — the Next app (Turbopack). `.env` is auto-loaded
  server-side, so `ANTHROPIC_API_KEY` works with no `--env-file`.

New **framework-agnostic** service layer (server-side, unit-tested with `makeTestDb` + `MockLlmProvider`):
- `lib/story/persist.ts` — first writer of `stories`. `createStory`/`getStory`/`listStoriesForLearner`.
  Segments + comprehension questions + choices are stored together in the `annotated` JSON column.
- `lib/story/generate.ts` — `generateAndPersistStory(db, llm, learnerId, opts)`: persistent analog of
  `cli/run-profile.ts`. Selects targets/due → `generateGradedStory` → `annotate` → `resolveHeteronyms`
  → `createStory`. For branches, pass `priorStory` (parent body) + `parentStoryId`.
- `lib/interactions/record.ts` — `recordInteraction` (+ `recordReveal`/`recordQuestionResult`). **Writes
  `interactions` rows ONLY; never mutates `learner_chars`.** FSRS grading from these rows is Phase 7.
- `lib/learner/onboard.ts` — `onboardLearner` (HSK / paste / zero paths; toggle-grid deferred).
- `lib/char/detail.ts` — `getCharDetail` (pinyin + gloss + component breakdown for the tap panel).

UI: server actions in `app/actions.ts` wrap the lib layer (DB + the Anthropic key stay server-side);
pages under `app/` (server components for data); client components in `components/` (`Reader`,
`CharPanel`, `Questions`, `Choices`, `OnboardForm`, `GenerateStoryForm`). shadcn primitives in
`components/ui/` (they use **`@base-ui/react`**, not Radix). Generation is **on-demand** with a loading
state; failures surface in `GenerateStoryForm`.

> **Generation can legitimately fail** (`GenerationFailed`) under the default `claude-haiku-4-5` when a
> sentence dips below `MIN_SENTENCE_COVERAGE`. The UI shows the error; retry or a stronger model
> (`LLM_MODEL=claude-sonnet-4-6`) passes. This is generation tuning, not a UI bug.

**Stubbed within Phase 5 (collected/defined but not yet acted on — finish before relying on them):**
- **Branch `choices[].seed` (§8.5) is unused.** `chooseBranchAction` receives `seed` but `void`s it;
  continuations are themed by the human-readable choice **label** only (passed as `theme` + the parent
  body as `priorStory`). The structured seed — intended for deterministic/templated branch
  continuation — is not wired into `generateAndPersistStory`.
- **`dwell` interaction — done.** `Reader.tsx` tracks per-segment on-screen time (IntersectionObserver
  + zero-size sentinels) and emits one `dwell` per segment past `DWELL_THRESHOLD_MS` via `recordDwell`
  (batched, `lib/interactions/record.ts`) / `recordDwellAction`. Graded in Phase 7 (see SRS section).
- **`learner_chars` counters untouched.** `exposures`/`reveals` are not incremented and no FSRS state
  changes — Phase 5 is capture-only; all `learner_chars` updates are Phase 7.

Stroke animation — **done**: `CharPanel.tsx` plays a hanzi-writer animation on char tap (+ Replay).
Data is local (`characters.stroke_data` column, seeded from makemeahanzi graphics.txt
by `parseGraphics`/`build.ts`); `lib/char/strokes.ts` `getStrokeData` → `getStrokeDataAction` feeds
hanzi-writer via `charDataLoader`. (Toggle-grid placement, progress view + reward-text unlock, and
the "characters you can now read" counter also shipped since this list was written.)

§11 narrator/companion persona — **done** (see "Content & motivation layer (Phase 8)" below: presets
in `lib/persona/presets.ts`, chosen at onboarding, threaded into generation). No §11 items remain.

## SRS integration (Phase 7 — done)

Closes the §10 loop: consumes captured `interactions` → runs **FSRS** (`ts-fsrs`) → writes
`learner_chars` state, so due chars resurface invisibly via the existing `selectDueChars`. New
module `lib/srs/` (pure DB; unit-tested with `makeTestDb`, no LLM):

- `lib/srs/constants.ts` — eval-tunable: `MASTERY_STABILITY_DAYS=60`, `MIN_EXPOSURES_TO_REVIEW=3`,
  and the signal→`Rating` map (`reveal`/`question_wrong`→Again, `question_correct`→Good, clean
  pass→Hard, the §10 "soft good").
- `lib/srs/fsrs.ts` — scheduling primitives: a module `fsrs()` instance; `schedule(state, grade, now)`
  rebuilds a `Card` from the stored scalars (status→`State`; FSRS `scheduled_days`/`learning_steps`
  are NOT stored — `createEmptyCard` defaults them) and returns the new `{stability, difficulty, due,
  lastReview, reps, lapses}`.
- `lib/srs/grade.ts` — `gradeStory(db, learnerId, storyId, now?)` (idempotent via `stories.gradedAt`;
  returns `false` if already graded) and `gradeUngradedStories` (catch-up, oldest first). Per story:
  bumps `exposures`/`reveals` for body chars; reschedules the **focus set** (targets ∪ due ∪
  interacted chars) — incidental known chars get exposures only, no reschedule; runs the §10/§16.3
  status machine (`new→learning` on introduction; `learning→review` at ≥`MIN_EXPOSURES_TO_REVIEW`
  exposures **and** a correct; `review→mastered` past the stability threshold; **self-correction**: a
  weak signal demotes an over-claimed `mastered`→`review` and counts an FSRS lapse).

Schema: nullable `stories.gradedAt` (idempotency flag), applied with `pnpm db:migrate` (NOT
`data:build`).

Triggers (both): **catch-up** — `generateAndPersistStory` (`lib/story/generate.ts`) calls
`gradeUngradedStories` **before** selecting targets/due, so selection reflects everything read so far;
**explicit** — `gradeStoryAction` (`app/actions.ts`) + the `FinishButton` ("I'm done reading") in the
reader. Because catch-up advances the curriculum frontier between generations, tests that chain
generations for one learner must rebuild each story body for the **currently** selected target
(see the rewritten `lib/story/generate.test.ts`).

`dwell` grading (added later): a focus char (target/due) earns the soft `pass` only with dwell
evidence. Constraint — dwell must **not** enter the `focus` set (focus-building skips dwell-only
chars), so already-known read chars aren't rescheduled every story; dwell only validates the `pass`.
A focus char with no interaction is `unseen` → skip reschedule when the story has dwell data (exposure
only), else legacy `pass` (back-compat). New `'unseen'` `CharSignal`; incidental loop keys on a
`rescheduled` set so skipped focus chars still get their exposure bump.

Still deferred: the empirical coverage-band regression (needs accumulated reading data).

## Content & motivation layer (Phase 8 — done)

§17 adds range/recognizability/payoff on top of the engine — **no new core generation capability**.
Four parts, all shipped: steerable themes/**genres**, **`StorySeed`** retellings, **reward texts**,
and a **progress dashboard**. The persona companion (§11) shares the same shape.

**One pattern, four features** — `persona`, `genre`, and `storySeed` are all *presets-in-code →
resolve by id → inject a prompt directive → record the id in `stories.meta` → (persona/genre also
store the learner's default in `learners.settings`)*. **None of them needed a DB migration.** When
adding another such steer, copy this pattern; do **not** add a column.

- **Persona** (§11) — `lib/persona/presets.ts` (`PERSONAS`, `getPersona`). Chosen at onboarding
  (`learners.settings.personaId`), recurs in the prose; its **name is force-added to the allowed
  set** in `generate.ts` so it always validates (proper noun, not an SRS target). `meta.personaId`.
- **Genre** (§17.1) — `lib/genres/presets.ts` (`GENRES`, `getGenre`). Tone steer only (does **not**
  touch the allowlist). Default on `learners.settings.genreId`, overridable per story. Precedence in
  `lib/story/generate.ts`: explicit per-story genre > a custom free-text `theme` (**suppresses** the
  saved default) > saved default. Prompt: a `GENRE:` directive + the THEME line
  (`theme ?? genre.label ?? storySeed.themeHints ?? default`). `meta.genreId`.
- **StorySeed** (§17.2) — `lib/seeds/types.ts` + `lib/seeds/presets.ts` (`STORY_SEEDS`,
  `getStorySeed`, `seedsBySource`). A plot skeleton (beats) the engine **retells** in the learner's
  vocabulary ("import plots, not prose"). Three sources: `authored` / `history` / `work`. Every
  `work` seed **must** carry `publicDomain: true` + `attribution` (copyright gate, unit-tested).
  `allowNames` (e.g. 木兰) are force-added to the allowed set like a persona name. One story per seed
  (all beats woven in). Prompt: a "STORY TO RETELL" block. `meta.seedId`.
- **Reward texts** (§17.1) — `lib/progress/reward-texts.ts` (constants, no table); unlock at
  `REWARD_UNLOCK_THRESHOLD = 0.95` coverage of the specific text. Shown in the progress view.
- **Progress dashboard** (§11/§17.1) — `lib/progress/index.ts` (`getLearnerProgress`) +
  `app/learners/[id]/progress/page.tsx`: "characters you can now read", frontier, upcoming, stories
  read, reward-text unlock. Pure DB read.

UI: `components/GenerateStoryForm.tsx` (genre chips + free-text), `components/SeedLibrary.tsx`
(grouped seed picker), `components/OnboardForm.tsx` (persona + favorite-genre pickers). Server
actions: `generateStoryAction(learnerId, theme?, genreId?)`, `generateFromSeedAction`. CLI:
`pnpm story` flags `--persona`, `--genre`, `--seed` (compose). Evals: `hsk3-seed-mulan` fixture.

**Threading rule:** a new generation steer must reach **both** `buildUserPrompt` calls in
`generate.ts` (the main loop **and** the reduced-ambition fallback) and be added to `buildMeta`.

**Deferred (TODO):**
- **Settings page** — no post-onboarding UI to edit a learner's saved **default persona / genre**
  (or display name). Both are set once at onboarding and stored in `learners.settings`;
  `updateLearner(db, id, { settings })` (`lib/learner/crud.ts`) already merge-patches settings, so
  this is a UI + server-action task (e.g. `app/learners/[id]/settings`), no schema work. (done)
- **Re-running placement** (§16.1, a *separate* feature from the settings page) — no UI to let an
  existing learner re-run placement (declare HSK / paste / toggle-grid / zero) to correct or expand
  their known-character set. Unlike persona/genre (a pure settings overwrite), this re-derives the
  **known set** and **merges into `learner_chars`**: the lib path already exists and is
  **non-downgrading** (`seedLearner`'s `onConflictDoNothing`, `lib/learner/seed.ts`) so chars
  promoted/demoted by reading evidence survive. Reuse the four `lib/placement/index.ts` resolvers +
  the onboarding pickers (incl. the paste confirmation-count UX). Heavier/riskier than persona/genre
  edits because it touches real learning state — gate behind a confirmation.
- Branch `choices[].seed` (§8.5) is still a stub (see Phase 5); separate from `StorySeed`.
- §12 empirical coverage-band regression (needs accumulated reading data).
- Phase 9 (verbatim prose adaptation) is **OPTIONAL** — not started.

## Cross-learner story reuse (done)

Generation is slow (~6 serial LLM calls + a heteronym pass), but a persisted story's **content**
(hanzi body, annotated pinyin/gloss, questions, choices, glossary) is **learner-agnostic** — only
`learnerId`/`targetChars`/`dueCharsUsed`/`gradedAt` bind it. So a story made for one learner is
**cloned for a sibling on the same account** when it fits, turning generation into an instant copy.

**Key insight:** "does story S fit learner B?" is the *same two pure, no-LLM gates the generator
already runs* — `validateChars` (readability) + `checkCoverage` (target ≥K + spread). The check is
microsecond-cheap, so it runs **on-demand, inline in `generateAndPersistStory` before the LLM** — no
scheduled job, no index. (A scheduled job would only pay off for large-scale content dedup later.)

- `lib/story/reuse.ts` — `findReusableStory(db, learnerId, {targets, due, bootstrap})`. Scans
  `listReusableCandidates` (live, non-branch stories from **other learners under the same
  `learners.ownerId`** — the privacy boundary), and per candidate runs the readability + coverage
  gates against B's state. **Story-driven match** (not strict): accepts any readable story whose
  introduced new-chars are all valid frontier next-steps for B (≤ `MAX_REUSE_NEW_CHARS=4`), records
  *those* as B's targets; ranks by overlap with B's preferred targets, then recency. Source
  persona/seed proper-noun chars are force-added to B's allowed set so they don't flag.
- `lib/story/persist.ts` — `listReusableCandidates` (same-`ownerId` join, carries the source
  learner's `displayName`) + `reuseStory` (clones title/hanzi/annotated **verbatim** — no
  re-annotation, no LLM — with B's targets/due + reuse-tagged meta, `parentStoryId = null`).
- `lib/story/generate.ts` — the inline gate runs after catch-up grading, before `generateGradedStory`.
  Only for a **plain next story** — skipped for branches (`priorStory`/`parentStoryId`) and seed
  retellings (`seedId`); opt-out via `GenerateStoryOptions.reuse = false`. On a hit, returns the
  clone; on a miss, the existing generation path is unchanged.
- **Meta attribution (no schema migration — rides in `meta` JSON):** a reused story carries
  `meta.model = 'reuse'` + `reusedFromStoryId` / `reusedFromLearnerId` / `reusedFromLearnerName`
  (= source `learners.displayName`). The reader shows a **"📖 From \<sibling\>" badge** via
  `StoryMeta` (`components/StoryMeta.tsx`, `reusedFrom` prop) in place of the model chip.
- Phase 7 SRS grading (`lib/srs/grade.ts`) works on cloned rows **unchanged**. Tests:
  `lib/story/reuse.test.ts` (owner rows need a `users` insert — FK on `ownerId`).

## App + tooling (read before touching imports or the build)

- **Imports are extension-less; resolution is `Bundler` everywhere.** The project was migrated OFF the
  NodeNext `.js`-extension convention so **Turbopack** (the default `next dev`/`build` engine) can
  resolve the shared lib. **Do NOT add `.js` (or `.ts`) extensions to relative imports** — extensionless
  only (`import { x } from '../db/schema'`). Turbopack cannot remap `.js`→`.ts` (webpack's
  `extensionAlias` is unsupported there), so reintroducing extensions breaks the build.
- **Two tsconfigs, both Bundler:** root `tsconfig.json` = the Next app (jsx, `lib: dom`, `next` plugin —
  needed for shadcn); `tsconfig.node.json` = node code (`lib`/`cli`/`evals`/`data`/`db`), used by
  `pnpm typecheck`. `tsx` (CLI/data scripts) and `vitest` resolve extensionless fine; nothing runs via
  bare `node`.
- **`better-sqlite3` is server-only.** `next.config.ts` lists it under `serverExternalPackages`. Only
  import `lib/db` (and anything that transitively pulls it) from server components / server actions /
  route handlers — never a client component.
- **pnpm 11 build-script approval lives in `pnpm-workspace.yaml` `allowBuilds:`** (NOT package.json). A
  new native dep that lands there as `name: set this to true or false` will hard-fail every
  `pnpm install`/`pnpm <script>` with `ERR_PNPM_IGNORED_BUILDS` until set to `true`/`false`.

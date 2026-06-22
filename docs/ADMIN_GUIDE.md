# Admin / Parent Guide — Tuning Story Generation

This guide is for the person who tunes the engine — assumed to be a Chinese-language expert who
is comfortable editing text/code files and running terminal commands. It covers how generation
works, every knob you can turn (prompts, constants, presets, model), and the eval loop you use to
verify changes don't regress.

For the full design rationale, see `IMPLEMENTATION_PLAN.md` (the spec, with section numbers like
§7/§8 referenced below) and `CLAUDE.md` (per-phase build notes).

---

## 1. How a story is generated (mental model)

For one story, the engine does this:

1. **Build an allowlist** (`lib/allowlist/index.ts`, §7) — the learner's known characters ∪ the
   new target characters, expanded to a **word-level** vocabulary list (capped, frequency-sorted).
2. **Prompt the LLM**, which must emit **hanzi-only JSON** (title, body, comprehension questions,
   branch choices) using *only* the allowed words.
3. **Validate characters** (`lib/generation/validate.ts`) — a hard, character-level gate: any
   out-of-allowlist Han character, or any pinyin/latin "evasion," is a violation.
4. **Check coverage** (`lib/generation/coverage.ts`) — each target appears ≥ `K` times and spread
   across sentences, each due character appears ≥ once, and global + per-sentence known-coverage
   floors are met.
5. **Repair loop** — if validation or coverage fails, the engine sends a *targeted* repair prompt
   listing only the offending characters, up to `MAX_REPAIRS` times, then a reduced-ambition
   fallback.

**Pinyin and glosses are never taken from the model.** They're added deterministically afterward
by pinyin-pro + CC-CEDICT (`lib/annotate/`). Treat the model as a *writer constrained to a
vocabulary*, nothing more.

---

## 2. Setup & environment

- **API key** — put `ANTHROPIC_API_KEY=...` in `.env` at the repo root. The Next app auto-loads
  it server-side; the CLI and eval scripts load it via `tsx --env-file=.env` (already wired into
  the `pnpm` scripts).
- **Model selection** — `lib/llm/index.ts`. Defaults to **`claude-haiku-4-5`**. Override with env
  vars:
  - `LLM_MODEL=claude-sonnet-4-6` — the **"stronger model" fix**. If haiku frequently fails the
    per-sentence coverage floor, Sonnet usually passes. Slower and more expensive.
  - `LLM_PROVIDER` — provider switch (only `anthropic` is implemented).
- **Data setup** (one-time / after source changes) — `pnpm data:all` runs
  download → build → verify, producing `data/hanzi.db`. See `CLAUDE.md` "Data layer" for the
  individual steps.

---

## 3. Editing the prompts

Prompt text lives in `/prompts/`; the dynamic, vocabulary-heavy part is assembled in code.

- **`/prompts/generate.system.md`** — the system prompt: the HARD RULES, the tone/age guidance,
  and the **output JSON schema**. The placeholders `{K}` and `{lengthChars}` are filled by
  `buildSystemPrompt` in `lib/generation/prompt.ts` — leave them as literal `{K}` / `{lengthChars}`
  in the file.
- **`/prompts/repair.user.md`** — the repair shell. Keep the `{issues}` placeholder; the engine
  fills it with the specific offending characters.
- **The user prompt is code-assembled** in `lib/generation/prompt.ts` → `buildUserPrompt`. It
  builds the `THEME` / `GENRE` / `COMPANION` / `VOCABULARY` / `TARGET CHARACTERS` /
  `REVIEW CHARACTERS` / `STORY TO RETELL` blocks from the allowlist and presets. Edit wording for
  these blocks here, not in the markdown templates.

**Two warnings:**

1. **Keep the JSON schema in the system prompt in sync with the Zod contract**
   (`lib/generation/types.ts`). If you rename or add fields in one and not the other, parsing
   fails for every story.
2. **Re-run the evals after any prompt edit** (§6). Prompt wording is the highest-leverage and
   highest-risk knob.

---

## 4. Tuning the generation constants

`lib/generation/constants.ts` — all provisional, meant to be tuned empirically:

| Constant | Controls | Move it… |
| --- | --- | --- |
| `K` (=2) | Min occurrences of each target char | **Up** = more re-encounters per target (harder to satisfy, better reinforcement); **down** = easier generation |
| `DEFAULT_LENGTH_CHARS` (=100) | Default story length | **Up** for longer stories (band ~60–120); grows with the learner |
| `MAX_REPAIRS` (=4) | Repair attempts before fallback | **Up** = more chances to fix (slower, costlier); **down** = fail faster |
| `KNOWN_COVERAGE_TARGET` (=0.95) | Coverage the engine *aims* for | This is also the eval's `meanKnownCoverage` bar — raise both together |
| `KNOWN_COVERAGE_FLOOR` (=0.90) | **Hard** global gate — stories below this are rejected | **Up** = stricter/easier-to-read stories (more failures); **down** = more lenient |
| `MIN_SENTENCE_COVERAGE` (=0.85) | Per-sentence floor (kills one unreadable sentence a global average hides) | **Up** = stricter; **down** = more lenient (most common cause of haiku failures) |

Two related knobs live elsewhere:

- **Dwell threshold** — `DWELL_THRESHOLD_MS` in `components/Reader.tsx` (how long a sentence must
  be on-screen to count as "read").
- **Vocabulary cap** — `DEFAULT_MAX_WORDS` in `lib/allowlist/index.ts` (how many allowed words the
  model sees; bigger = more expressive but a longer prompt).

---

## 5. Content presets (no database migration needed)

A core pattern in this codebase: steerable content is **presets in code**, resolved by id and
injected into the prompt. None of these need a schema change — just edit the array and the value
flows through automatically.

- **Genres** — `lib/genres/presets.ts` (`GENRES`). Tone steer only; does **not** touch the
  allowlist. Each has `id`, `label`, `emoji`, `blurb`, `promptInstruction`.
- **Personas** (companions) — `lib/persona/presets.ts`. The persona **name is force-added to the
  allowlist** so it always validates as a proper noun.
- **Story seeds** (plots to retell) — `lib/seeds/presets.ts`. Three sources: `authored`,
  `history`, `work`. **Every `work` seed must have `publicDomain: true` and an `attribution`**
  (copyright gate, unit-tested). Proper nouns the plot needs go in `allowNames` (force-added to
  the allowlist like a persona name).
- **Reward texts** — `lib/progress/reward-texts.ts`. Unlock at `REWARD_UNLOCK_THRESHOLD` (0.95)
  coverage of that specific text.

**Worked example — add a genre.** Append to `GENRES` in `lib/genres/presets.ts`:

```ts
{
  id: 'horror',
  label: 'spooky',
  emoji: '👻',
  blurb: 'Gentle scares and eerie mysteries.',
  promptInstruction:
    'Make it a gentle spooky story: an eerie setting and a mild scare, resolved safely — never gory or frightening.',
},
```

It will appear as a chip in onboarding and the new-story form, and be selectable via
`pnpm story --genre horror`. (If you add a *new kind* of generation steer rather than a new genre,
remember the threading rule from `CLAUDE.md`: it must reach **both** `buildUserPrompt` calls in
`lib/story/generate.ts` and be added to `buildMeta`.)

---

## 6. The eval loop (the core admin task)

Whenever you change a prompt, constant, or preset that affects generation, verify it with the eval
harness. These are **real-LLM, on-demand** runs and need `ANTHROPIC_API_KEY`.

- **`pnpm eval`** — runs every fixture, writes a timestamped metrics file to `evals/results/*.json`,
  prints an aggregate, and **exits non-zero if the regression gate fails**. The gate lives in
  `evals/thresholds.ts`:
  - `successRate` (must be **1** — every run eventually produced a story)
  - `withinTwoRepairsRate` (≥ 0.80 — passed within ≤2 repairs, no fallback)
  - `meanKnownCoverage` (≥ `KNOWN_COVERAGE_TARGET`)
  - `targetCoverageRate` (≥ 0.95 — runs where every target met ≥K)

  The console also reports the **repair histogram**, **fallback rate**, **mean latency**, and
  **total cost** — read these, not just pass/fail.

- **`pnpm eval:judge`** — a separate LLM call that rates each story for coherence and age
  appropriateness (qualitative).

- **Add a fixture** — append a `FixtureSpec` to `FIXTURE_SPECS` in `evals/fixtures.ts`:

  ```ts
  { name: 'hsk2-sport', hsk: 2, targets: 3, maxDue: 3, lengthChars: 90, themes: ['sport'] },
  // bootstrap profile instead of hsk:
  { name: 'beginner', bootstrapKnown: 30, targets: 2, maxDue: 0, lengthChars: 50, themes: ['friendship'] },
  // retell a story seed:
  { name: 'hsk3-mulan', hsk: 3, targets: 3, maxDue: 3, lengthChars: 100, themes: [''], seedId: 'mulan' },
  ```

  Each fixture is seeded in an ephemeral DB and given targets/due by the real selectors, so it
  exercises the full pipeline.

**Workflow:** edit a prompt/constant → `pnpm eval` → compare the aggregate against the previous
results file **and spot-read a few story bodies in the JSON** → only adjust the thresholds in
`evals/thresholds.ts` when you've *deliberately* decided the new numbers are the bar.

**Guardrail (from `CLAUDE.md`):** keep `/evals` green when touching `/lib/generation` or
`/prompts`.

---

## 7. Quick story testing without the UI

For fast iteration on prompt/constant edits, use the CLI driver — it runs the whole pipeline
against an **ephemeral DB copy** (never writes to `hanzi.db`) and prints the story plus its score:

```bash
pnpm story --hsk 3 --judge
```

Useful flags (`pnpm story --help` for the full list):

- **Profile:** `--hsk <1-6>` · `--paste "<text>"` · `--bootstrap` (+ `--bootstrap-known <n>`)
- **Content:** `--theme "<text>"` (overrides genre) · `--genre <id>` · `--seed <id>` ·
  `--persona <id>`
- **Tuning (override constants per run):** `--targets <n>` · `--due <n>` · `--length <n>` ·
  `--max-words <n>` · `--min-sentence-coverage <0-1>` · `--coverage-band <0-1>` · `--model <id>`
- **Diagnostics:** `--judge` (coherence rating) · `--verbose` (log every attempt and why it failed)

Genre ids: `adventure | mystery | scifi | fantasy | history | friendship | sport | slice-of-life`.
Persona ids: `xiaolong | xiaoyue | afu`. Seed ids include `mulan`, `sima-guang`, `silk-road`,
`journey-west-start`, `tortoise-hare`, `gua-fu-sun`, `lost-dog`, `new-school`, `space-rescue`.

This is the best loop for "did my prompt edit help?" — much faster and cheaper than `pnpm eval`.
Use `pnpm eval` to confirm no regression once the CLI output looks good.

---

## 8. Operations & safety

- **Tests / types:** `pnpm test` (vitest unit tests — keep green when touching `/lib`),
  `pnpm typecheck`, `pnpm test:integration` (gated; real LLM, runs only with `ANTHROPIC_API_KEY`
  set).
- **Run the app:** `pnpm dev` (Turbopack), `pnpm build`, `pnpm start`.
- **How learning state updates (SRS):** reading a story and pressing **"I'm done reading"** runs
  FSRS grading (`lib/srs/`), which updates `learner_chars` so due characters resurface in future
  stories. Generation also runs a **catch-up** grade for any unfinished stories *before* selecting
  the next story's characters.
- **Schema changes — danger:** after editing `db/schema.ts` and running `pnpm db:generate`, apply
  migrations with **`pnpm db:migrate`**, **never `pnpm data:build`**. `data:build` *wipes and
  reseeds* the database, destroying all learner progress.
- **Server-only DB:** `better-sqlite3` is server-only — only import `lib/db` (and anything that
  pulls it in) from server components, server actions, or route handlers.

---

## 9. Authentication & accounts

Sign-in is handled by **Auth.js v5 (NextAuth)** with a JWT session. Two roles:

- **Adults (parents/teachers)** sign in with **Google** and are stored in the `users` table.
  An adult owns the child profiles they create (`learners.ownerId`) and may view their
  children's stories/progress.
- **Children (readers)** sign in with a **username + PIN** the adult sets from the dashboard
  (`learners.username` + bcrypt `pinHash`). No email per child. A child sees only their own
  profile.

**Isolation is enforced in one place:** `lib/auth/access.ts` (pure, unit-tested in
`access.test.ts`) provides `canAccessLearner`/`assertLearnerAccess`/`assertStoryAccess`, and
every server action (`app/actions.ts`) and learner page calls it before any DB work, so changing
the id in a URL returns *not found*. `lib/auth/session.ts` maps the Auth.js session to a
`SessionContext`. Auth config is split for the Edge runtime: `auth.config.ts` (edge-safe, used by the
`proxy.ts` proxy/middleware) and `auth.ts` (full, with the Drizzle adapter + child Credentials
provider).

**Google OAuth setup:** create an OAuth client in Google Cloud Console (Authorized redirect URI
`https://<your-domain>/api/auth/callback/google`) and set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

**Required env vars (prod):**
- `ANTHROPIC_API_KEY` — story generation.
- `AUTH_SECRET` — JWT signing (generate with `npx auth secret`).
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — adult Google sign-in.
- `AUTH_URL` — the public origin, e.g. `https://hanzi.example.com`.
- `DB_PATH` — absolute path to the SQLite file on the persistent volume (e.g. `/data/hanzi.db`).

## 10. Hosting & deployment

The app runs as a **single long-running container** with the SQLite DB on a **persistent
volume**. (It is *not* deployable to Vercel as-is: serverless has an ephemeral filesystem;
`better-sqlite3` needs a persistent disk and one writer.) See `Dockerfile` + `fly.toml`.

- **Single instance only.** SQLite is a single-writer file — do **not** scale to >1 machine.
- **Seed the volume once** (the reference tables live inside the DB file). Either build it in CI
  and copy it onto the volume, or run a one-off release command on the host:
  `pnpm data:build && DB_PATH=/data/hanzi.db pnpm db:migrate`. The image bundles `db/` so
  `pnpm db:migrate` can apply pending migrations against the volume after a schema change.
- **Deploy (Fly.io):** `fly volumes create hanzi_data --size 2`,
  `fly secrets set ANTHROPIC_API_KEY=… AUTH_SECRET=… AUTH_GOOGLE_ID=… AUTH_GOOGLE_SECRET=… AUTH_URL=https://…`,
  then `fly deploy`. Keep `fly scale count 1`.
- **Backups are now essential** — `hanzi.db` holds *all* learner state (progress, stories,
  credentials). Schedule a volume snapshot or a periodic copy of the file off-box.

> Migrating to Postgres/RDS later (to run on Vercel and scale horizontally) is a contained but
> non-trivial change — the DB layer is synchronous today, so it becomes an `async` refactor across
> `lib/**`. Keep all DB access behind `lib/**` to keep that move cheap.

---

## Current limitations (worth knowing)

- No **settings page** yet — a learner's default persona/genre and display name are set only at
  onboarding (genre is still overridable per story).
- No **re-run placement** UI — an existing learner can't re-declare their known set from the app
  (the lib path exists and is non-downgrading, but it's unwired).
- The §12 empirical coverage-vs-comprehension regression is still a stub (needs accumulated real
  reading data).

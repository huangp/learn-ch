# Hanzi Graded Reader — Implementation Plan

> **Audience:** teens (11–15), English L1
> **Primary goal:** **hanzi acquisition / literacy** (reading & recognizing characters). Speaking/listening is secondary and out of scope for v1.
> **Core mechanic:** personalized graded stories produced by a **generate → validate → repair** loop, with spaced repetition smuggled invisibly into the narrative.
>
> This document is written to be consumed by Claude Code as a working spec. Phases are independently buildable and testable. Start at Phase 0.

---

## 1. Pedagogical thesis (the "why", kept short)

- Acquisition runs on **comprehensible input** (Krashen *i+1*): text a notch above current level, understood because most of it is already known.
- Reading stays fluent at ~**98% known tokens**; genuine *learning* of new items happens when unknowns sit around **90–95%** and are inferable from context. For Chinese with teens, budget tighter than for alphabetic languages because each new character loads three channels at once: **shape, sound, meaning**. Introduce several new *words* per story but only **1–3 genuinely new characters**.
- "Repetition" is the wrong frame. What sticks is **varied, meaningful re-encounter**: 好 met across 你好 / 好吃 / 好的 builds the real network. One emotionally engaging encounter beats ten drills.
- Teens (unlike young kids) can reason *about* the script. Exploit it: ~80–90% of characters are **形声字** (semantic–phonetic compounds). Teaching the system (radicals + phonetic components) turns thousands of unrelated glyphs into a combinatorial structure. This is the spine of the grading model (§6).
- Go light on Duolingo-style extrinsic gamification — it can crowd out the intrinsic "I understood that!" reward (overjustification effect). Optimize for frequent small comprehension wins, agency (branching choices), and a character the reader cares about.

**Mulan note (re your 《木兰辞》 work):** the original is classical 文言文 — wrong register to teach reading-for-fluency from. Retell in simple modern 白话 at the learner's level; hold the real 木兰辞 back as an aspirational "reward text". Borrowed plot knowledge = free comprehension.

---

## 2. Two load-bearing architectural decisions

1. **Constrain generation by an allowed *word list*, not a *character* list.** LLMs follow "use only these words" far better than "use only these characters." Build the word list by filtering a frequency dictionary down to words whose every character is in the learner's allowed character set. Validate at the character level afterward.
2. **Separate creative generation from linguistic annotation.** The LLM emits **hanzi-only** prose + questions + choices (its strength). A **deterministic** pass (`pinyin-pro` + CC-CEDICT) adds segmentation, pinyin, tone, and glosses (where the LLM is unreliable: heteronyms, tone sandhi). Never trust the model for pinyin.

---

## 3. System architecture

```
                    ┌─────────────────────────────────────────────┐
                    │            DATA LAYER (Phase 0)             │
                    │  characters · components(IDS DAG) · freq    │
                    │  CC-CEDICT lexicon · HSK lists · stroke svg │
                    └───────────────────┬─────────────────────────┘
                                        │ (seed)
                    ┌───────────────────▼─────────────────────────┐
   learner state →  │         GRADING ENGINE (Phase 6)            │
   (SRS, known)     │  topo-ordered char curriculum               │
                    │  selectNewChars() · selectDueChars()        │
                    └───────────────────┬─────────────────────────┘
                                        │ allowedChars, targets, due
                    ┌───────────────────▼─────────────────────────┐
                    │   ALLOWLIST BUILDER (Phase 2)               │
                    │  allowedChars → allowedWords (dict filter)  │
                    └───────────────────┬─────────────────────────┘
                                        │ vocabulary
                    ┌───────────────────▼─────────────────────────┐
                    │  GENERATION ENGINE (Phase 3) — the heart    │
                    │  generate → validate → repair (loop)        │
                    │  LLM emits hanzi-only JSON                   │
                    └───────────────────┬─────────────────────────┘
                                        │ valid hanzi story
                    ┌───────────────────▼─────────────────────────┐
                    │  ANNOTATION LAYER (Phase 4)                  │
                    │  pinyin-pro segment + pinyin + gloss        │
                    └───────────────────┬─────────────────────────┘
                                        │ annotated story
                    ┌───────────────────▼─────────────────────────┐
                    │  READER UI (Phase 5) + interaction capture  │
                    │  → grades feed SRS (Phase 7)                │
                    └─────────────────────────────────────────────┘
```

---

## 4. Tech stack (concrete; swap points noted)

| Concern | Choice | Notes / swap |
|---|---|---|
| App framework | **Next.js (App Router)** + TypeScript | Plays to existing fluency. Server Actions for mutations, Route Handlers for the generation API. |
| DB | **SQLite + Drizzle ORM**, versioned migrations | Mirrors your finance-system pattern. Drizzle keeps it Postgres-portable for prod. |
| LLM | **Anthropic Messages API** (`claude-sonnet-4-6` for generation; a cheap model for aux tasks) | Generation is the only model-dependent piece; keep it behind a `LlmProvider` interface. |
| Segmentation | **`Intl.Segmenter('zh', {granularity:'word'})`** for cheap default; **dictionary-backed (CC-CEDICT) segmenter** for vocab control | Dictionary segmentation matters because the allowlist is word-level (§2.1). |
| Pinyin/annotation | **`pinyin-pro`** (heteronym mode) | Already in your toolbelt. |
| Stroke animation | **`hanzi-writer`** + makemeahanzi graphics | For the character-detail panel. |
| Validation/segment in worker | Node, pure functions | Keep validation deterministic + unit-testable with no LLM. |
| Queue (optional v1.1) | simple in-process queue; BullMQ/Redis later | Generation is slow (multi-iteration); async-ify once UX needs it. |

Single Next.js app for v1. Generation runs server-side (Route Handler) with streaming status back to the client.

---

## 5. Data layer (Phase 0)

### 5.1 Sources & licenses (verify at ingest; attribute in `/CREDITS.md`)

| Data | Source | License | Use |
|---|---|---|---|
| Char defs, pinyin, **IDS decomposition**, stroke graphics | **makemeahanzi** (`dictionary.txt`, `graphics.txt`, `svgs.tar.gz`) | dictionary.txt LGPL (ex-Unihan/CJKlib); graphics Arphic permissive | char master + decomposition DAG + stroke SVGs |
| Word definitions | **CC-CEDICT** | **CC BY-SA 3.0** | lexicon for allowlist + glosses |
| Grading levels | **HSK 3.0** word/char bands | open lists | coarse difficulty bands |
| Frequency | char + word frequency list (e.g. SUBTLEX-CH / Jun Da) | check per-list | ordering & token-coverage stats |

> **License caveat (state in CREDITS):** CC BY-SA 3.0 ShareAlike applies to redistribution of the *CC-CEDICT data itself*. Using it at runtime to look up glosses, and the stories your app generates, are not derivatives of the dictionary database. Commercial use is permitted with attribution. Keep the raw dictionary files attributed and unmodified-or-share-alike; don't bake them into a proprietary redistributed blob without the notice.

### 5.2 Pipeline (`/data/pipeline/`)

> **Scope: Simplified Chinese only (v1, decided).** Seed only the Simplified glyph set. makemeahanzi carries both Simplified and Traditional — filter to Simplified at ingest. CC-CEDICT lines carry both a Traditional and a Simplified headword; key off the **Simplified** field and discard Traditional. No `traditional` columns in the schema (avoids an unused-column migration later). If Traditional is ever wanted, it's a re-seed, not a schema change.

1. Download raw sources to `/data/raw/` (gitignored).
2. Parse makemeahanzi JSONL → `characters` rows (Simplified set only; incl. `decomposition` IDS string, `radical`, `strokeCount`, `pinyin[]`).
3. Parse CC-CEDICT → `words` rows keyed on the **Simplified** headword (pinyin, glosses[]); ignore the Traditional headword.
4. Join HSK + frequency → populate `hskLevel`, `freqRank` on chars and words.
5. Parse IDS decomposition → `char_components` edges (see §6). Some IDS components are Traditional-only or non-character radical glyphs — map them to the always-available radical roots (§6.1) rather than dropping the edge.
6. Emit a single seed migration + a checksum manifest so the seed is reproducible.

### 5.3 Schema (Drizzle; abbreviated)

```ts
// characters: the master glyph table
characters {
  id            integer pk
  char          text unique           // 妈
  pinyin        text                  // JSON string[] (heteronyms): ["mā"]
  gloss         text                  // short L2 definition
  radical       text                  // 女
  strokeCount   integer
  decomposition text                  // IDS: "⿰女马"
  hskLevel      integer               // 1..9, nullable
  freqRank      integer               // 1 = most frequent
  isComponent   boolean               // appears as a part of other chars
}

// char_components: prerequisite edges (child requires parent component)
char_components {
  charId        integer fk -> characters.id
  componentId   integer fk -> characters.id   // 女, 马
  role          text  // 'semantic' | 'phonetic' | 'structural'
}

// words: lexicon used to build allowlists + glosses
words {
  id        integer pk
  word      text                       // 喜欢
  chars     text                        // JSON: ["喜","欢"]
  pinyin    text
  gloss     text
  hskLevel  integer
  freqRank  integer
}

// learners
learners { id, displayName, createdAt, settings (JSON) }

// learner_chars: per-learner SRS + mastery state
learner_chars {
  learnerId   fk
  charId      fk
  status      text   // 'new' | 'learning' | 'review' | 'mastered'
  // FSRS state
  stability   real
  difficulty  real
  due         integer   // epoch
  lastReview  integer
  reps        integer
  lapses      integer
  exposures   integer   // total times seen in stories
  reveals     integer   // times learner tapped to reveal (weakness signal)
  pk (learnerId, charId)
}

// stories
stories {
  id            integer pk
  learnerId     fk
  title         text
  hanzi         text                    // raw generated hanzi-only body
  annotated     text                    // JSON: segmented + pinyin + gloss
  targetChars   text                    // JSON string[] new chars introduced
  dueCharsUsed  text                    // JSON string[] SRS chars woven in
  theme         text
  parentStoryId integer                 // for branching choices
  meta          text                    // JSON: model, repairIterations, coverage, knownCoverage%
  createdAt     integer
}

// interactions: drives SRS grading
interactions {
  id          integer pk
  storyId     fk
  learnerId   fk
  charId      fk                         // nullable for word-level events
  type        text  // 'reveal' | 'question_correct' | 'question_wrong' | 'dwell'
  value       real
  createdAt   integer
}
```

---

## 6. Grading engine — component-aware curriculum (Phase 6, design here because §2/§5 depend on it)

The curriculum order is **not** raw frequency. It's a topological sort of the character DAG so a character is never introduced before its learnable components, tie-broken by frequency.

### 6.1 Build the DAG
- Nodes = characters. Edges from `char_components` (child → component).
- Treat a fixed set of **base radicals/components** as always-available roots (the ~214 Kangxi radicals + common phonetic bases), so leaves like 女, 马, 口 are introducible immediately.
- Parse IDS recursively but **cap depth**: only require components that are themselves teachable standalone characters or designated radicals; ignore sub-glyph minutiae.

### 6.2 Curriculum order
```
function buildCurriculum():
  graph = loadComponentDAG()
  order = []
  ready = minHeap(by freqRank) of nodes with all prereqs satisfied
  while ready not empty:
    c = ready.pop()              // most frequent unlocked char
    order.push(c)
    for child in dependents(c):
      if all prereqs of child in order: ready.add(child)
  return order                   // global default sequence
```
Per-learner progress is a pointer into `order` plus the SRS state. `selectNewChars(learner, N)` walks `order` from the learner's frontier, skipping already-known, returning the next N whose prerequisites the learner has reached `review`/`mastered` on.

### 6.3 Teen payoff
When introducing a 形声字, surface the component story in the reader's char panel: 妈 = 女 (meaning: female) + 马 (sound: mǎ→mā). This is the one place a **Socratic hook** earns its keep ("why might 妈 carry 女?") — viable for teens, not for young kids.

---

## 7. Allowlist builder (Phase 2)

```
function buildAllowlist(learner, targetNewChars):
  known   = learnerChars where status in ('learning','review','mastered')
  allowed = known.chars ∪ targetNewChars ∪ PUNCT ∪ DIGITS
  // word-level allowlist — the thing actually given to the LLM
  allowedWords = words.filter(w => every char of w ∈ allowed)
                      .filter(w => w.freqRank < FREQ_CUTOFF)   // keep it teen-usable
                      .sortBy(freqRank)
  return { allowedChars: allowed, allowedWords }
```
Pass `allowedWords` (capped, e.g. top ~600 by frequency for the context window) to the model as the usable vocabulary. Always include the `targetNewChars` with example words that contain them.

---

## 8. Generation engine — generate → validate → repair (Phase 3, THE HEART)

### 8.1 Loop
```
function generateGradedStory(learner, config):
  { allowedChars, allowedWords } = buildAllowlist(learner, config.targetNewChars)
  due     = selectDueChars(learner, config.maxDue)        // SRS, should appear
  targets = config.targetNewChars                         // i+1, must appear ≥K times

  messages = [ buildUserPrompt(allowedWords, targets, due, config.theme,
                               config.lengthChars, config.priorStory) ]

  best = null
  for attempt in 1..MAX_REPAIRS (e.g. 4):
    raw   = LLM.generate(SYSTEM_PROMPT, messages)         // hanzi-only JSON
    story = parseJson(raw)
    v     = validateChars(story.hanzi, allowedChars)       // out-of-vocab chars + positions
    cov   = checkCoverage(story.hanzi, targets, due, K)    // targets present ≥K, due present
    score = quality(v, cov, story)
    best  = max(best, score)
    if v.violations.empty AND cov.ok:
      return finalize(story)                               // → annotation layer
    messages.push(assistant(raw))
    messages.push(buildRepairPrompt(v.violations, cov.missing))  // targeted, cite offenders

  // fallbacks, in order:
  return repairBySubstitution(best, allowedWords)          // swap offending words for known synonyms
      ?? regenerate(shorter=true, targets=targets[0:1])    // reduce ambition
      ?? throw GenerationFailed
```

### 8.2 `validateChars` (pure, fully unit-tested, no LLM)
- Strip whitespace, ASCII/Latin, digits, CJK punctuation.
- For each remaining CJK codepoint not in `allowedChars`: record `{char, index}`.
- Also flag **evasion**: latin letters or pinyin-with-tone-marks inside the body (model dodging the constraint), and any char outside the CJK Unified range.

### 8.3 `checkCoverage`
- Every `target` appears **≥ K times** (K≈2–3) → drives varied re-encounter of new chars.
- Every `due` char appears **≥1** → that's the invisible review.
- **Global known-coverage gate: a tunable band, not a sacred constant.** Default target `knownCoverage ≥ 0.95`, acceptable floor `0.90`. See §8.3.1 for why these numbers and why they must be eval-tuned, not inherited.
- **Local floor (this matters more than the global %): no single sentence below `MIN_SENTENCE_COVERAGE`** (start ~0.85), and target chars must be **spread across sentences**, not clustered. A story can pass globally while one sentence sits at 70% and becomes unparseable — the local floor kills that failure mode, which a global average hides. For Chinese this is critical because a single unknown character can be load-bearing in a way one unknown English word in a 20-word sentence often isn't.

### 8.3.1 Evidence note on the coverage numbers (don't treat as gospel)
The 95%/98% figures come from L2 **word**-coverage research in **English**, measuring **unassisted** reading (random unknowns, no glosses, incidental learning): Hu & Nation (2000) → 98% for fluent unassisted comprehension; Laufer (1989) / Laufer & Ravenhorst-Kalovski (2010) → 95% as the *minimum* adequate threshold. Two reasons our gate sits at/below the minimum end rather than at 98%:
1. **This app is assisted + deliberate, not unassisted + incidental.** Unknowns here are taught, glossed, tappable, and repeated K times — not random gaps. That tolerates lower coverage than the unassisted studies require. Also, coverage that's *too high* (99–100%) starves acquisition: there's nothing new to learn. The learning sweet spot is deliberately below the pure-comprehension optimum (i+1).
2. **Effective load < raw coverage.** A target char on its 3rd in-story encounter is barely "unknown," so 0.95 *measured* coverage feels easier than 0.95 random-unknown text.
3. **The relationship is roughly linear, not a cliff** (Schmitt, Jiang & Grabe 2011) — there's no magic breakpoint at exactly 0.95, which is the whole reason to make this a band the **eval harness tunes empirically** (§12): regress comprehension-question accuracy and reveal-rate against measured coverage across generated stories and find where *this* population's comprehension actually degrades. Do not assume the English-L2 number transfers to scaffolded character-reading by teens.

Bootstrap mode (§16.4) necessarily runs below this band and uses a different gate ("every non-target char is one already introduced").

### 8.4 Repair prompt (targeted beats regenerate)
Feed back only what's wrong:
> The following characters are not allowed: 「欢、累」. Rewrite ONLY the sentences containing them, replacing those words with allowed vocabulary, keeping the plot identical. Also ensure 「兰」 appears at least twice. Return the full corrected JSON.

### 8.5 Output JSON contract (LLM emits this; **hanzi only**, no pinyin)
```json
{
  "title": "木兰从军",
  "body": "很久以前，有一个女孩，名字叫木兰……",
  "targetCharsUsed": ["兰", "军"],
  "comprehensionQuestions": [
    { "q": "木兰为什么去打仗？", "options": ["...","...","..."], "answer": 0, "testsChars": ["军"] }
  ],
  "choices": [
    { "label": "木兰决定自己去", "seed": "mulan-goes" },
    { "label": "木兰先去找朋友", "seed": "mulan-friend" }
  ]
}
```
- `comprehensionQuestions[].testsChars` ties a correct/incorrect answer to specific chars → SRS grade signal.
- `choices` enable branching (same vocab recurring across branches = varied context + agency).

### 8.6 System prompt skeleton (`/prompts/generate.system.md`)
```
You write very short graded stories in Simplified Chinese for a teenage learner
(age 11–15, native English speaker) who is learning to READ Chinese characters.

HARD RULES
- Use ONLY words from the VOCABULARY list provided in the user message. Do not use any
  other Chinese word or character. If you cannot express something with the allowed
  vocabulary, choose a simpler plot point.
- Naturally weave in every TARGET character at least {K} times, and every REVIEW
  character at least once.
- Keep it age-appropriate and genuinely interesting for a teen: adventure, history,
  mystery, sci-fi, friendship. Avoid childish "see the cat" tone.
- Length: about {lengthChars} characters.
- Output ONLY the JSON object in the specified schema. No pinyin, no English in the
  body, no markdown, no commentary.
```

**Phase 3 acceptance (eval-gated):** on a fixed suite of learner profiles, ≥X% of stories pass `validateChars` within ≤2 repair iterations; 100% pass after fallbacks; mean `knownCoverage` ≥ 0.95; target coverage met ≥95%. Track the distribution; this metric *is* the product's health.

---

## 9. Annotation layer (Phase 4, deterministic)

Input: validated hanzi body. Output: render-ready segments.
```
function annotate(hanzi):
  segments = dictionarySegment(hanzi)            // CC-CEDICT-backed; word boundaries
  return segments.map(seg => ({
    text:   seg,
    pinyin: pinyinPro(seg, { heteronym: true, contextAware: true }),
    gloss:  lookupGloss(seg),                     // CC-CEDICT
    chars:  [...seg].map(c => c)
  }))
```
- pinyin-pro handles heteronyms (行 háng/xíng) and tone sandhi presentation — your existing expertise.
- Store both `hanzi` (raw) and `annotated` (JSON) on the story so the reader can toggle pinyin without recomputing.

---

## 10. SRS — FSRS with invisible review (Phase 7)

- Use **FSRS** (modern, beats SM-2; reference implementation widely available) as the scheduler. SM-2 acceptable fallback if you want zero deps.
- **The scheduler does not drive flashcards.** It outputs which chars are *due*; `selectDueChars` injects them into the next story (§8). The learner never sees a review screen.
- **Grade signal comes from reading interactions:**
  - tap-to-reveal pinyin/gloss on a char → **fail/again** (weak),
  - comprehension question correct on a `testsChars` char → **good**,
  - question wrong → **again**,
  - read past target char with no reveal → soft **good** (lower weight).
- Promotion: `new → learning` on first introduction; `learning → review` after ≥M varied exposures **and** ≥1 successful comprehension check; `review → mastered` per FSRS stability threshold.

---

## 11. Reader UI (Phase 5)

- **Character-first display.** Pinyin **off by default** (forces character reading — the whole point of a literacy app). Tap a character → panel with pinyin, gloss, stroke animation (hanzi-writer), and component breakdown (§6.3). Each reveal logs an `interaction`.
- Comprehension questions inline at the end; answers log interactions.
- Branching choices at the end → generate the next story with the chosen `seed`, same learner state (vocabulary recurs across branches).
- A companion character / narrator persona for continuity and emotional hook (kids learn a language to talk to someone they care about — give them someone).
- **Minimal** gamification: a quiet "characters you can now read" counter and the comprehension-win moment; resist streaks/coins as primary drivers.
- Progress view: curriculum frontier, mastered count, upcoming characters, the aspirational "reward text" (e.g. real 木兰辞) unlocking as coverage rises.

### 11.1 Phase 5 follow-ups

Implementation status — what shipped, what's stubbed (branch `seed`), and what's deferred — lives in **CLAUDE.md → "Reader UI + interaction capture (Phase 5 — done)"**, not here.

---

## 12. Eval harness (build alongside Phase 3 — non-negotiable)

A generation system without an eval loop drifts blind. `/evals/`:
- **Fixtures:** ~6 learner profiles spanning early (HSK1, ~150 chars) to mid (HSK4, ~1200 chars).
- **Metrics per run:** first-pass validation rate, repair-iteration distribution, target-coverage rate, mean `knownCoverage`, fallback rate, latency, cost.
- **Coverage tuning (owns the §8.3.1 question):** regress comprehension-question accuracy and tap-to-reveal rate against measured `knownCoverage` (and against per-sentence minimum) across real reading sessions, to find where *this* population's comprehension degrades. The global band and `MIN_SENTENCE_COVERAGE` are outputs of this analysis, not hardcoded beliefs.
- **Coherence:** sample N stories for human/LLM-judge rating (1–5) on narrative sense + age-appropriateness.
- **Regression gate:** CI fails if first-pass rate or coverage drops below thresholds after a prompt change.
- Mock-LLM unit tests for `validateChars`/`checkCoverage`/allowlist (deterministic); real-LLM eval suite run on demand.

---

## 13. Phased roadmap (each phase independently shippable & testable)

| Phase | Deliverable | Done when |
|---|---|---|
| **0** | Data pipeline + seed DB | `data:build` + `data:verify` green; char master, IDS edges, lexicon, freq, HSK populated |
| **1** | Schema + migrations + **four-path placement** (§16) + learner CRUD | a learner can onboard via any of the four paths; `seedLearner` writes `review`-status chars with spread due dates; frontier set; zero-start enters bootstrap |
| **2** | Allowlist builder | given a learner, returns valid char + word allowlists (unit-tested) |
| **6** | Grading/curriculum engine | valid topo curriculum; `selectNewChars`/`selectDueChars` respect prereqs + SRS |
| **3** | **Generation engine + eval harness** | eval thresholds met; the heart works end-to-end on fixtures |
| **4** | Annotation layer | deterministic pinyin/gloss/segmentation with heteronym tests passing |
| **5** | Reader UI + interaction capture | a teen can read a story, reveal chars, answer Qs, pick a branch |
| **7** | SRS integration | interactions update FSRS; due chars resurface in stories invisibly |
| **8** | **Content & motivation layer** (§17): `StorySeed` abstraction + 3 seed sources, themes/genres, history/public-domain retellings, reward texts, progress dashboard | ✅ **DONE** (status in CLAUDE.md). Learner steers theme **and genre presets**; seeds drive retellings via the existing engine; reward texts unlock; progress visible |
| **9** *(optional)* | **Verbatim prose-adaptation pipeline** (§18): coverage analyzer + chunker + meaning-preserving rewrite loop | public-domain source text can be faithfully rewritten down to the learner's band; copyright boundary enforced |

> Build order note: do **6 before 3** (generation needs the curriculum to pick targets) and **2 before 3** (generation needs the allowlist). 4/5/7 follow once the heart is validated. **8** is content/motivation and reuses the engine unchanged. **9 is optional** and only worth building if verbatim source adaptation proves necessary — the import value in §17 is captured by seeds without it.

---

## 14. Suggested repo layout + CLAUDE.md seed

```
/app                 # Next.js App Router
/lib
  /grading           # curriculum DAG, topo sort, selectNewChars/DueChars   (Phase 6)
  /allowlist         # buildAllowlist                                       (Phase 2)
  /generation        # loop, validateChars, checkCoverage, repair           (Phase 3)
  /annotate          # pinyin-pro + segmentation + gloss                    (Phase 4)
  /srs               # FSRS wrapper, grading from interactions              (Phase 7)
  /seeds             # StorySeed type + seed sources (authored/history/work) (Phase 8)
  /adapt             # OPTIONAL: coverage analyzer + rewrite loop            (Phase 9)
  /llm               # LlmProvider interface + Anthropic impl
/data
  /raw               # gitignored downloads
  /pipeline          # parsers → seed
/db                  # Drizzle schema + migrations
/prompts             # generate.system.md, repair templates
/evals               # fixtures, runner, thresholds
```

**CLAUDE.md** is the authoritative operational guide at the repo root (project goal, build order,
per-phase status, module map, tooling). This plan no longer embeds a draft seed of it.

---

## 15. Open decisions

1. ✅ **Initial placement — RESOLVED.** Onboarding offers four paths (self-declare HSK · paste known chars · toggle-grid · start from zero). Full spec in **§16**. Unblocks Phase 1.
2. ✅ **Simplified only — RESOLVED.** v1 is Simplified-only; Traditional discarded at ingest (see §5.2). Unblocks Phase 0.

Still open (tune during Phase 3, not blocking the start):

3. **`K` and `N`.** Targets per story (`N`, suggest 1–3) and min exposures per target (`K`, suggest 2–3). Tune empirically via the eval harness.
4. **Story length curve.** Start ~60–120 chars, grow with the learner? Set the `lengthChars` schedule.
5. **Generation latency UX.** Pre-generate the next story while the learner reads the current one (hide the multi-iteration loop), or generate on demand with a streaming "writing your story…" state?
6. **Cost ceiling.** Per-story cost = (iterations × tokens). Decide a budget; it sets `MAX_REPAIRS` and `allowedWords` cap.

**Phase 0 and Phase 1 are now fully unblocked — Claude Code can start.**

---

## 16. Initial placement & learner seeding (Phase 1 detail) — DECIDED

Onboarding offers **four paths** to establish the starting known-character set. All four converge on a single set of `charId`s and call **one** `seedLearner(knownCharIds, method)` routine — so the seeding logic is written and tested once, and the four UIs are just different ways to produce that set.

### 16.1 The four paths

1. **Self-declare HSK level.** Pick HSK 1–6 (or "none"). Known set = all characters with `hskLevel ≤ chosen`. Fastest path; lowest precision. Default suggestion in the UI.
2. **Paste known characters.** Free-text paste (a vocab list, a passage, anything). Extract every CJK codepoint, dedupe, intersect with the Simplified `characters` master, **discard non-matches silently**. Show a confirmation: "Found 234 known characters" before committing. Good for learners migrating from another app/textbook.
3. **Toggle-grid.** A frequency-ranked grid of characters, paged (~100/page), tap to mark known/unknown. Include a bulk **"I know everything down to here"** action (sets all higher-frequency chars known in one tap) plus fine per-char toggles for the ragged edge. Frequency order — not curriculum order — because learners self-recognize by familiarity, not by component logic. Most precise; highest effort, so cap the practical depth (e.g. stop offering pages past HSK5 unless they keep going).
4. **Start from zero.** Empty known set → triggers **bootstrap mode** (§16.4).

Persist the chosen path on `learners.settings.placementMethod` for later analytics (which path produces the best-calibrated learners). Placement is **re-runnable** from settings; re-running merges (never silently downgrades a char that reading evidence has since promoted).

### 16.2 `seedLearner(knownCharIds, method)`

The hard part isn't collecting the set — it's that declared-known chars have **no review history**, so naïve seeding either (a) marks everything `mastered` and starves the SRS of anything to verify, or (b) marks everything `due now` and floods the first stories with a wall of forced review chars.

Resolution:
- Seed each known char as **`review`** (not `mastered` — self-report is unverified; reading will confirm or correct it).
- Give a **generous initial FSRS stability**, scaled by confidence in the source:
  - HSK-declared / high-frequency chars → higher stability (the learner very likely does know 的, 是, 我),
  - rarer chars in the known set → lower stability (more likely shaky/over-claimed).
  A simple monotonic map from `freqRank → initialStability` works; tune later.
- **Spread the due dates.** Compute each char's first `due` from its stability **plus jitter**, so reviews trickle in over weeks instead of arriving as a synchronized wall. Rarer/lower-stability chars surface sooner (they're the ones worth verifying first); high-frequency anchors surface last or rarely.
- Set the **curriculum frontier** = the first character in the component-aware curriculum order (§6.2) that is *not* in the known set. `selectNewChars` walks forward from there.

Net effect: a learner who declares HSK3 immediately gets stories pitched at HSK3, their genuinely-known chars mostly stay invisible, and any over-claimed chars get gently surfaced and corrected through normal reading (a reveal or a wrong comprehension answer drops that char's stability and pulls it into rotation).

### 16.3 Self-correction during reading (ties placement to SRS)

Placement is a noisy prior, not ground truth. The reader already captures the correction signal for free (§10): tapping to reveal a "known" char, or missing a comprehension question on it, lowers its stability and re-enters it into review. So an over-optimistic self-declaration is self-healing within a few sessions — which is exactly why seeding as `review` rather than `mastered` matters.

### 16.4 Bootstrap mode (zero-start, and very-low known counts)

You cannot generate a 95%-known-coverage story from an empty set. When the known set is below a threshold (e.g. < ~50 chars), run **bootstrap mode** for the first several sessions:
- Introduce the first N curriculum characters with **heavier scaffolding**: pinyin shown by default, glosses inline, shorter texts, more repetition of each new char.
- Relax the `knownCoverage ≥ 0.95` gate (it's mathematically impossible early); instead gate on "every non-target char is one of the chars introduced so far."
- Graduate out of bootstrap once the known set crosses the threshold; pinyin flips back to off-by-default (§11) and the normal coverage gate resumes.

This also makes "start from zero" a genuinely good first-run experience rather than a broken one.

### 16.5 Acceptance criteria (Phase 1)

Met — Phase 1 is done. See **CLAUDE.md → "Learner layer (Phase 1 — done)"** for the shipped behavior.

---

## 17. Phase 8 — Content & motivation layer

### 17.1 Purpose
Phases 0–7 produce a working *engine*: an endless stream of correctly-graded, adaptive stories. But "endless stream of competent random stories" is not, by itself, something a 11–15-year-old returns to. Phase 8 adds **range, recognizability, and payoff** on top of the engine — it introduces **no new core capability**, it makes the existing capability *engaging*. You can ship without it and the system will function; you'll just struggle to retain a teen past novelty. Four parts:

1. **Steerable themes / genres.** Let the learner bias generation toward sci-fi, mystery, adventure, history, friendship, sport, etc. Implemented as prompt flavoring + a `theme` already on the `stories` table. Cheap, high engagement payoff (agency).
2. **Seed-driven retellings** (the heart of Phase 8 and of your import question — §17.2).
3. **Reward texts.** Real, unmodified native text held up as the aspirational destination (the actual 木兰辞; a 成语 story; a classical couplet) that *unlocks* as the learner's coverage of it crosses a threshold. This is where original native prose legitimately belongs — as the **destination**, never graded or rewritten.
4. **Progress dashboard.** Make the invisible character-acquisition curve visible: characters mastered, curriculum frontier, what's coming next, reward texts approaching unlock. Drives the "look how far I've come" motivation without resorting to streaks/coins.

### 17.2 The `StorySeed` abstraction (this is what makes "import" work)
The key design move: the generator should never know or care where a plot came from. Introduce one abstraction the generation engine (§8) consumes:

```ts
type StorySeed = {
  id: string
  title: string
  setting: string            // one line
  characters: string[]       // names/roles, plain
  beats: string[]            // ordered plot points, plain language (any language)
  themeHints?: string[]
  source: 'authored' | 'history' | 'work'
  attribution?: string       // for public-domain works
}
```

The engine takes a `StorySeed` + the learner's allowlist/targets/due and **regenerates fresh graded hanzi** that follows the beats. The seed is scaffolding for the *plot*; the displayed text is always newly generated inside the learner's vocabulary. This is the **borrowed-comprehension** lever from the very start of the design: when the reader already half-knows what happens, attention shifts from decoding plot to decoding language.

**"Import" becomes seed production — a separate concern from generation.** Three seed sources, all feeding the same `StorySeed`:
- **`authored`** — you (or an LLM, offline) hand-write seeds.
- **`history`** — real historical events/figures. Free to mine (history is nobody's IP). Extract beats from an encyclopedic summary.
- **`work`** — beats extracted from an existing narrative. For copyright safety this extracts only the **high-level plot skeleton**, never prose. Restrict the *verbatim/derivative* use to public-domain works (四大名著, mythology, folk tales, Aesop, Grimm); for in-copyright works, at most a premise-level seed and never original excerpts as reward text.

### 17.3 Does this cover your import use case?
- **Real history → yes, fully.** A `history` seed retold by the engine is exactly the Mulan template generalized. No new pipeline.
- **Public-domain fiction → yes** as `work` seeds (plot skeleton) and additionally as **reward texts** (original passages shown untouched at the end).
- **In-copyright fiction → premise-only seed; no excerpts.** Use the canon instead — for Chinese the public-domain classical corpus is huge and culturally central, so this is barely a limitation.
- **What Phase 8 does *not* do:** take the *actual prose* of a book and adapt it down to the learner's level. That is verbatim adaptation, a genuinely different and harder pipeline → Phase 9, optional.

**Rule of thumb: import plots, not prose. Regenerate, don't adapt.** This reuses the engine untouched and sidesteps the hard problem entirely.

### 17.4 Acceptance (Phase 8)

Met — see §17.5.

### 17.5 Implementation status

Phase 8 is **DONE**. The shipped modules, the shared "preset → resolve by id → inject directive →
record in `stories.meta`" pattern, the dual-prompt threading rule, and the deferred TODOs are
documented in **CLAUDE.md → "Content & motivation layer (Phase 8 — done)"**.

---

## 18. Phase 9 *(OPTIONAL)* — Verbatim prose adaptation

> Build only if §17 seed-based retelling proves insufficient and there's a real need to adapt **actual source text** (not just plots) down to the learner's level. Most of the import value is already captured in Phase 8 without this.

### 18.1 Why it's a separate, harder pipeline
Phase 8 *generates* fresh text from a plot, so it can freely simplify to satisfy the vocabulary constraint. Phase 9 must *preserve* a specific source's content and wording while forcing it into the learner's band — and native source text typically sits at ~40–60% known coverage for your learner, far below the 90–95% target. Binding to the source makes the constraint **harder**, not easier: you can't drop a hard plot point to dodge a hard word. It's a constrained-**rewrite** loop, not a constrained-**generation** loop.

### 18.2 Pipeline
```
ingest(sourceText)                          # PUBLIC-DOMAIN ONLY — license gate first
  → coverageAnalyze(text, learner)          # measure known%, locate the hard spans
  → chunk(text)                             # sentence/paragraph units preserving order
  → for each chunk:
       rewriteToBand(chunk, allowlist,      # meaning-preserving simplification,
                     targets, due)          #   seeded with the source chunk
       → validate (§8.2) → repair           # same char-level validation as generation
  → stitch + annotate (§9)
```
- Reuses `validateChars`, `checkCoverage`, the repair loop, and the annotation layer unchanged. The *only* new component is `rewriteToBand` (a different prompt: "faithfully simplify THIS passage to the allowed vocabulary, preserve meaning and key names").
- Faithfulness check: a second pass (or eval-judge) confirms the rewrite didn't drop or distort key plot content.

### 18.3 Hard copyright gate (non-negotiable)
- **Input must be public domain.** A license check gates ingestion; in-copyright text is rejected at the door. A close adaptation of a copyrighted work is a derivative — out of scope regardless of educational framing.
- The original public-domain passage may also be offered as a reward text (§17.1.3).

### 18.4 Acceptance (Phase 9)
- License gate rejects non-public-domain input.
- A public-domain passage is rewritten to within the learner's coverage band, passes char validation, and a faithfulness judge confirms preserved meaning.
- Output flows through the standard annotation + reader path with no special-casing downstream.

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

// Steerable genres (§17.1) — quick-pick story flavors. Plain typed constants (no DB table),
// mirroring lib/persona/presets: the learner's default choice is stored as `genreId` in
// `learners.settings`, threaded into generation as a tone directive, and overridable per story.
// Genres steer TONE only — they do NOT force proper nouns into the allowlist (unlike persona names
// or seed allowNames).

export interface Genre {
  /** Stable slug stored in settings.genreId / meta.genreId. */
  id: string;
  /** Shown on the chip; also used as the THEME line value in the prompt. */
  label: string;
  /** Chip/picker chrome. */
  emoji: string;
  /** One-line vibe for the onboarding picker. */
  blurb: string;
  /** Tone/conventions woven into the generation user prompt (§8.4). */
  promptInstruction: string;
}

export const GENRES: Genre[] = [
  {
    id: 'adventure',
    label: 'adventure',
    emoji: '🧭',
    blurb: 'Quests, journeys, and daring escapes.',
    promptInstruction:
      'Make it an adventure: a clear goal, a journey or challenge, rising danger, and a brave resolution.',
  },
  {
    id: 'mystery',
    label: 'mystery',
    emoji: '🔍',
    blurb: 'Puzzles, clues, and a satisfying reveal.',
    promptInstruction:
      'Build a small mystery: something is missing or strange, clues appear, and there is a satisfying reveal at the end.',
  },
  {
    id: 'scifi',
    label: 'sci-fi',
    emoji: '🚀',
    blurb: 'Space, robots, and the future.',
    promptInstruction:
      'Set it in a science-fiction world: space, robots, or future technology, with a sense of wonder kept simple.',
  },
  {
    id: 'fantasy',
    label: 'fantasy',
    emoji: '🐉',
    blurb: 'Magic, dragons, and faraway lands.',
    promptInstruction:
      'Set it in a fantasy world: magic, mythical creatures, or an enchanted place, with a touch of wonder.',
  },
  {
    id: 'history',
    label: 'history',
    emoji: '🏯',
    blurb: 'Real places and times from the past.',
    promptInstruction:
      'Ground it in a historical setting from the past, with everyday period details, kept simple and vivid.',
  },
  {
    id: 'friendship',
    label: 'friendship',
    emoji: '🤝',
    blurb: 'Friends, kindness, and working together.',
    promptInstruction:
      'Center it on friendship: two characters help each other through a small problem and grow closer.',
  },
  {
    id: 'sport',
    label: 'sport',
    emoji: '⚽',
    blurb: 'Practice, teamwork, and the big game.',
    promptInstruction:
      'Make it about a sport or game: practice, teamwork, and an exciting contest with a heartfelt outcome.',
  },
  {
    id: 'slice-of-life',
    label: 'slice of life',
    emoji: '🍵',
    blurb: 'Small, warm moments from everyday life.',
    promptInstruction:
      'Keep it a warm slice of life: an ordinary day with a small, meaningful moment and a gentle tone.',
  },
];

/** Resolve a stored genreId to its preset (undefined if missing/unknown — generation stays genre-free). */
export function getGenre(id: string | null | undefined): Genre | undefined {
  if (!id) return undefined;
  return GENRES.find((g) => g.id === id);
}

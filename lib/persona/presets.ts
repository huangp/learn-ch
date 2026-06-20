// Narrator/companion persona (§11) — a recurring character that travels with the learner
// across stories for continuity and emotional hook. Presets are a plain typed constant (no DB
// table): the learner's choice is stored as `personaId` in `learners.settings`, threaded into
// generation (the companion recurs in the prose) and shown as chrome in the reader.

export interface Persona {
  /** Stable slug stored in learner.settings.personaId. */
  id: string;
  /** Hanzi name used verbatim inside generated stories. */
  name: string;
  /** English name for UI/glossing. */
  nameEn: string;
  /** Avatar shown in the picker + reader header. */
  emoji: string;
  /** One-line vibe shown in the onboarding picker. */
  blurb: string;
  /** Warm English line shown as reader chrome (the learner can't always read hanzi yet). */
  tagline: string;
  /** Instruction woven into the generation user prompt (§8.4). */
  promptInstruction: string;
}

export const PERSONAS: Persona[] = [
  {
    id: 'xiaolong',
    name: '小龙',
    nameEn: 'Little Dragon',
    emoji: '🐉',
    blurb: 'A brave young dragon who loves quests and adventure.',
    tagline: 'Little Dragon is on this adventure with you.',
    promptInstruction:
      'Feature a recurring companion named 小龙, a brave young dragon who travels alongside the main character and loves adventure and quests. Bring 小龙 into the story as a friend who talks and acts with the main character.',
  },
  {
    id: 'xiaoyue',
    name: '小月',
    nameEn: 'Little Moon',
    emoji: '🌙',
    blurb: 'A thoughtful friend who loves mysteries and old stories.',
    tagline: 'Little Moon is reading along with you.',
    promptInstruction:
      'Feature a recurring companion named 小月, a thoughtful, curious friend who loves mysteries, puzzles, and stories of the past. Bring 小月 into the story as a friend who explores and wonders alongside the main character.',
  },
  {
    id: 'afu',
    name: '阿福',
    nameEn: 'Ah Fu',
    emoji: '🐼',
    blurb: 'A warm, funny panda who cheers you on.',
    tagline: 'Ah Fu is cheering you on.',
    promptInstruction:
      'Feature a recurring companion named 阿福, a warm, funny panda with best-friend energy who encourages the main character. Bring 阿福 into the story as a loyal friend who jokes with and supports the main character.',
  },
];

export const DEFAULT_PERSONA_ID = PERSONAS[0].id;

/** Resolve a stored personaId to its preset (undefined if missing/unknown — generation stays persona-free). */
export function getPersona(id: string | null | undefined): Persona | undefined {
  if (!id) return undefined;
  return PERSONAS.find((p) => p.id === id);
}

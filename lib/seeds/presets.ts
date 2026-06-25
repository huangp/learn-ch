import type { StorySeed } from './types';
import { GENERATED_SEEDS } from './generated';

// Phase 8 seed library (§17.2). Plain typed constants (no DB table) — mirrors lib/persona/presets.
// Three sources feed the same StorySeed shape:
//   authored — original skeletons (no attribution; let the LLM name characters from allowed vocab).
//   history  — real events/figures; history is nobody's IP (allowNames carry the historical names).
//   work     — public-domain plots ONLY; publicDomain:true + attribution; high-level skeleton, never prose.

export const STORY_SEEDS: StorySeed[] = [
  // --- authored ---------------------------------------------------------------------------------
  {
    id: 'lost-dog',
    title: '找小狗',
    titleEn: 'The Lost Dog',
    blurb: 'A kid searches the whole town for a runaway puppy.',
    setting: 'A small town on a rainy afternoon.',
    characters: ['a child', 'a small lost dog', 'a kind shopkeeper'],
    beats: [
      'A child notices their puppy has run away.',
      'They search the streets, asking neighbors and shopkeepers.',
      'A clue — wet paw prints — leads them toward the river.',
      'They find the frightened puppy and bring it home safe.',
    ],
    themeHints: ['friendship', 'adventure'],
    source: 'authored',
  },
  {
    id: 'new-school',
    title: '新学校',
    titleEn: 'First Day at a New School',
    blurb: 'A nervous new student turns a hard day into a new friendship.',
    setting: 'A middle school on the first day of a new term.',
    characters: ['a new student', 'a friendly classmate', 'a strict teacher'],
    beats: [
      'A new student arrives, nervous and knowing no one.',
      'They get lost and walk into the wrong classroom.',
      'A friendly classmate helps them find their seat.',
      'By the end of the day the two have become friends.',
    ],
    themeHints: ['friendship', 'school'],
    source: 'authored',
  },
  {
    id: 'space-rescue',
    title: '太空救援',
    titleEn: 'Space Rescue',
    blurb: 'Two young astronauts race to save a stranded friend.',
    setting: 'A small space station orbiting a blue planet.',
    characters: ['a young astronaut', 'a co-pilot', 'a stranded crewmate'],
    beats: [
      'An alarm sounds: a crewmate is stranded outside the station.',
      'The two young astronauts realize time and air are running out.',
      'They argue over a risky plan, then decide to try it together.',
      'They reach their friend and pull everyone back to safety.',
    ],
    themeHints: ['sci-fi', 'adventure'],
    source: 'authored',
  },

  // --- history ----------------------------------------------------------------------------------
  {
    id: 'mulan',
    title: '木兰从军',
    titleEn: 'Mulan Joins the Army',
    blurb: 'A brave girl takes her father’s place in the army.',
    setting: 'Ancient China, a quiet village called to war.',
    characters: ['木兰 (a brave young woman)', 'her aging father', 'fellow soldiers'],
    beats: [
      'The army calls every family to send a soldier, but 木兰’s father is old and ill.',
      '木兰 secretly decides to go in his place, dressing as a young man.',
      'She trains hard and earns the respect of the other soldiers.',
      'After the war she returns home, and her friends learn who she really is.',
    ],
    themeHints: ['history', 'courage'],
    allowNames: ['木兰'],
    suppressPersona: true,
    source: 'history',
  },
  {
    id: 'sima-guang',
    title: '司马光砸缸',
    titleEn: 'Sima Guang Breaks the Vat',
    blurb: 'A quick-thinking boy saves a friend who fell into a water vat.',
    setting: 'A garden in ancient China where children are playing.',
    characters: ['司马光 (a clever boy)', 'a friend who falls in', 'other children'],
    beats: [
      'Children play in a garden with a huge vat full of water.',
      'One child climbs up, slips, and falls into the vat.',
      'The others panic and run for help, but there is no time.',
      '司马光 grabs a rock and breaks the vat, and the water — and his friend — pour out safely.',
    ],
    themeHints: ['history', 'cleverness'],
    allowNames: ['司马光'],
    suppressPersona: true,
    source: 'history',
  },
  {
    id: 'silk-road',
    title: '丝绸之路',
    titleEn: 'A Journey on the Silk Road',
    blurb: 'A young trader crosses deserts and mountains to a faraway market.',
    setting: 'The ancient Silk Road, from a Chinese city westward across the desert.',
    characters: ['a young trader', 'an experienced guide', 'merchants from far away'],
    beats: [
      'A young trader sets out west with silk to sell, joining a caravan.',
      'They cross a harsh desert, running low on water.',
      'A sandstorm scatters the caravan and the trader gets lost.',
      'The guide finds them, and together they reach a bustling foreign market.',
    ],
    themeHints: ['history', 'adventure'],
    suppressPersona: true,
    source: 'history',
  },

  // --- work (public domain) ---------------------------------------------------------------------
  {
    id: 'journey-west-start',
    title: '美猴王',
    titleEn: 'The Monkey King',
    blurb: 'A stone monkey becomes king of the mountain.',
    setting: 'A mountain of flowers and fruit in a mythic ancient China.',
    characters: ['孙悟空 (the Monkey King)', 'the other monkeys'],
    beats: [
      'A monkey is born from a magic stone on the mountain.',
      'The monkeys discover a waterfall and wonder what lies behind it.',
      'The brave stone monkey leaps through and finds a hidden cave home.',
      'For his courage the monkeys make him their king.',
    ],
    themeHints: ['mythology', 'adventure'],
    allowNames: ['孙悟空'],
    suppressPersona: true,
    source: 'work',
    publicDomain: true,
    attribution: '《西游记》 (Journey to the West), 吴承恩 — public domain',
  },
  {
    id: 'tortoise-hare',
    title: '龟兔赛跑',
    titleEn: 'The Tortoise and the Hare',
    blurb: 'A slow tortoise beats a boastful hare in a race.',
    setting: 'A sunny meadow where the animals gather to watch a race.',
    characters: ['a slow tortoise', 'a fast, boastful hare'],
    beats: [
      'A hare brags that he is the fastest, and laughs at the slow tortoise.',
      'The tortoise quietly challenges the hare to a race.',
      'Far ahead, the confident hare lies down to nap.',
      'The tortoise keeps going and crosses the finish line first.',
    ],
    themeHints: ['fable', 'perseverance'],
    suppressPersona: true,
    source: 'work',
    publicDomain: true,
    attribution: "Aesop's Fables — public domain",
  },
  {
    id: 'gua-fu-sun',
    title: '夸父追日',
    titleEn: 'Kuafu Chases the Sun',
    blurb: 'A giant runs after the sun in an impossible quest.',
    setting: 'The vast plains and rivers of a mythic ancient world.',
    characters: ['夸父 (a giant)', 'the sun'],
    beats: [
      'A giant named 夸父 decides to chase and catch the sun.',
      'He runs across mountains and plains, drawing ever closer.',
      'Burning with thirst, he drinks two great rivers dry but still needs more.',
      'He falls before reaching the sun, and where he falls a forest grows.',
    ],
    themeHints: ['mythology', 'courage'],
    allowNames: ['夸父'],
    suppressPersona: true,
    source: 'work',
    publicDomain: true,
    attribution: '《山海经》 (Classic of Mountains and Seas) — public domain',
  },

  // --- generated (pnpm gen:seeds, from data/seeds/topics.ts) -------------------------------------
  ...GENERATED_SEEDS,
];

/** Resolve a stored seedId to its preset (undefined if missing/unknown — generation stays seed-free). */
export function getStorySeed(id: string | null | undefined): StorySeed | undefined {
  if (!id) return undefined;
  return STORY_SEEDS.find((s) => s.id === id);
}

/** Group seeds by source for a grouped picker UI. */
export function seedsBySource(): Record<StorySeed['source'], StorySeed[]> {
  const groups: Record<StorySeed['source'], StorySeed[]> = { authored: [], history: [], work: [] };
  for (const s of STORY_SEEDS) groups[s.source].push(s);
  return groups;
}

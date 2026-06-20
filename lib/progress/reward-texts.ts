// Aspirational "reward texts" (§11): real classic Chinese that unlocks as the learner's
// known-char set grows. Coverage = fraction of a text's distinct Han chars the learner
// can already read. Simplified-only (v1). Ordered easiest → hardest so the page shows a
// near-term win above an aspirational stretch.

export interface RewardText {
  id: string;
  title: string;
  author: string;
  text: string;
}

export const REWARD_TEXTS: RewardText[] = [
  {
    id: 'jingyesi',
    title: '静夜思',
    author: '李白',
    text: '床前明月光，疑是地上霜。举头望明月，低头思故乡。',
  },
  {
    id: 'mulanci',
    title: '木兰辞',
    author: '佚名（北朝民歌）',
    text: '唧唧复唧唧，木兰当户织。不闻机杼声，惟闻女叹息。',
  },
];

// Coverage at or above which a text reads as "unlocked" (mirrors KNOWN_COVERAGE_TARGET).
export const REWARD_UNLOCK_THRESHOLD = 0.95;

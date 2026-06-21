// StorySeed (§17.2) — a plot skeleton the generation engine retells in the learner's vocabulary.
// The engine never knows where a plot came from: a seed is just one more optional input to
// generateGradedStory (no new generation machinery). The "borrowed-comprehension" lever — when
// the reader already half-knows what happens, attention shifts from decoding plot to decoding
// language. Rule of thumb: import plots, not prose; regenerate, don't adapt.

export interface StorySeed {
  /** Stable slug stored in stories.meta.seedId. */
  id: string;
  /** Hanzi title shown in the picker. */
  title: string;
  /** English label (the learner can't always read hanzi yet). */
  titleEn: string;
  /** One-line hook for the picker. */
  blurb: string;
  /** One line, plain English — guidance for the LLM. */
  setting: string;
  /** Names/roles, plain — guidance for the LLM. */
  characters: string[];
  /** Ordered plot points, plain language — the engine weaves all of these into one story. */
  beats: string[];
  /** Bias the THEME line when the caller passes no explicit theme. */
  themeHints?: string[];
  /**
   * Hanzi proper nouns to force into the allowed set (e.g. 木兰), the seed analog of the persona
   * name: a faithful retelling needs them even if the learner hasn't reached those chars. They're
   * absorbed by repetition, NOT SRS targets, so they join the allowed/known set — never targets.
   */
  allowNames?: string[];
  source: 'authored' | 'history' | 'work';
  /** True for `work` seeds — the public-domain gate (§17.2 / copyright rule). */
  publicDomain?: boolean;
  /** Required for `work` seeds: attribution for the public-domain source. */
  attribution?: string;
}

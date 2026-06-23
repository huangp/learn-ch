// §8.2 validateChars — pure, no LLM. Given the story body and the allowed Han chars,
// find out-of-vocabulary characters and "evasion" signals (the model dodging the
// constraint by writing latin letters or pinyin instead of allowed hanzi).

export interface CharHit {
  char: string;
  index: number; // codepoint index within the body
}

export interface ValidationResult {
  /** Han chars present in the body but not in allowedChars. */
  violations: CharHit[];
  /** Latin letters or pinyin tone marks in the body — the model evading the hanzi-only rule. */
  evasions: CharHit[];
  ok: boolean;
}

const HAN = /\p{Script=Han}/u;
const LATIN_LETTER = /[A-Za-z]/;
// Combining tone diacritics + precomposed toned pinyin vowels (incl. ü forms, ń/ň).
const COMBINING_TONE = /[̀-ͯ]/;
const PRECOMPOSED_TONE = new Set(
  [...'āáǎàĀÁǍÀ', ...'ēéěèĒÉĚÈ', ...'īíǐìĪÍǏÌ', ...'ōóǒòŌÓǑÒ', ...'ūúǔùŪÚǓÙ', ...'ǖǘǚǜǕǗǙǛ', ...'ńňǹŃŇǸ', ...'ḿ'],
);

/** Scan a hanzi-only body for out-of-vocab chars and evasion signals (§8.2).
 *
 * In `relaxed` mode (small-vocabulary learners, §16.4-adjacent) out-of-vocab Han chars no
 * longer fail validation — they're still collected for diagnostics, but the absolute
 * unknown-char budget in checkCoverage is what bounds them. Evasions (latin/pinyin) always fail. */
export function validateChars(
  hanzi: string,
  allowedChars: Set<string>,
  opts: { relaxed?: boolean } = {},
): ValidationResult {
  const violations: CharHit[] = [];
  const evasions: CharHit[] = [];

  let index = 0;
  for (const ch of hanzi) {
    if (HAN.test(ch)) {
      if (!allowedChars.has(ch)) violations.push({ char: ch, index });
    } else if (LATIN_LETTER.test(ch) || COMBINING_TONE.test(ch) || PRECOMPOSED_TONE.has(ch)) {
      evasions.push({ char: ch, index });
    }
    // else: whitespace / digits / ASCII or CJK punctuation — ignored.
    index++;
  }

  const ok = evasions.length === 0 && (opts.relaxed || violations.length === 0);
  return { violations, evasions, ok };
}

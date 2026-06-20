import { readFileSync } from 'node:fs';
import type { AllowedWord } from '../allowlist/index';
import { DEFAULT_LENGTH_CHARS, K as DEFAULT_K } from './constants';
import type { CoverageResult } from './coverage';
import type { ValidationResult } from './validate';

// Prompt assembly (§8.4/§8.6). The system prompt + repair shell live as templates in
// /prompts; the vocab-heavy user prompt is built here because it's fully dynamic.

const SYSTEM_TEMPLATE = readFileSync(new URL('../../prompts/generate.system.md', import.meta.url), 'utf8');
const REPAIR_TEMPLATE = readFileSync(new URL('../../prompts/repair.user.md', import.meta.url), 'utf8');

export function buildSystemPrompt(opts: { k?: number; lengthChars?: number } = {}): string {
  return SYSTEM_TEMPLATE.replaceAll('{K}', String(opts.k ?? DEFAULT_K)).replaceAll(
    '{lengthChars}',
    String(opts.lengthChars ?? DEFAULT_LENGTH_CHARS),
  );
}

export interface UserPromptInput {
  allowedWords: AllowedWord[];
  targets: string[];
  due: string[];
  theme?: string;
  lengthChars?: number;
  k?: number;
  priorStory?: string;
  seed?: string;
}

/** First allowed word containing `char`, for the "use this new char" example (§7). */
function exampleWord(char: string, allowedWords: AllowedWord[]): string | null {
  return allowedWords.find((w) => w.word.includes(char))?.word ?? null;
}

export function buildUserPrompt(input: UserPromptInput): string {
  const k = input.k ?? DEFAULT_K;
  const lengthChars = input.lengthChars ?? DEFAULT_LENGTH_CHARS;
  const vocab = input.allowedWords.map((w) => w.word).join(' ');

  const targetLines = input.targets.map((t) => {
    const ex = exampleWord(t, input.allowedWords);
    return ex ? `${t} (e.g. ${ex})` : t;
  });

  const parts: string[] = [];
  parts.push(`THEME: ${input.theme ?? 'anything age-appropriate and engaging'}`);
  parts.push(`LENGTH: about ${lengthChars} characters.`);
  parts.push('');
  parts.push('VOCABULARY (use ONLY these words):');
  parts.push(vocab);
  parts.push('');
  parts.push(`TARGET CHARACTERS (weave each in naturally at least ${k} times, across different sentences):`);
  parts.push(targetLines.length > 0 ? targetLines.join('\n') : '(none)');
  if (input.due.length > 0) {
    parts.push('');
    parts.push('REVIEW CHARACTERS (include each at least once):');
    parts.push(input.due.join(' '));
  }
  if (input.seed) {
    parts.push('');
    parts.push(`BRANCH: continue the branch "${input.seed}" — keep the same characters and setting.`);
  }
  if (input.priorStory) {
    parts.push('');
    parts.push('PREVIOUS STORY (continue from here; same characters and setting):');
    parts.push(input.priorStory);
  }
  parts.push('');
  parts.push('Return ONLY the JSON object.');
  return parts.join('\n');
}

function uniqueChars(hits: { char: string }[]): string[] {
  return [...new Set(hits.map((h) => h.char))];
}

/** Targeted repair prompt: feed back only what's wrong, citing offenders (§8.4). */
export function buildRepairPrompt(args: {
  validation?: ValidationResult;
  coverage?: CoverageResult;
  parseError?: string;
  k?: number;
}): string {
  const k = args.k ?? DEFAULT_K;
  const issues: string[] = [];

  if (args.parseError) {
    issues.push(`- The output was not valid: ${args.parseError}. Return a single valid JSON object.`);
  }
  const v = args.validation;
  if (v) {
    const bad = uniqueChars(v.violations);
    if (bad.length > 0) {
      issues.push(`- These characters are NOT allowed: 「${bad.join('、')}」. Replace the words containing them with allowed vocabulary.`);
    }
    const ev = uniqueChars(v.evasions);
    if (ev.length > 0) {
      issues.push(`- Remove non-Chinese characters / pinyin from the body: 「${ev.join('、')}」. Write only allowed hanzi.`);
    }
  }
  const c = args.coverage;
  if (c) {
    if (c.targetsMissing.length > 0) {
      issues.push(`- These TARGET characters must each appear at least ${k} times: 「${c.targetsMissing.join('、')}」.`);
    }
    if (c.clusteredTargets.length > 0) {
      issues.push(`- Spread these target characters across different sentences (currently clustered): 「${c.clusteredTargets.join('、')}」.`);
    }
    if (c.dueMissing.length > 0) {
      issues.push(`- These REVIEW characters must each appear at least once: 「${c.dueMissing.join('、')}」.`);
    }
    if (c.lowCoverageSentences.length > 0) {
      issues.push('- Some sentences have too many hard/new characters. Simplify them so each sentence is mostly known vocabulary.');
    }
  }

  return REPAIR_TEMPLATE.replace('{issues}', issues.join('\n'));
}

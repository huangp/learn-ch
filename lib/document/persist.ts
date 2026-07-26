import type { Db } from '../db';
import { annotate } from '../annotate/index';
import { createStory } from '../story/persist';
import { getKnownChars } from '../allowlist/index';
import { checkCoverage } from '../generation/coverage';
import { isHan } from '../../data/pipeline/lib';
import { pickTargetsFromDoc } from './targets';
import type { GenerationMeta, GlossaryEntry, StoryJson } from '../generation/types';

// Parent document upload — publish an uploaded text verbatim as a readable story to one or more
// children. The body + base annotation (pinyin/gloss/segments) are learner-agnostic, so annotate
// ONCE; but what the story teaches (targets) and scaffolds (glossed unknowns) depends on each
// child's known set, so those are computed per learner as a cheap overlay. No LLM.

/** Minimal meta for an uploaded (non-generated) story — mirrors the reuse meta at lib/story/generate.ts. */
function uploadMeta(knownCoverage: number): GenerationMeta {
  return {
    model: 'upload',
    repairIterations: 0,
    knownCoverage,
    targetCoverage: 0,
    perSentenceMin: 0,
    fallbackUsed: false,
    usage: { inputTokens: 0, outputTokens: 0 },
    costUsd: 0,
    latencyMs: 0,
  };
}

export interface DocumentStoryResult {
  learnerId: number;
  storyId: number;
}

/**
 * Persist an uploaded document as a verbatim story for each of `learnerIds`. Reading-only (no
 * comprehension questions/choices). Per child: a few frontier/freq targets it teaches, the other
 * unknown chars flagged `oov` (always-on pinyin + gloss like §8.5 soft-gloss), and the child's real
 * known-coverage — so the story behaves like a graded one (SRS grades the targets `new→learning`).
 */
export function createDocumentStories(
  db: Db,
  learnerIds: number[],
  title: string,
  text: string,
  now: number = Date.now(),
): DocumentStoryResult[] {
  const baseSegments = annotate(db, text); // learner-agnostic — compute once, overlay per child
  const docHanChars = [...new Set([...text].filter(isHan))];

  return learnerIds.map((learnerId) => {
    const known = getKnownChars(db, learnerId);
    const targets = pickTargetsFromDoc(db, learnerId, docHanChars);
    const targetSet = new Set(targets);
    // Glossed = the child's unknown chars we're NOT teaching this time → scaffold them.
    const glossed = new Set(docHanChars.filter((c) => !known.has(c) && !targetSet.has(c)));

    const segments =
      glossed.size === 0
        ? baseSegments
        : baseSegments.map((s) => (s.chars.some((c) => glossed.has(c)) ? { ...s, oov: true } : s));

    // Glossary list for parity/§8.5 (also feeds StoryStats + the reuse gate): oov words with a gloss.
    const glossary: GlossaryEntry[] = [];
    const seen = new Set<string>();
    for (const s of segments) {
      if (s.oov && s.gloss && !seen.has(s.text)) {
        glossary.push({ word: s.text, gloss: s.gloss });
        seen.add(s.text);
      }
    }

    const story: StoryJson = {
      title,
      body: text,
      targetCharsUsed: targets,
      comprehensionQuestions: [],
      choices: [],
      glossary,
    };
    // Honest readable fraction (learning/review/mastered) — glossary help is NOT folded in.
    const knownCoverage = checkCoverage(text, { known, targets: [] }).knownCoverage;

    const { id } = createStory(db, {
      learnerId,
      story,
      meta: uploadMeta(knownCoverage),
      segments,
      dueChars: [],
      theme: 'upload',
      now,
    });
    return { learnerId, storyId: id };
  });
}

// §9 annotation — opt-in async heteronym fallback. Layered ON TOP of annotate(): it
// takes the resolved segments, finds the "hard cases" pinyin-pro left on a default
// reading (e.g. 还书→hái), and asks the LLM to pick the correct reading IN CONTEXT.
//
// Respects §2.2 "never trust the model for pinyin": the model SELECTS among the char's
// deterministically-enumerated candidate readings — it never authors pinyin. Replies
// outside the candidate set are ignored. One batched call per body; zero calls if there
// are no hard cases. annotate() itself stays pure — this is a separate entry point.

import type { LlmProvider } from '../llm/index';
import { isHardCase } from './heteronym';
import type { AnnotatedSegment } from './index';

const HAN = /\p{Script=Han}/u;

const SYSTEM = `You are a Chinese pinyin disambiguator. Each item is a character with multiple possible readings; choose the ONE correct reading IN CONTEXT, strictly from the provided candidates. Never invent a reading. Output ONLY a JSON array, no prose: [{"id": <number>, "pinyin": "<one of that item's candidates>"}].`;

interface Occurrence {
  id: number;
  segIdx: number;
  pIdx: number; // index into the segment's pinyin/candidates/source arrays
  char: string;
  candidates: string[];
  context: string;
}

function stripFence(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

/**
 * Refine heteronym pinyin via a single constrained LLM call. Returns a new segment array
 * (input untouched); segments with no hard cases pass through unchanged, and if the body
 * has none the provider is never invoked.
 */
export async function resolveHeteronyms(
  llm: LlmProvider,
  hanzi: string,
  segments: AnnotatedSegment[],
): Promise<AnnotatedSegment[]> {
  const bodyChars = [...hanzi];
  const occ: Occurrence[] = [];
  let offset = 0;
  segments.forEach((seg, segIdx) => {
    let pIdx = 0;
    for (const ch of seg.chars) {
      if (HAN.test(ch)) {
        const chosen = seg.pinyin[pIdx];
        if (seg.source[pIdx] === 'pinyin-pro' && isHardCase(ch, chosen)) {
          const ctx = bodyChars.slice(Math.max(0, offset - 4), offset + 5).join('');
          occ.push({ id: occ.length, segIdx, pIdx, char: ch, candidates: seg.candidates[pIdx], context: ctx });
        }
        pIdx++;
      }
      offset++;
    }
  });

  if (occ.length === 0) return segments;

  const user =
    `Full text:\n${hanzi}\n\n` +
    `Disambiguate these characters (the target is wrapped in 「」 within "context"):\n` +
    JSON.stringify(
      occ.map((o) => ({
        id: o.id,
        char: o.char,
        candidates: o.candidates,
        context: o.context.replace(o.char, `「${o.char}」`),
      })),
    );

  const res = await llm.generate({ system: SYSTEM, messages: [{ role: 'user', content: user }], temperature: 0, maxTokens: 512 });

  let picks: unknown;
  try {
    picks = JSON.parse(stripFence(res.text));
  } catch {
    return segments; // unparseable → keep deterministic result
  }
  if (!Array.isArray(picks)) return segments;

  // Clone only the segments we touch; copy their per-char arrays before mutating.
  const out = segments.slice();
  const cloned = new Set<number>();
  for (const p of picks) {
    if (typeof p?.id !== 'number' || typeof p?.pinyin !== 'string') continue;
    const o = occ[p.id];
    if (!o) continue;
    if (!o.candidates.includes(p.pinyin)) continue; // enforce: must be a valid candidate
    if (p.pinyin === out[o.segIdx].pinyin[o.pIdx]) continue; // no-op
    if (!cloned.has(o.segIdx)) {
      const s = out[o.segIdx];
      out[o.segIdx] = { ...s, pinyin: s.pinyin.slice(), source: s.source.slice() };
      cloned.add(o.segIdx);
    }
    out[o.segIdx].pinyin[o.pIdx] = p.pinyin;
    out[o.segIdx].source[o.pIdx] = 'llm';
  }
  return out;
}

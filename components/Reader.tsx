'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { recordDwellAction } from '@/app/actions';
import type { AnnotatedSegment } from '@/lib/annotate/index';
import type { Persona } from '@/lib/persona/presets';
import { CharPanel, type SelectedWord } from '@/components/CharPanel';
import { SegmentView, RevealableText } from '@/components/RevealableText';
import type { AnnotatedQuestion, AnnotatedChoice } from '@/components/reader-types';
import { Questions } from '@/components/Questions';
import { Choices } from '@/components/Choices';
import { FinishButton } from '@/components/FinishButton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const HAN = /\p{Script=Han}/u;

// A segment counts as "read past" once its on-screen time crosses this. Provisional, eval-tunable.
const DWELL_THRESHOLD_MS = 1200;

// Dwell events are buffered client-side and flushed in batches instead of one server call per
// segment (a story-load burst would otherwise spam the server). Flush when the buffer reaches
// DWELL_BATCH_CHARS distinct chars, or DWELL_DEBOUNCE_MS after the last enqueue (idle). Provisional.
const DWELL_BATCH_CHARS = 40;
const DWELL_DEBOUNCE_MS = 2000;

function hanCharsOf(seg: AnnotatedSegment): string[] {
  return [...seg.chars].filter((c) => HAN.test(c));
}

/**
 * Per-segment dwell capture (§10 soft "read past without reveal" signal). Observes a zero-footprint
 * sentinel at each segment's start; once that segment has accumulated `DWELL_THRESHOLD_MS` of screen
 * time, emits one `dwell` interaction for its Han chars (deduped — at most once per segment). Returns
 * a per-index ref setter for the sentinels.
 */
function useSegmentDwell(storyId: number, learnerId: number, segments: AnnotatedSegment[], capture: boolean) {
  const els = useRef<(Element | null)[]>([]);
  const setRef = useCallback((i: number) => (el: Element | null) => { els.current[i] = el; }, []);
  // In-flight dwell writes + a handle to the current effect's flushAll, so callers (branch /
  // finish) can flush AND await persistence before triggering grading (which is idempotent).
  const pendingRef = useRef<Promise<unknown>[]>([]);
  const flushAllRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Adult preview (capture=false): record nothing — no observer, no dwell calls. flushDwell stays
    // a no-op (flushAllRef unset, pendingRef empty), so Choices/branch keep working.
    if (!capture) return;
    const n = segments.length;
    const accum = new Array(n).fill(0); // accumulated visible ms
    const since = new Array(n).fill(0); // performance.now() when visibility began, 0 if hidden
    const emitted = new Array(n).fill(false);
    const indexOf = new Map<Element, number>();

    // Coalesce dwell across segments: buffer chars (→ max ms seen) and flush in one batched call by
    // size or after an idle debounce, instead of one server call per segment.
    const buffer = new Map<string, number>();
    let flushTimer: number | null = null;

    function flushBuffer() {
      if (flushTimer !== null) { window.clearTimeout(flushTimer); flushTimer = null; }
      if (buffer.size === 0) return;
      const chars = [...buffer.keys()];
      let valueMs = 0;
      for (const v of buffer.values()) if (v > valueMs) valueMs = v;
      buffer.clear();
      // valueMs is representative only (grading checks dwell-row presence, not the ms).
      pendingRef.current.push(
        recordDwellAction({ storyId, learnerId, chars, valueMs: Math.round(valueMs) }).catch(() => {}),
      );
    }

    function enqueue(chars: string[], valueMs: number) {
      for (const c of chars) buffer.set(c, Math.max(buffer.get(c) ?? 0, valueMs));
      if (buffer.size >= DWELL_BATCH_CHARS) { flushBuffer(); return; }
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      flushTimer = window.setTimeout(flushBuffer, DWELL_DEBOUNCE_MS);
    }

    function flush(i: number, now: number) {
      if (since[i] !== 0) {
        accum[i] += now - since[i];
        since[i] = now; // keep counting if still visible
      }
      if (!emitted[i] && accum[i] >= DWELL_THRESHOLD_MS) {
        emitted[i] = true;
        const chars = hanCharsOf(segments[i]);
        if (chars.length > 0) enqueue(chars, Math.round(accum[i]));
      }
    }

    const observer = new IntersectionObserver((entries) => {
      const now = performance.now();
      for (const entry of entries) {
        const i = indexOf.get(entry.target);
        if (i === undefined) continue;
        if (entry.isIntersecting) {
          if (since[i] === 0) since[i] = now;
        } else if (since[i] !== 0) {
          accum[i] += now - since[i];
          since[i] = 0;
        }
        flush(i, now);
      }
    });
    els.current.forEach((el, i) => {
      if (el) { indexOf.set(el, i); observer.observe(el); }
    });

    // a segment that stays visible never re-fires the observer — tick so it still crosses threshold
    const tick = window.setInterval(() => {
      const now = performance.now();
      for (let i = 0; i < n; i++) if (since[i] !== 0 && !emitted[i]) flush(i, now);
    }, 500);

    function flushAll() {
      const now = performance.now();
      for (let i = 0; i < n; i++) flush(i, now);
      flushBuffer(); // send whatever the per-segment sweep just buffered (also clears the timer)
    }
    flushAllRef.current = flushAll;
    const onVis = () => { if (document.visibilityState === 'hidden') flushAll(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      flushAll();
      window.clearInterval(tick);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [storyId, learnerId, segments, capture]);

  // Emit any pending dwell, then await the writes — so a subsequent grade sees complete evidence.
  const flushDwell = useCallback(async () => {
    flushAllRef.current?.();
    await Promise.allSettled(pendingRef.current);
    pendingRef.current = [];
  }, []);

  return { setRef, flushDwell };
}

interface ReaderProps {
  storyId: number;
  learnerId: number;
  titleSegments: AnnotatedSegment[] | null;
  segments: AnnotatedSegment[];
  questions: AnnotatedQuestion[];
  choices: AnnotatedChoice[];
  bootstrap: boolean;
  persona?: Pick<Persona, 'emoji' | 'name' | 'nameEn' | 'tagline'> | null;
  /** False for adult preview: no dwell capture, no finish/grade (reading isn't the learner's). */
  captureInteractions: boolean;
}

export function Reader({ storyId, learnerId, titleSegments, segments, questions, choices, bootstrap, persona, captureInteractions }: ReaderProps) {
  const [showPinyin, setShowPinyin] = useState(bootstrap); // off by default; on in bootstrap (§16.4)
  const [selected, setSelected] = useState<SelectedWord | null>(null);
  const { setRef: setDwellRef, flushDwell } = useSegmentDwell(storyId, learnerId, segments, captureInteractions);

  return (
    <div className="pb-48">
      {persona && (
        <div className="mb-4 flex items-center gap-3 rounded-md border bg-muted/40 p-3">
          <span className="text-2xl" aria-hidden>
            {persona.emoji}
          </span>
          <div className="text-sm">
            <span className="font-medium">{persona.name}</span>
            <span className="text-muted-foreground"> · {persona.tagline}</span>
          </div>
        </div>
      )}
      <div className="mb-4 flex items-center justify-between">
        {titleSegments && titleSegments.length > 0 && (
          <h1 className="text-xl font-semibold">
            <RevealableText segments={titleSegments} showPinyin={showPinyin} onPick={setSelected} charClassName="text-xl" record={false} />
          </h1>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showPinyin} onCheckedChange={setShowPinyin} />
          <Label>Pinyin</Label>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-y-1">
        {segments.map((seg, i) => (
          <Fragment key={i}>
            <span ref={setDwellRef(i)} aria-hidden className="inline-block h-px w-px" />
            <SegmentView seg={seg} showPinyin={showPinyin} onPick={setSelected} />
          </Fragment>
        ))}
      </div>

      {questions.length > 0 && (
        <div className="mt-10">
          <Questions storyId={storyId} learnerId={learnerId} questions={questions} showPinyin={showPinyin} onPick={setSelected} />
        </div>
      )}

      {choices.length > 0 && (
        <div className="mt-10">
          <Choices storyId={storyId} choices={choices} flushDwell={flushDwell} showPinyin={showPinyin} onPick={setSelected} />
        </div>
      )}

      {captureInteractions && (
        <div className="mt-10">
          <FinishButton storyId={storyId} learnerId={learnerId} flushDwell={flushDwell} />
        </div>
      )}

      <CharPanel selected={selected} storyId={storyId} learnerId={learnerId} onClose={() => setSelected(null)} />
    </div>
  );
}

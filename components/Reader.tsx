'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { recordDwellAction } from '@/app/actions';
import type { AnnotatedSegment } from '@/lib/annotate/index';
import type { Choice, ComprehensionQuestion } from '@/lib/generation/types';
import { CharPanel, type SelectedChar } from '@/components/CharPanel';
import { Questions } from '@/components/Questions';
import { Choices } from '@/components/Choices';
import { FinishButton } from '@/components/FinishButton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const HAN = /\p{Script=Han}/u;

// A segment counts as "read past" once its on-screen time crosses this. Provisional, eval-tunable.
const DWELL_THRESHOLD_MS = 1200;

function hanCharsOf(seg: AnnotatedSegment): string[] {
  return [...seg.chars].filter((c) => HAN.test(c));
}

/**
 * Per-segment dwell capture (§10 soft "read past without reveal" signal). Observes a zero-footprint
 * sentinel at each segment's start; once that segment has accumulated `DWELL_THRESHOLD_MS` of screen
 * time, emits one `dwell` interaction for its Han chars (deduped — at most once per segment). Returns
 * a per-index ref setter for the sentinels.
 */
function useSegmentDwell(storyId: number, learnerId: number, segments: AnnotatedSegment[]) {
  const els = useRef<(Element | null)[]>([]);
  const setRef = useCallback((i: number) => (el: Element | null) => { els.current[i] = el; }, []);

  useEffect(() => {
    const n = segments.length;
    const accum = new Array(n).fill(0); // accumulated visible ms
    const since = new Array(n).fill(0); // performance.now() when visibility began, 0 if hidden
    const emitted = new Array(n).fill(false);
    const indexOf = new Map<Element, number>();

    function flush(i: number, now: number) {
      if (since[i] !== 0) {
        accum[i] += now - since[i];
        since[i] = now; // keep counting if still visible
      }
      if (!emitted[i] && accum[i] >= DWELL_THRESHOLD_MS) {
        emitted[i] = true;
        const chars = hanCharsOf(segments[i]);
        if (chars.length > 0) {
          void recordDwellAction({ storyId, learnerId, chars, valueMs: Math.round(accum[i]) });
        }
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
    }
    const onVis = () => { if (document.visibilityState === 'hidden') flushAll(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      flushAll();
      window.clearInterval(tick);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [storyId, learnerId, segments]);

  return setRef;
}

interface ReaderProps {
  storyId: number;
  learnerId: number;
  title: string | null;
  segments: AnnotatedSegment[];
  questions: ComprehensionQuestion[];
  choices: Choice[];
  bootstrap: boolean;
}

function SegmentView({
  seg,
  showPinyin,
  onPick,
}: {
  seg: AnnotatedSegment;
  showPinyin: boolean;
  onPick: (c: SelectedChar) => void;
}) {
  let hanIdx = -1;
  return (
    <>
      {[...seg.chars].map((ch, i) => {
        if (!HAN.test(ch)) {
          return (
            <span key={i} className="self-end pb-1 text-2xl text-muted-foreground">
              {ch}
            </span>
          );
        }
        hanIdx += 1;
        const pinyin = seg.pinyin[hanIdx] ?? '';
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick({ char: ch, pinyin, gloss: seg.gloss })}
            className="inline-flex flex-col items-center rounded px-0.5 hover:bg-muted"
          >
            <span className="h-4 text-xs leading-4 text-muted-foreground">{showPinyin ? pinyin : ' '}</span>
            <span className="text-2xl leading-snug">{ch}</span>
          </button>
        );
      })}
    </>
  );
}

export function Reader({ storyId, learnerId, title, segments, questions, choices, bootstrap }: ReaderProps) {
  const [showPinyin, setShowPinyin] = useState(bootstrap); // off by default; on in bootstrap (§16.4)
  const [selected, setSelected] = useState<SelectedChar | null>(null);
  const setDwellRef = useSegmentDwell(storyId, learnerId, segments);

  return (
    <div className="pb-48">
      <div className="mb-4 flex items-center justify-between">
        {title && <h1 className="text-xl font-semibold">{title}</h1>}
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
          <Questions storyId={storyId} learnerId={learnerId} questions={questions} />
        </div>
      )}

      {choices.length > 0 && (
        <div className="mt-10">
          <Choices storyId={storyId} choices={choices} />
        </div>
      )}

      <div className="mt-10">
        <FinishButton storyId={storyId} learnerId={learnerId} />
      </div>

      <CharPanel selected={selected} storyId={storyId} learnerId={learnerId} onClose={() => setSelected(null)} />
    </div>
  );
}

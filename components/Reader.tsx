'use client';

import { useState } from 'react';
import type { AnnotatedSegment } from '@/lib/annotate/index';
import type { Choice, ComprehensionQuestion } from '@/lib/generation/types';
import { CharPanel, type SelectedChar } from '@/components/CharPanel';
import { Questions } from '@/components/Questions';
import { Choices } from '@/components/Choices';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const HAN = /\p{Script=Han}/u;

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
          <SegmentView key={i} seg={seg} showPinyin={showPinyin} onPick={setSelected} />
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

      <CharPanel selected={selected} storyId={storyId} learnerId={learnerId} onClose={() => setSelected(null)} />
    </div>
  );
}

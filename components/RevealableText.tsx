'use client';

import type { AnnotatedSegment } from '@/lib/annotate/index';
import type { SelectedWord } from '@/components/CharPanel';

const HAN = /\p{Script=Han}/u;

// Shared tap-to-reveal renderer. One word = one tap target that opens the CharPanel (pinyin + gloss +
// components). Used by the story body (Reader), the title, comprehension questions, and branch choices.
// `record` flows into the SelectedWord so chrome reveals (title/questions/choices) can skip the SRS
// signal while body reveals keep it.

export function SegmentView({
  seg,
  showPinyin,
  onPick,
  charClassName = 'text-2xl leading-snug',
  record = true,
}: {
  seg: AnnotatedSegment;
  showPinyin: boolean;
  onPick: (w: SelectedWord) => void;
  charClassName?: string;
  record?: boolean;
}) {
  // Segments are either a single non-Han char (punctuation) or a run of Han (a word / single char).
  const isHan = seg.chars.length > 0 && HAN.test(seg.chars[0]);
  if (!isHan) {
    return <span className={`self-end pb-1 text-muted-foreground ${charClassName}`}>{seg.text}</span>;
  }

  // Context-aware reveal: the whole word is one tap target → the panel explains the word + each char.
  // Out-of-vocab (glossed) words always show pinyin and are underlined so the reader spots them; the
  // English gloss appears only in the tap panel (inline glosses break the wrap layout).
  const showWordPinyin = showPinyin || seg.oov;
  return (
    <button
      type="button"
      onClick={() => onPick({ text: seg.text, pinyin: seg.pinyin, gloss: seg.gloss, chars: seg.chars, oov: seg.oov, record })}
      className="inline-flex flex-col items-center rounded px-0.5 hover:bg-muted"
    >
      <span className="flex items-end">
        {[...seg.chars].map((ch, i) => (
          <span key={i} className="inline-flex flex-col items-center">
            <span className="h-4 text-xs leading-4 text-muted-foreground">
              {showWordPinyin ? seg.pinyin[i] ?? '' : ''}
            </span>
            <span className={`${charClassName} ${seg.oov ? 'border-b border-dotted border-amber-500' : ''}`}>{ch}</span>
          </span>
        ))}
      </span>
    </button>
  );
}

/** Map a run of annotated segments (title / question text / choice label) into tap-to-reveal words. */
export function RevealableText({
  segments,
  showPinyin,
  onPick,
  charClassName,
  record = true,
}: {
  segments: AnnotatedSegment[];
  showPinyin: boolean;
  onPick: (w: SelectedWord) => void;
  charClassName?: string;
  record?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-end gap-y-1">
      {segments.map((seg, i) => (
        <SegmentView key={i} seg={seg} showPinyin={showPinyin} onPick={onPick} charClassName={charClassName} record={record} />
      ))}
    </span>
  );
}

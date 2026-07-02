'use client';

import { useEffect, useRef, useState } from 'react';
import { getWordDetailAction, getStrokeDataAction, recordInteractionAction } from '@/app/actions';
import type { CharDetail, WordDetail } from '@/lib/char/detail';
import type { StrokeData } from '@/lib/char/strokes';
import type HanziWriterInstance from 'hanzi-writer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const HAN = /\p{Script=Han}/u;

/** A tapped segment (word or single char) from the reader. */
export interface SelectedWord {
  /** The segment text — the whole word (蝴蝶) or a single char. */
  text: string;
  /** Per Han-char toned pinyin, aligned to the Han chars of `text`. */
  pinyin: string[];
  gloss: string | null;
  chars: string[];
  /** §8.5 soft-gloss: an out-of-vocab word shown with always-on pinyin + gloss. */
  oov?: boolean;
  /** Whether tapping records an SRS reveal signal. False for chrome (title/questions/choices). */
  record?: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  semantic: 'meaning',
  phonetic: 'sound',
  structural: 'form',
};

/**
 * Stroke-order animation (hanzi-writer, §11). Fetches the char's stroke data (server action), then
 * dynamic-imports the browser-only lib and plays it. Renders nothing when the char has no stroke data
 * (some component glyphs lack graphics). hanzi-writer is fed our makemeahanzi data via charDataLoader.
 */
function StrokeAnimation({ char }: { char: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriterInstance | null>(null);
  const [data, setData] = useState<StrokeData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    void getStrokeDataAction(char).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [char]);

  useEffect(() => {
    if (!data || !ref.current) return;
    let cancelled = false;
    const node = ref.current;
    node.innerHTML = ''; // drop any previous writer's SVG before creating a new one
    void import('hanzi-writer').then(({ default: HanziWriter }) => {
      if (cancelled || !ref.current) return;
      const writer = HanziWriter.create(ref.current, char, {
        width: 160,
        height: 160,
        padding: 8,
        showOutline: true,
        charDataLoader: (_c, onComplete) => onComplete(data),
      });
      writerRef.current = writer;
      void writer.animateCharacter();
    });
    return () => {
      cancelled = true;
      writerRef.current = null;
      node.innerHTML = '';
    };
  }, [data, char]);

  if (!data) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={ref} style={{ width: 160, height: 160 }} />
      <Button variant="outline" size="sm" onClick={() => void writerRef.current?.animateCharacter()}>
        Replay strokes
      </Button>
    </div>
  );
}

/** One character's breakdown inside a word: glyph + reading + components + stroke animation. */
function CharBreakdown({ char, detail, showGlyph }: { char: string; detail?: CharDetail; showGlyph: boolean }) {
  return (
    <div className="border-t pt-3 first:border-t-0 first:pt-0">
      {showGlyph && (
        <div className="mb-1 flex items-baseline gap-3">
          <span className="text-2xl">{char}</span>
          {detail && <span className="text-sm text-muted-foreground">{detail.pinyin.join(' ')}</span>}
          {detail?.gloss && <span className="text-sm">{detail.gloss}</span>}
        </div>
      )}
      <StrokeAnimation char={char} />
      {detail && detail.components.length > 0 && (
        <div className="mt-2 text-sm text-muted-foreground">
          <span className="mr-2 font-medium text-foreground">Components:</span>
          {detail.components.map((c, i) => (
            <span key={i} className="mr-3">
              {c.char}
              <span className="text-xs"> ({ROLE_LABEL[c.role] ?? c.role}{c.gloss ? `: ${c.gloss}` : ''})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function CharPanel({
  selected,
  storyId,
  learnerId,
  onClose,
}: {
  selected: SelectedWord | null;
  storyId: number;
  learnerId: number;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<WordDetail | null>(null);
  const word = selected?.text;

  useEffect(() => {
    if (!selected || !word) {
      setDetail(null);
      return;
    }
    let active = true;
    // Tap-to-reveal is a weakness signal (§10). The whole word is revealed, so record one reveal per
    // Han char — FSRS grades at the char level (lib/srs), so every char in the word gets the signal.
    // Chrome reveals (title/questions/choices, record:false) are navigation aids — no SRS signal.
    if (selected.record !== false) {
      for (const ch of selected.chars) {
        if (HAN.test(ch)) void recordInteractionAction({ storyId, learnerId, char: ch, type: 'reveal' });
      }
    }
    void getWordDetailAction(word).then((d) => {
      if (active) setDetail(d);
    });
    return () => {
      active = false;
    };
  }, [word, selected, storyId, learnerId]);

  if (!selected) return null;

  const hanChars = selected.chars.filter((c) => HAN.test(c));
  const headerPinyin = selected.pinyin.join(' ') || detail?.pinyin || '';
  const headerGloss = selected.gloss ?? detail?.gloss ?? null;
  const detailByChar = new Map((detail?.chars ?? []).map((d) => [d.char, d]));

  return (
    <div className="fixed inset-x-0 bottom-0 flex justify-center p-4 lg:static lg:block lg:p-0">
      <Card className="max-h-[70vh] w-full max-w-md overflow-y-auto shadow-lg lg:max-h-[calc(100vh-4rem)] lg:max-w-none">
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="flex items-baseline gap-3">
            <CardTitle className="text-4xl">{selected.text}</CardTitle>
            <span className="text-lg text-muted-foreground">{headerPinyin}</span>
            {selected.oov && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                new word
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          {headerGloss && <p className="text-sm">{headerGloss}</p>}
          {detail?.exampleSentence && (
            <p className="rounded-md bg-muted px-3 py-2 text-base">{detail.exampleSentence}</p>
          )}
          {hanChars.map((ch, i) => (
            <CharBreakdown key={i} char={ch} detail={detailByChar.get(ch)} showGlyph={hanChars.length > 1} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

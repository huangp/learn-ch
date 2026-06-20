'use client';

import { useEffect, useRef, useState } from 'react';
import { getCharDetailAction, getStrokeDataAction, recordInteractionAction } from '@/app/actions';
import type { CharDetail } from '@/lib/char/detail';
import type { StrokeData } from '@/lib/char/strokes';
import type HanziWriterInstance from 'hanzi-writer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface SelectedChar {
  char: string;
  pinyin: string;
  gloss: string | null;
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

export function CharPanel({
  selected,
  storyId,
  learnerId,
  onClose,
}: {
  selected: SelectedChar | null;
  storyId: number;
  learnerId: number;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CharDetail | null>(null);
  const char = selected?.char;

  useEffect(() => {
    if (!char) {
      setDetail(null);
      return;
    }
    let active = true;
    // Tap-to-reveal is a weakness signal (§10) — capture it, then load the breakdown.
    void recordInteractionAction({ storyId, learnerId, char, type: 'reveal' });
    void getCharDetailAction(char).then((d) => {
      if (active) setDetail(d);
    });
    return () => {
      active = false;
    };
  }, [char, storyId, learnerId]);

  if (!selected) return null;

  const pinyin = selected.pinyin || detail?.pinyin.join(' ') || '';
  const gloss = selected.gloss ?? detail?.gloss ?? null;

  return (
    <div className="fixed inset-x-0 bottom-0 flex justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="flex items-baseline gap-3">
            <CardTitle className="text-4xl">{selected.char}</CardTitle>
            <span className="text-lg text-muted-foreground">{pinyin}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          <StrokeAnimation char={selected.char} />
          {gloss && <p className="text-sm">{gloss}</p>}
          {detail && detail.components.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <span className="mr-2 font-medium text-foreground">Components:</span>
              {detail.components.map((c, i) => (
                <span key={i} className="mr-3">
                  {c.char}
                  <span className="text-xs"> ({ROLE_LABEL[c.role] ?? c.role}{c.gloss ? `: ${c.gloss}` : ''})</span>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

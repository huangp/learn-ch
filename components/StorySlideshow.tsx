'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// The waiting-modal slideshow shown while a story generates. Flashcard slides of art-backed vocab
// (image + word; tap to reveal pinyin/gloss), a per-slide "I know this word" toggle (refines
// placement), Next, and the generation status — "Writing your story… Ns" → "Start reading →".

export interface Slide {
  word: string;
  imagePath: string;
  pinyin: string | null;
  gloss: string | null;
  sentence: string | null;
}

export type GenStatus =
  | { kind: 'pending' }
  | { kind: 'ready'; storyId: number }
  | { kind: 'error'; message: string };

/** Ticking elapsed seconds while `active` — mirrors the old generation toast. */
function useElapsedSeconds(active: boolean): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    setS(0);
    const t = setInterval(() => setS(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [active]);
  return s;
}

export function StorySlideshow({
  slides,
  status,
  onStartReading,
  onClose,
  onRetry,
}: {
  slides: Slide[];
  status: GenStatus;
  onStartReading: (storyId: number, knownWords: string[]) => void;
  onClose: (knownWords: string[]) => void;
  onRetry: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [known, setKnown] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const elapsed = useElapsedSeconds(status.kind === 'pending');

  const slide = slides[idx];
  const hasSlides = slides.length > 0;
  const isLast = idx >= slides.length - 1;

  function next() {
    setRevealed(false);
    setIdx((i) => Math.min(i + 1, slides.length - 1));
  }
  function toggleKnown() {
    if (!slide) return;
    setKnown((prev) => {
      const s = new Set(prev);
      if (s.has(slide.word)) s.delete(slide.word);
      else s.add(slide.word);
      return s;
    });
  }
  function start() {
    if (status.kind !== 'ready' || busy) return;
    setBusy(true);
    onStartReading(status.storyId, [...known]);
  }
  function close() {
    if (busy) return;
    setBusy(true);
    onClose([...known]);
  }

  const isKnown = slide != null && known.has(slide.word);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="flex flex-col gap-4">
        <DialogTitle>{hasSlides ? 'Words you’ll meet' : 'Creating your story'}</DialogTitle>

        {hasSlides && slide && (
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="overflow-hidden rounded-lg ring-1 ring-foreground/10"
              aria-label="Reveal meaning"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slide.imagePath} alt={slide.word} className="h-44 w-44 object-cover" />
            </button>

            <p className="text-3xl font-semibold">{slide.word}</p>

            {revealed ? (
              <div className="text-center">
                {slide.pinyin && <p className="text-muted-foreground">{slide.pinyin}</p>}
                {slide.gloss && <p className="text-sm">{slide.gloss}</p>}
                {slide.sentence && <p className="mt-1 text-base">{slide.sentence}</p>}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                tap to reveal
              </button>
            )}

            <button
              type="button"
              onClick={toggleKnown}
              aria-pressed={isKnown}
              className={`w-full rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                isKnown ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'
              }`}
            >
              {isKnown ? '✓ I know this word' : 'I know this word'}
            </button>

            <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
              <span>
                {idx + 1} / {slides.length}
              </span>
              <Button variant="outline" size="sm" onClick={next} disabled={isLast}>
                Next →
              </Button>
            </div>
          </div>
        )}

        <div className="border-t pt-3">
          {status.kind === 'pending' && (
            <p className="text-center text-sm text-muted-foreground">Writing your story… {elapsed}s</p>
          )}
          {status.kind === 'ready' && (
            <Button className="w-full" onClick={start} disabled={busy}>
              Start reading →
            </Button>
          )}
          {status.kind === 'error' && (
            <div className="grid gap-2 text-center">
              <p className="text-sm text-destructive">{status.message}</p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={onRetry} disabled={busy}>
                  Try again
                </Button>
                <Button variant="outline" className="flex-1" onClick={close} disabled={busy}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

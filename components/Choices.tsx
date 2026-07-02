'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startBranchGenerationAction, markWordsKnownAction, loadMoreSlidesAction } from '@/app/actions';
import type { AnnotatedChoice } from '@/components/reader-types';
import type { SelectedWord } from '@/components/CharPanel';
import { RevealableText } from '@/components/RevealableText';
import { useGeneration } from '@/components/use-generation';
import { StorySlideshow, type Slide } from '@/components/StorySlideshow';
import { Button } from '@/components/ui/button';

export function Choices({
  storyId,
  learnerId,
  slides,
  choices,
  flushDwell,
  showPinyin,
  onPick,
}: {
  storyId: number;
  learnerId: number;
  slides: Slide[];
  choices: AnnotatedChoice[];
  flushDwell: () => Promise<void>;
  showPinyin: boolean;
  onPick: (w: SelectedWord) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { status, run } = useGeneration();
  const [picked, setPicked] = useState<AnnotatedChoice | null>(null);
  const pending = open && status.kind === 'pending';

  function pick(choice: AnnotatedChoice) {
    setPicked(choice);
    setOpen(true);
    run(async () => {
      // Persist trailing dwell before branching — generating the next story grades this one, and
      // grading is idempotent, so late dwell writes would otherwise be dropped.
      await flushDwell();
      return startBranchGenerationAction(storyId, choice.seed, choice.label);
    });
  }

  async function persistKnown(knownWords: string[]) {
    if (knownWords.length > 0) await markWordsKnownAction(learnerId, knownWords);
  }

  async function handleStartReading(nextId: number, knownWords: string[]) {
    await persistKnown(knownWords);
    router.push(`/learners/${learnerId}/read/${nextId}`);
  }

  async function handleClose(knownWords: string[]) {
    await persistKnown(knownWords);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium text-muted-foreground">What happens next?</p>
      <div className="grid gap-2">
        {choices.map((c, i) => (
          <div key={i} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
            {/* Read the choice (tap → reveal) separately from picking it (the Go button). */}
            <div className="min-w-0">
              <RevealableText segments={c.labelSegments} showPinyin={showPinyin} onPick={onPick} charClassName="text-lg" record={false} />
            </div>
            <Button variant="outline" className="shrink-0" disabled={pending} onClick={() => pick(c)}>
              {pending ? 'Writing…' : 'Go →'}
            </Button>
          </div>
        ))}
      </div>
      {open && (
        <StorySlideshow
          slides={slides}
          status={status}
          onStartReading={handleStartReading}
          onClose={handleClose}
          onRetry={() => picked && pick(picked)}
          loadMore={(exclude) => loadMoreSlidesAction(learnerId, exclude)}
        />
      )}
    </div>
  );
}

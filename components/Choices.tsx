'use client';

import { useTransition } from 'react';
import { chooseBranchAction } from '@/app/actions';
import type { AnnotatedChoice } from '@/components/reader-types';
import type { SelectedWord } from '@/components/CharPanel';
import { RevealableText } from '@/components/RevealableText';
import { Button } from '@/components/ui/button';

export function Choices({
  storyId,
  choices,
  flushDwell,
  showPinyin,
  onPick,
}: {
  storyId: number;
  choices: AnnotatedChoice[];
  flushDwell: () => Promise<void>;
  showPinyin: boolean;
  onPick: (w: SelectedWord) => void;
}) {
  const [pending, startTransition] = useTransition();

  function pick(choice: AnnotatedChoice) {
    startTransition(async () => {
      // Persist trailing dwell before branching — generating the next story grades this one, and
      // grading is idempotent, so late dwell writes would otherwise be dropped.
      await flushDwell();
      await chooseBranchAction(storyId, choice.seed, choice.label);
    });
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
    </div>
  );
}

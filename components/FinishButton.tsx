'use client';

import { useState, useTransition } from 'react';
import { gradeStoryAction } from '@/app/actions';
import { Button } from '@/components/ui/button';

// Explicit finish trigger (Phase 7): grades this story's interactions into FSRS state on
// demand for immediate progress feedback. Idempotent server-side — the catch-up pass at the
// next generation safely skips an already-finished story.
export function FinishButton({
  storyId,
  learnerId,
  flushDwell,
}: {
  storyId: number;
  learnerId: number;
  flushDwell: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function finish() {
    startTransition(async () => {
      // Flush trailing dwell before grading (idempotent) so the final segment's signal counts.
      await flushDwell();
      await gradeStoryAction(learnerId, storyId);
      setDone(true);
    });
  }

  return (
    <Button variant="secondary" disabled={pending || done} onClick={finish}>
      {done ? 'Finished ✓' : pending ? 'Saving…' : "I'm done reading"}
    </Button>
  );
}

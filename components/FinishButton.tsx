'use client';

import { useState, useTransition } from 'react';
import { gradeStoryAction } from '@/app/actions';
import { Button } from '@/components/ui/button';

// Explicit finish trigger (Phase 7): grades this story's interactions into FSRS state on
// demand for immediate progress feedback. Idempotent server-side — the catch-up pass at the
// next generation safely skips an already-finished story.
export function FinishButton({ storyId, learnerId }: { storyId: number; learnerId: number }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function finish() {
    startTransition(async () => {
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

'use client';

import { useState, useTransition } from 'react';
import { deleteStoryAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Soft-delete control on a story card. A small ghost trigger opens a Popover confirm (no AlertDialog
// primitive exists). On confirm the server action hides the story; revalidatePath re-renders the
// dashboard so the card disappears. Lives as an overlay sibling of the card's <Link> (not nested in
// the anchor) in app/learners/[id]/page.tsx.
export function DeleteStoryButton({
  storyId,
  learnerId,
  permanent = false,
}: {
  storyId: number;
  learnerId: number;
  /** Adult sessions delete permanently (row + interactions); learners soft-delete (stats kept). */
  permanent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setOpen(false);
    startTransition(async () => {
      await deleteStoryAction(learnerId, storyId);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" disabled={pending} aria-label="Delete story">
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64">
        <p className="text-sm">
          {permanent
            ? 'Permanently delete this story and its data? This can’t be undone.'
            : 'Delete this story? It’s hidden from your list — your reading stats are kept.'}
        </p>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={confirm}>
            Delete
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

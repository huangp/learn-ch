'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getGenerationStatusAction } from '@/app/actions';
import type { GenStatus } from '@/components/StorySlideshow';

// Generation is backgrounded server-side (a jobId is returned immediately). This hook drives the
// waiting-modal status: kick off with `run(start)` where `start` enqueues the job, then poll the
// jobId until it resolves to `ready` (storyId) or `error`. Shared by every generation trigger
// (GenerateStoryForm / SeedLibrary / Choices) so the start→poll logic lives in one place.

const POLL_MS = 1500;
const FAIL = 'Generation failed. Please try again.';
const BUSY = 'A story is already being written — please wait for it to finish.';

type StartResult = { jobId: string } | { busy: true };

export function useGeneration() {
  const [status, setStatus] = useState<GenStatus>({ kind: 'pending' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const run = useCallback(
    (start: () => Promise<StartResult>) => {
      stop();
      setStatus({ kind: 'pending' });
      const poll = (jobId: string) => {
        getGenerationStatusAction(jobId)
          .then((s) => {
            if (s.status === 'done' && s.storyId != null) setStatus({ kind: 'ready', storyId: s.storyId });
            else if (s.status === 'error') setStatus({ kind: 'error', message: s.error ?? FAIL });
            else timer.current = setTimeout(() => poll(jobId), POLL_MS);
          })
          .catch((e) => setStatus({ kind: 'error', message: e instanceof Error ? e.message : FAIL }));
      };
      start()
        .then((res) => {
          if ('busy' in res) setStatus({ kind: 'error', message: BUSY });
          else poll(res.jobId);
        })
        .catch((e) => setStatus({ kind: 'error', message: e instanceof Error ? e.message : FAIL }));
    },
    [stop],
  );

  useEffect(() => stop, [stop]); // stop polling on unmount

  return { status, run };
}

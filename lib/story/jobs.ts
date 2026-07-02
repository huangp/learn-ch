import { randomUUID } from 'node:crypto';

// In-memory generation job registry. Generation is slow (up to ~6 serial LLM generate/repair
// calls + a heteronym pass); running it inside a server action holds the HTTP request open for its
// full duration. Instead the action enqueues a job here and returns immediately with a jobId; the
// client polls getGenerationStatusAction until the job resolves. The single-instance deployment +
// long-lived `next start` process means this module-level state survives across the poll requests,
// and the detached promise runs to completion.
//
// Trade-off: jobs live only in memory, so a generation in flight during a process restart (deploy)
// is orphaned — the client poll then sees an unknown id → error → retry. Acceptable for one instance.

export type JobStatus = 'running' | 'done' | 'error';

export interface Job {
  status: JobStatus;
  storyId?: number;
  error?: string;
  startedAt: number;
}

/** startJob refuses a duplicate while the learner already has one in flight (see activeByLearner). */
export type StartResult = { jobId: string } | { busy: true };

const jobs = new Map<string, Job>();
// One in-flight generation per learner: learnerId → its active jobId. "In flight" spans from enqueue
// to completion (so a request that's still queued behind the chain also blocks a duplicate).
const activeByLearner = new Map<number, string>();
const TTL_MS = 10 * 60 * 1000; // prune finished/stale jobs 10 min after they started

// Serialize generations: on one shared vCPU, concurrent LLM+annotate runs compound the CPU
// throttle. A single-flight chain runs them one at a time; extra requests queue behind it.
let chain: Promise<unknown> = Promise.resolve();

function prune(now: number): void {
  for (const [id, job] of jobs) {
    if (now - job.startedAt > TTL_MS) jobs.delete(id);
  }
}

/**
 * Enqueue a generation for `learnerId`. Returns a jobId immediately; `run` executes single-file
 * behind the chain. If the learner already has a generation in flight, returns `{ busy: true }`
 * without creating a second job — the caller surfaces "already generating" to the user.
 */
export function startJob(learnerId: number, run: () => Promise<{ id: number }>): StartResult {
  if (activeByLearner.has(learnerId)) return { busy: true };
  const now = Date.now();
  prune(now);
  const id = randomUUID();
  jobs.set(id, { status: 'running', startedAt: now });
  activeByLearner.set(learnerId, id);
  const clearLock = () => {
    if (activeByLearner.get(learnerId) === id) activeByLearner.delete(learnerId);
  };
  chain = chain.then(() =>
    run().then(
      (story) => {
        jobs.set(id, { status: 'done', storyId: story.id, startedAt: now });
        clearLock();
      },
      (err) => {
        jobs.set(id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Generation failed. Please try again.',
          startedAt: now,
        });
        clearLock();
      },
    ),
  );
  return { jobId: id };
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

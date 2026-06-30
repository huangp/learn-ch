import type { StoryStats } from '@/lib/story/stats';

/** Metadata strip shown above the story title: length, reading-time estimate, unknown chars, model.
 *
 * `reusedFrom` (the sibling's display name) is set when this story was cloned from another learner on
 * the same account (lib/story/reuse.ts) — we show a friendly "From <sibling>" badge instead of the
 * cryptic `model: reuse` chip. */
export function StoryMeta({
  stats,
  model,
  reusedFrom = null,
}: {
  stats: StoryStats;
  model: string | null;
  reusedFrom?: string | null;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
      <span>
        <span className="font-medium text-foreground">{stats.charCount}</span> characters
      </span>
      <span aria-hidden>·</span>
      <span>~{stats.readingMinutes} min read</span>
      <span aria-hidden>·</span>
      <span>
        <span className="font-medium text-foreground">{stats.unknownChars.length}</span> unknown
        {stats.unknownChars.length > 0 && (
          <span className="ml-1.5 font-medium text-foreground">{stats.unknownChars.join(' ')}</span>
        )}
      </span>
      {reusedFrom ? (
        <>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-foreground">
            📖 From {reusedFrom}
          </span>
        </>
      ) : model ? (
        <>
          <span aria-hidden>·</span>
          <span>
            Model: <span className="font-medium text-foreground">{model}</span>
          </span>
        </>
      ) : null}
    </div>
  );
}

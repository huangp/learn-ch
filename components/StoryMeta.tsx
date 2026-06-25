import type { StoryStats } from '@/lib/story/stats';

/** Metadata strip shown above the story title: length, reading-time estimate, unknown chars, model. */
export function StoryMeta({ stats, model }: { stats: StoryStats; model: string | null }) {
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
      {model && (
        <>
          <span aria-hidden>·</span>
          <span>
            Model: <span className="font-medium text-foreground">{model}</span>
          </span>
        </>
      )}
    </div>
  );
}

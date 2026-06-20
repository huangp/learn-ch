// Minimal presentational progress bar (value 0..1). Plain div — no base-ui primitive.

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={'h-2 w-full overflow-hidden rounded-full bg-muted ' + (className ?? '')}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

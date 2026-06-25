'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DailyActivity } from '@/lib/progress/index';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// §11 weekly reading-activity calendar. Pages through Mon–Sun weeks; each day cell shows the
// completed-story metrics from `getReadingActivity` (server-computed), filling empty days with
// zeros. Read-only — all the work is client-side date math over the passed-in activity list.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const ZERO = { storiesRead: 0, uniqueChars: 0, totalChars: 0, readingMinutes: 0 };

function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Monday (local) of the week containing `d`.
function mondayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (out.getDay() + 6) % 7; // 0 = Monday
  out.setDate(out.getDate() - dow);
  return out;
}

const monthDay = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function WeeklyActivity({ activity }: { activity: DailyActivity[] }) {
  const byDate = useMemo(() => new Map(activity.map((a) => [a.date, a])), [activity]);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, negative = past

  const today = new Date();
  const todayKey = localDay(today);
  const weekStart = mondayOf(today);
  weekStart.setDate(weekStart.getDate() - weekOffset * 7);

  const days = WEEKDAYS.map((label, i) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    const key = localDay(d);
    return { label, date: d, key, isToday: key === todayKey, stats: byDate.get(key) ?? ZERO };
  });
  const weekEnd = days[6].date;

  const totals = days.reduce(
    (acc, d) => ({
      storiesRead: acc.storiesRead + d.stats.storiesRead,
      uniqueChars: acc.uniqueChars + d.stats.uniqueChars,
      totalChars: acc.totalChars + d.stats.totalChars,
      readingMinutes: acc.readingMinutes + d.stats.readingMinutes,
    }),
    { ...ZERO },
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Reading activity</CardTitle>
            <CardDescription>
              {monthDay(weekStart)} – {monthDay(weekEnd)}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous week"
              onClick={() => setWeekOffset((o) => o + 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next week"
              disabled={weekOffset === 0}
              onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const empty = d.stats.totalChars === 0;
            return (
              <div
                key={d.key}
                className={`flex flex-col items-center gap-1 rounded-md border p-1.5 text-center ${
                  d.isToday ? 'border-primary' : 'border-foreground/10'
                } ${empty ? 'opacity-50' : ''}`}
              >
                <div className="text-[0.65rem] font-medium text-muted-foreground">{d.label}</div>
                <div className="text-xs tabular-nums">{d.date.getDate()}</div>
                <Metric label="stories" value={d.stats.storiesRead} />
                <Metric label="new chars" value={d.stats.uniqueChars} />
                <Metric label="read" value={d.stats.totalChars} />
                <Metric label="min" value={d.stats.readingMinutes} />
              </div>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          This week: {totals.storiesRead} stories · {totals.uniqueChars} unique chars ·{' '}
          {totals.totalChars} characters read · ~{totals.readingMinutes} min
        </p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="leading-tight">
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[0.6rem] text-muted-foreground">{label}</div>
    </div>
  );
}

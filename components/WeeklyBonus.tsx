import type { BonusStatus } from '@/lib/screentime/bonus';
import { BONUS_MINUTES_PARTIAL, BONUS_MINUTES_STREAK, BONUS_PARTIAL_DAYS, BONUS_STREAK_DAYS } from '@/lib/screentime/code';
import { ScreentimeClaim } from '@/components/ScreentimeClaim';

// Weekly streak bonus card on the learner home (lib/screentime/bonus.ts): Mon–Fri progress dots
// on weekdays; on Sat/Sun the <screentime-claim> widget for whatever is earned and unclaimed.

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F'];

export function WeeklyBonus({
  learnerId,
  status,
  kids,
  defaultKid,
}: {
  learnerId: number;
  status: BonusStatus;
  kids: string[];
  defaultKid: string | null;
}) {
  const { isWeekend, thisWeek, pending, lastClaim } = status;
  const [y, m, d] = thisWeek.monday.split('-').map(Number);
  const read = new Set(thisWeek.daysRead);
  const dayKeys = WEEKDAYS.map((_, i) => {
    const day = new Date(y, m - 1, d + i);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  });
  // Re-show this weekend's code once everything is claimed.
  const shownClaim = !pending.minutes && lastClaim?.weeks.includes(thisWeek.monday) ? lastClaim : null;

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">Weekly reading bonus</h2>
        <div className="flex gap-1">
          {WEEKDAYS.map((label, i) => (
            <span
              key={dayKeys[i]}
              className={`flex size-6 items-center justify-center rounded-full text-xs ${
                read.has(dayKeys[i]) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Finish a story on all {BONUS_STREAK_DAYS} weekdays → {BONUS_MINUTES_STREAK} min, any {BONUS_PARTIAL_DAYS} →{' '}
        {BONUS_MINUTES_PARTIAL} min. Claim it on Saturday or Sunday.
        {!isWeekend && ` This week: ${thisWeek.daysRead.length}/${BONUS_STREAK_DAYS} days${thisWeek.minutes ? ` (${thisWeek.minutes} min so far)` : ''}.`}
        {!isWeekend && pending.minutes > 0 && ` ${pending.minutes} min from earlier weeks is waiting for the weekend.`}
      </p>
      {isWeekend && (pending.minutes > 0 || shownClaim) && (
        <div className="mt-3">
          <ScreentimeClaim
            endpoint={`/api/learners/${learnerId}/screentime-bonus`}
            minutes={pending.minutes || (shownClaim?.minutes ?? 0)}
            claim={shownClaim}
            kids={kids}
            defaultKid={defaultKid}
          />
        </div>
      )}
    </div>
  );
}

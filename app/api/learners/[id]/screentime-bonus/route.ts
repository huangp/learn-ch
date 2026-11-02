import { db } from '@/lib/db';
import { canAccessLearner } from '@/lib/auth/access';
import { getSessionContext } from '@/lib/auth/session';
import { claimWeeklyBonus } from '@/lib/screentime/bonus';
import { updateLearner } from '@/lib/learner/crud';

// Minting endpoint for the weekly streak bonus (lib/screentime/bonus.ts), driven by the same
// <screentime-claim> widget as the per-story route: POST {kid} → 200 {kid, minutes, code, url} | 4xx {error}.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const learnerId = Number(id);
  const ctx = await getSessionContext();
  if (!ctx || !canAccessLearner(db, ctx, learnerId)) {
    return Response.json({ error: 'Not authorized.' }, { status: 403 });
  }
  // Credit is the LEARNER's — an adult session is previewing, not reading.
  if (ctx.kind === 'adult') return Response.json({ error: 'Only the reader can claim.' }, { status: 403 });
  const secret = process.env.SCREENTIME_CODE_SECRET;
  if (!secret) return Response.json({ error: 'Screen time credit is not set up.' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { kid?: unknown };
  const result = claimWeeklyBonus(db, learnerId, typeof body.kid === 'string' ? body.kid : '', secret);
  if ('error' in result) return Response.json(result, { status: 400 });
  updateLearner(db, learnerId, { settings: { screentimeKid: result.kid } }); // preselect it next time
  return Response.json({ kid: result.kid, minutes: result.minutes, code: result.code, url: result.url });
}

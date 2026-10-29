import { db } from '@/lib/db';
import { canAccessLearner, canAccessStory } from '@/lib/auth/access';
import { getSessionContext } from '@/lib/auth/session';
import { claimStoryCredit } from '@/lib/screentime/claim';
import { updateLearner } from '@/lib/learner/crud';

// Minting endpoint for the <screentime-claim> widget (public/screentime-claim.js):
// POST {kid} → 200 {kid, minutes, code, url} | 4xx {error}. The HMAC secret stays server-side.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; storyId: string }> }) {
  const { id, storyId } = await params;
  const learnerId = Number(id);
  const sid = Number(storyId);
  const ctx = await getSessionContext();
  if (!ctx || !canAccessLearner(db, ctx, learnerId) || !canAccessStory(db, ctx, sid)) {
    return Response.json({ error: 'Not authorized.' }, { status: 403 });
  }
  // Credit is the LEARNER's — an adult session is previewing, not reading.
  if (ctx.kind === 'adult') return Response.json({ error: 'Only the reader can claim.' }, { status: 403 });
  const secret = process.env.SCREENTIME_CODE_SECRET;
  if (!secret) return Response.json({ error: 'Screen time credit is not set up.' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { kid?: unknown };
  const result = claimStoryCredit(db, learnerId, sid, typeof body.kid === 'string' ? body.kid : '', secret);
  if ('error' in result) return Response.json(result, { status: 400 });
  updateLearner(db, learnerId, { settings: { screentimeKid: result.kid } }); // preselect it next time
  return Response.json({ kid: result.kid, minutes: result.minutes, code: result.code, url: result.url });
}

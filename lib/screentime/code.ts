/**
 * Mint screentime credit codes — ported from home-network-ctrl/codegen/screentimeCode.ts.
 *
 * SERVER-SIDE ONLY: never ship the secret to a browser or app bundle, or a
 * kid can mint unlimited codes. kid must be a pool name from the screentime
 * config.yaml; minutes 1-240 (the screentime server rejects anything else).
 *
 * Format: <minutes>-<nonce>-<sig>
 *   nonce = 6 random chars of A-Z2-7, single use
 *   sig   = base32(HMAC-SHA256(secret, "<kid>:<minutes>:<nonce>"))[:8]
 */
import { createHmac, randomInt } from 'node:crypto';

/** Credit a finished story earns (lib/screentime/claim.ts). */
export const CREDIT_MINUTES_PER_STORY = 10;

/** Weekly bonus (lib/screentime/bonus.ts): finished a story on all 5 weekdays → 60 min, else ≥3 → 30. */
export const BONUS_MINUTES_STREAK = 60;
export const BONUS_MINUTES_PARTIAL = 30;
export const BONUS_STREAK_DAYS = 5;
export const BONUS_PARTIAL_DAYS = 3;
/** makeCode's ceiling — one code can't carry more than this. */
export const MAX_CODE_MINUTES = 240;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CLAIM_BASE = 'http://screentime.lan/claim';

function base32(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = ((value << 8) | byte) & 0xfff; // keep only the bits not yet emitted
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out; // trailing partial group unused: we only take 8 chars
}

export function sign(secret: string, kid: string, minutes: number, nonce: string): string {
  const mac = createHmac('sha256', secret).update(`${kid}:${minutes}:${nonce}`).digest();
  return base32(mac).slice(0, 8);
}

export function makeCode(secret: string, kid: string, minutes: number, nonce?: string): string {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_CODE_MINUTES) {
    throw new RangeError('minutes must be an integer 1-240');
  }
  const n = nonce ?? Array.from({ length: 6 }, () => B32[randomInt(32)]).join('');
  return `${minutes}-${n}-${sign(secret, kid, minutes, n)}`;
}

export function claimUrl(kid: string, code: string): string {
  return `${CLAIM_BASE}?${new URLSearchParams({ kid, code })}`;
}

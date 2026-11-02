'use client';

import Script from 'next/script';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { CreditClaim } from '@/lib/generation/types';

// React wrapper for the drop-in <screentime-claim> widget (public/screentime-claim.js, canonical
// copy in home-network-ctrl/codegen). The widget POSTs the kid's name to the minting route, which
// checks eligibility (lib/screentime/claim.ts or bonus.ts) and returns a code + screentime.lan link.

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'screentime-claim': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        endpoint: string;
        minutes?: string;
        kids?: string;
        'default-kid'?: string;
        kid?: string;
        code?: string;
      };
    }
  }
}

export function ScreentimeClaim({
  endpoint,
  minutes,
  claim,
  kids,
  defaultKid,
}: {
  /** Minting route: per-story (…/stories/[storyId]/screentime-claim) or weekly (…/screentime-bonus). */
  endpoint: string;
  minutes: number;
  claim: CreditClaim | null;
  /** Pool names for the dropdown (SCREENTIME_KIDS); empty ⇒ text input only. */
  kids: string[];
  /** The learner's last-claimed name (learners.settings.screentimeKid), preselected. */
  defaultKid: string | null;
}) {
  return (
    <>
      <Script src="/screentime-claim.js" type="module" strategy="afterInteractive" />
      <screentime-claim
        endpoint={endpoint}
        minutes={String(minutes)}
        kids={kids.join(',') || undefined}
        default-kid={defaultKid ?? undefined}
        kid={claim?.kid}
        code={claim?.code}
      />
    </>
  );
}

'use client';

import Script from 'next/script';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { CreditClaim } from '@/lib/generation/types';

// React wrapper for the drop-in <screentime-claim> widget (public/screentime-claim.js, canonical
// copy in home-network-ctrl/codegen). The widget POSTs the kid's name to the minting route, which
// checks the story is done (lib/screentime/claim.ts) and returns a code + screentime.lan link.

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
  storyId,
  learnerId,
  minutes,
  claim,
  kids,
  defaultKid,
}: {
  storyId: number;
  learnerId: number;
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
        endpoint={`/api/learners/${learnerId}/stories/${storyId}/screentime-claim`}
        minutes={String(minutes)}
        kids={kids.join(',') || undefined}
        default-kid={defaultKid ?? undefined}
        kid={claim?.kid}
        code={claim?.code}
      />
    </>
  );
}

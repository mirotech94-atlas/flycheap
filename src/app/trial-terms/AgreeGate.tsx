'use client';

import { useState } from 'react';

export function AgreeGate({ checkoutHref }: { checkoutHref: string }) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="fc-trial-gate">
      <label className="fc-trial-agree">
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
        />
        <span>
          I have read and agree to the 14-day trial terms above, including automatic
          billing of <strong>$9/month</strong> after the trial unless I cancel.
        </span>
      </label>
      <a
        href={agreed ? checkoutHref : undefined}
        aria-disabled={!agreed}
        onClick={e => { if (!agreed) e.preventDefault(); }}
        className={`fc-btn fc-btn-gold fc-trial-cta${agreed ? '' : ' disabled'}`}
      >
        Accept &amp; start my free trial →
      </a>
      <div className="fc-trial-note">
        Secure checkout by Stripe · Card saved, <strong>$0 charged today</strong> · Cancel in one click from Settings
      </div>
    </div>
  );
}

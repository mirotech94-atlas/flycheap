'use client';

import { useState } from 'react';
import type { PlanFeature } from '@/lib/tierCopy';
import { PRICES, annualSavingsPct, type Plan, type Period } from '@/lib/prices';

// The period switch's "save up to N%" chip, derived from the same formula
// pricingLabel() uses for the per-plan yearly sub-line, not a second typed
// number next to it. The larger of the two plans' savings (enterprise, 36%)
// is what "up to" refers to.
const MAX_ANNUAL_SAVINGS_PCT = Math.max(
  ...(Object.keys(PRICES) as Plan[]).map(annualSavingsPct)
);

/**
 * Plan bullets are DERIVED, not typed — see lib/tierCopy.ts.
 *
 * What used to live here was a hand-written list, and it had drifted into three
 * false claims in a single line: it sold Pro as "All alert channels (Slack,
 * Telegram, WhatsApp, Instagram, SMS, email)" when Slack is the internal ops
 * channel and in no tier's list, Instagram has no sender or code at all, and
 * WhatsApp's sender is unset so every WhatsApp alert returns "not configured".
 * It also sold "30-minute polling — 8× faster than Free", which is the exact
 * promise that blocks the poll allocator from getting full authority.
 *
 * The server passes in what each tier gives AND what the product can actually
 * deliver, so neither mistake can be made here again.
 */
export type PlanBullets = Record<'free' | 'pro' | 'enterprise', PlanFeature[]>;


export function PricingClient({ signedIn, currentTier, bullets, paypalEnabled = false, cancelsOn = null }: {
  signedIn: boolean;
  currentTier: string;
  bullets: PlanBullets;
  /** Human date the paid period ends when a cancellation is already scheduled; null otherwise. */
  cancelsOn?: string | null;
  /** False when PayPal has no credentials — then we do not offer it at all. */
  paypalEnabled?: boolean;
}) {
  const [period, setPeriod] = useState<Period>('month');
  const [cancelling, setCancelling] = useState(false);

  async function downgrade() {
    if (cancelling) return;
    const confirmed = window.confirm(
      'Downgrade to Free? Your subscription will not renew. You keep your current plan until the end of the period you have already paid for; after that your account moves to Free, routes above the Free limit are paused, and paid-only alert channels stop. Nothing is deleted and you can re-subscribe any time.'
    );
    if (!confirmed) return;
    setCancelling(true);
    const res = await fetch('/api/billing/cancel', { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setCancelling(false);
    if (j.ok) {
      window.location.href = j.endsAt ? '/settings?billing=cancel-scheduled' : '/settings?billing=cancelled';
    } else {
      alert('Cancellation hit an error: ' + (j.error ?? 'unknown') + '\nReach out and we will sort it out.');
    }
  }

  function checkoutHref(provider: 'stripe' | 'paypal', plan: Plan): string {
    if (!signedIn) return `/login?next=${encodeURIComponent(`/pricing?plan=${plan}&period=${period}&provider=${provider}`)}`;
    const base = provider === 'stripe' ? '/api/billing/checkout' : '/api/billing/paypal/checkout';
    return `${base}?plan=${plan}&period=${period}`;
  }

  function pricingLabel(plan: Plan): { headline: string; sub: string } {
    const price = PRICES[plan][period];
    if (period === 'year') {
      const perMonth = (price / 12).toFixed(2).replace(/\.?0+$/, '');
      const monthly = PRICES[plan].month;
      const savedPct = Math.round((1 - (price / 12) / monthly) * 100);
      // Yearly headline = actual yearly charge (clearer expectation at
      // checkout); per-month equivalent + savings shown as supporting context.
      return {
        headline: `$${price}/yr`,
        sub: `≈ $${perMonth}/mo · save ${savedPct}%`,
      };
    }
    return { headline: `$${price}/mo`, sub: 'billed monthly · cancel anytime' };
  }

  return (
    <div className="space-y-6">
      {/* Monthly / yearly toggle */}
      <div className="flex items-center justify-center">
        <div className="ed-seg">
          <button
            type="button"
            onClick={() => setPeriod('month')}
            className={`ed-seg-btn${period === 'month' ? ' active' : ''}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setPeriod('year')}
            className={`ed-seg-btn${period === 'year' ? ' active' : ''}`}
          >
            Yearly{' '}
            <span
              className="ed-mono"
              style={{ marginLeft: 2, opacity: period === 'year' ? 0.82 : 1, color: period === 'year' ? undefined : 'var(--green)' }}
            >
              save up to {MAX_ANNUAL_SAVINGS_PCT}%
            </span>
          </button>
        </div>
      </div>

      <div className="ed-plans">
        {/* FREE */}
        <div className={`ed-plan${signedIn && currentTier === 'free' ? ' current' : ''}`}>
          <div className="ed-eyebrow">Free</div>
          <div className="ed-plan-price">$0</div>
          <p className="ed-plan-note">forever — email alerts only</p>
          <ul className="ed-plan-list">
            {bullets.free.map(f => <Bullet key={f.text} f={f} />)}
          </ul>
          <div className="ed-plan-cta">
            {!signedIn ? (
              <a href="/early-access" className="ed-btn ed-btn-primary w-full justify-center text-center">Get early access →</a>
            ) : currentTier === 'free' ? (
              <button className="ed-btn ed-btn-secondary w-full justify-center" disabled>Your current plan</button>
            ) : cancelsOn ? (
              <button className="ed-btn ed-btn-secondary w-full justify-center" disabled>Moves to Free on {cancelsOn}</button>
            ) : (
              <button type="button" className="ed-btn ed-btn-danger w-full justify-center" disabled={cancelling} onClick={downgrade}>
                {cancelling ? 'Cancelling…' : 'Downgrade to Free'}
              </button>
            )}
          </div>
        </div>

        {/* PRO */}
        {(['pro'] as Plan[]).map(plan => {
          const lbl = pricingLabel(plan);
          const isCurrent = currentTier === plan;
          return (
            <div key={plan} className={`ed-plan featured${isCurrent ? ' current' : ''}`}>
              <div className="ed-plan-badge">Most popular</div>
              <div className="ed-eyebrow">Pro</div>
              <div className="ed-plan-price">{lbl.headline}</div>
              <p className="ed-plan-note">{lbl.sub}</p>
              <ul className="ed-plan-list">
                {bullets[plan].map(f => <Bullet key={f.text} f={f} />)}
              </ul>
              <div className="ed-plan-cta">
                {!signedIn ? (
                  <a href="/early-access" className="ed-btn ed-btn-primary w-full justify-center text-center">Get early access →</a>
                ) : isCurrent ? (
                  <button className="ed-btn ed-btn-secondary w-full justify-center" disabled>Your current plan</button>
                ) : (
                  <>
                    <a href={checkoutHref('stripe', plan)} className="ed-btn ed-btn-primary w-full justify-center text-center">
                      Subscribe with card →
                    </a>
                    {paypalEnabled && (
                      <a href={checkoutHref('paypal', plan)} className="ed-btn ed-btn-secondary w-full justify-center text-center">
                        Subscribe with PayPal
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Payment methods strip spans full width below the grid — see after grid close */}
        {/* ENTERPRISE */}
        {(['enterprise'] as Plan[]).map(plan => {
          const lbl = pricingLabel(plan);
          const isCurrent = currentTier === plan;
          return (
            <div key={plan} className={`ed-plan${isCurrent ? ' current' : ''}`}>
              <div className="ed-eyebrow">Enterprise</div>
              <div className="ed-plan-price">{lbl.headline}</div>
              <p className="ed-plan-note">{lbl.sub}</p>
              <p className="ed-plan-note" style={{ marginTop: 1, fontWeight: 500 }}>Billed immediately · no trial</p>
              <ul className="ed-plan-list">
                {bullets[plan].map(f => <Bullet key={f.text} f={f} />)}
              </ul>
              <div className="ed-plan-cta">
                {!signedIn ? (
                  <a href="/early-access" className="ed-btn ed-btn-primary w-full justify-center text-center">Get early access →</a>
                ) : isCurrent ? (
                  <button className="ed-btn ed-btn-secondary w-full justify-center" disabled>Your current plan</button>
                ) : (
                  <>
                    <a href={checkoutHref('stripe', plan)} className="ed-btn ed-btn-primary w-full justify-center text-center">
                      Subscribe with card →
                    </a>
                    {paypalEnabled && (
                      <a href={checkoutHref('paypal', plan)} className="ed-btn ed-btn-secondary w-full justify-center text-center">
                        Subscribe with PayPal
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Accepted payment methods */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2" style={{ fontSize: 12, color: 'var(--muted)' }}>
        <span className="ed-mono" style={{ color: 'var(--muted-2)' }}>We accept</span>
        {[
          { icon: '💳', label: 'Debit & credit cards' },
          { icon: '🅿️', label: 'PayPal' },
          { icon: '⚡', label: 'Stripe' },
          { icon: '🏦', label: 'Bank accounts (ACH & transfers)' },
        ].map(m => (
          <span key={m.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden>{m.icon}</span>{m.label}
          </span>
        ))}
        <span style={{ color: 'var(--muted-2)' }}>· Secure checkout · Cancel anytime</span>
      </div>
    </div>
  );
}

/** A bullet that states what a plan does NOT include rather than omitting it. */
function Bullet({ f }: { f: PlanFeature }) {
  return f.included
    ? <li>✓ {f.text}</li>
    : <li className="off">— {f.text}</li>;
}

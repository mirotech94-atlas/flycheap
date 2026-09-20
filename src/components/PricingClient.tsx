'use client';

import { useState } from 'react';
import type { PlanFeature } from '@/lib/tierCopy';

type Plan = 'pro' | 'enterprise';
type Period = 'month' | 'year';

// Monthly prices and the per-month equivalent of the annual price (so users
// see what the yearly saves them per month vs. the monthly rate).
// MUST match the live Stripe prices exactly — these were advertising $5/$20
// while Stripe charged $9/$39, i.e. users were quoted one price and billed
// almost double. Verified against the live Stripe API 2026-09-12:
//   pro monthly 900 · pro yearly 7900 · ent monthly 3900 · ent yearly 29900
const PRICES: Record<Plan, Record<Period, number>> = {
  pro:        { month: 9,  year: 79  }, // $79/yr · $29 off vs monthly · ~27% off
  enterprise: { month: 39, year: 299 }, // $299/yr · $169 off vs monthly · ~36% off
};

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


export function PricingClient({ signedIn, currentTier, bullets }: {
  signedIn: boolean;
  currentTier: string;
  bullets: PlanBullets;
}) {
  const [period, setPeriod] = useState<Period>('month');
  const [cancelling, setCancelling] = useState(false);

  async function downgrade() {
    if (cancelling) return;
    const confirmed = window.confirm(
      'Downgrade to Free? Your paid subscription will be cancelled immediately, your active routes above the free route cap will be paused, and paid-only alert channels (SMS, Telegram) will stop. You can re-subscribe any time.'
    );
    if (!confirmed) return;
    setCancelling(true);
    const res = await fetch('/api/billing/cancel', { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setCancelling(false);
    if (j.ok) {
      window.location.href = '/settings?billing=cancelled';
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
        <div className="inline-flex rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-sm">
          <button
            onClick={() => setPeriod('month')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-full transition ${
              period === 'month' ? 'bg-brand text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setPeriod('year')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-full transition ${
              period === 'year' ? 'bg-brand text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Yearly <span className={`ml-1 text-[10px] uppercase tracking-wide ${period === 'year' ? 'text-white/80' : 'text-emerald-600'}`}>save up to 36%</span>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* FREE */}
        <div className="card flex flex-col">
          <div className="eyebrow">Free</div>
          <h3 className="font-display font-bold text-2xl mt-1">$0</h3>
          <p className="text-xs text-slate-500">forever — email alerts only</p>
          <ul className="text-sm space-y-1 mt-4 mb-6 flex-1">
            {bullets.free.map(f => <Bullet key={f.text} f={f} />)}
          </ul>
          {!signedIn ? (
            <a href="/early-access" className="btn btn-primary w-full text-center">Get early access →</a>
          ) : currentTier === 'free' ? (
            <button className="btn w-full" disabled>Your current plan</button>
          ) : (
            <button type="button" className="btn btn-danger w-full" disabled={cancelling} onClick={downgrade}>
              {cancelling ? 'Cancelling…' : 'Downgrade to Free now'}
            </button>
          )}
        </div>

        {/* PRO */}
        {(['pro'] as Plan[]).map(plan => {
          const lbl = pricingLabel(plan);
          const isCurrent = currentTier === plan;
          return (
            <div key={plan} className="card flex flex-col relative overflow-hidden border-brand-700">
              <div className="absolute top-3 right-3 text-[10px] uppercase tracking-wide font-bold bg-[var(--nc-teal)] text-[var(--nc-dark)] px-2 py-0.5 rounded-full">Most popular</div>
              <div className="eyebrow text-brand-700">Pro</div>
              <h3 className="font-display font-bold text-2xl mt-1">{lbl.headline}</h3>
              <p className="text-xs text-slate-500">{lbl.sub}</p>
              <ul className="text-sm space-y-1 mt-4 mb-6 flex-1">
                {bullets[plan].map(f => <Bullet key={f.text} f={f} />)}
              </ul>
              {!signedIn ? (
                <a href="/early-access" className="btn btn-primary w-full text-center">Get early access →</a>
              ) : isCurrent ? (
                <button className="btn w-full" disabled>Your current plan</button>
              ) : (
                <div className="space-y-2">
                  <a href={checkoutHref('stripe', plan)} className="btn btn-primary w-full text-center">
                    Subscribe with card →
                  </a>
                  <a href={checkoutHref('paypal', plan)} className="btn w-full text-center" style={{ background: '#ffc439', color: '#0a3a6b', borderColor: '#ffc439' }}>
                    Subscribe with PayPal
                  </a>
                </div>
              )}
            </div>
          );
        })}

        {/* Payment methods strip spans full width below the grid — see after grid close */}
        {/* ENTERPRISE */}
        {(['enterprise'] as Plan[]).map(plan => {
          const lbl = pricingLabel(plan);
          const isCurrent = currentTier === plan;
          return (
            <div key={plan} className="card flex flex-col">
              <div className="eyebrow">Enterprise</div>
              <h3 className="font-display font-bold text-2xl mt-1">{lbl.headline}</h3>
              <p className="text-xs text-slate-500">{lbl.sub}</p>
              <p className="text-[11px] text-slate-500 font-medium mt-1">Billed immediately · no trial</p>
              <ul className="text-sm space-y-1 mt-4 mb-6 flex-1">
                {bullets[plan].map(f => <Bullet key={f.text} f={f} />)}
              </ul>
              {!signedIn ? (
                <a href="/early-access" className="btn btn-primary w-full text-center">Get early access →</a>
              ) : isCurrent ? (
                <button className="btn w-full" disabled>Your current plan</button>
              ) : (
                <div className="space-y-2">
                  <a href={checkoutHref('stripe', plan)} className="btn btn-primary w-full text-center">
                    Subscribe with card →
                  </a>
                  <a href={checkoutHref('paypal', plan)} className="btn w-full text-center" style={{ background: '#ffc439', color: '#0a3a6b', borderColor: '#ffc439' }}>
                    Subscribe with PayPal
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Accepted payment methods */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-xs text-slate-500">
        <span className="uppercase tracking-wider text-[10px] font-semibold text-slate-400">We accept</span>
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
        <span className="text-slate-400">· Secure checkout · Cancel anytime</span>
      </div>
    </div>
  );
}

/** A bullet that states what a plan does NOT include rather than omitting it. */
function Bullet({ f }: { f: PlanFeature }) {
  return f.included
    ? <li>✓ {f.text}</li>
    : <li className="text-slate-400">— {f.text}</li>;
}

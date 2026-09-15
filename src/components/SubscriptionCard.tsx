import { queries } from '@/lib/db';
import { fmtRelative } from '@/lib/utils';
import Link from 'next/link';

/**
 * Settings-page subscription summary. Reads server-side so we get a precise
 * snapshot of the user's current tier + provider without an extra client
 * round-trip.
 */
export function SubscriptionCard({ userId }: { userId: number }) {
  const u = queries.getUserById(userId);
  if (!u) return null;
  const tier = u.tier;
  const status = u.subscription_status;
  const provider = (u as any).subscription_provider as 'stripe' | 'paypal' | null;
  const period = (u as any).subscription_period as 'month' | 'year' | null;
  const renews = u.subscription_renews_at;
  const trial = (u as any).trial_ends_at as string | null;

  const tierBadge = tier === 'enterprise'
    ? <span className="badge badge-gold">Enterprise</span>
    : tier === 'pro'
      ? <span className="badge badge-info">Pro</span>
      : <span className="badge badge-muted">Free</span>;

  const isPaid = tier === 'pro' || tier === 'enterprise';

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow">Subscription</div>
          <h2 className="!mb-0">Your plan</h2>
        </div>
        {tierBadge}
      </div>

      <div className="grid md:grid-cols-2 gap-3 mt-3">
        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Current tier</div>
          <div className="font-display font-bold text-base mt-0.5 capitalize">{tier}</div>
          {status && <div className="text-[11px] text-slate-500 mt-0.5">Status: <span className="font-mono">{status}</span></div>}
        </div>
        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Billing</div>
          <div className="font-display font-bold text-base mt-0.5">
            {provider ? `${provider === 'paypal' ? 'PayPal' : 'Card (Stripe)'} · ${period ?? 'monthly'}` : '—'}
          </div>
          {status === 'founding_free' && trial && new Date(trial) > new Date() && (
            <div className="text-[11px] text-emerald-600 mt-0.5">Founding period — basic capabilities free, ends {fmtRelative(trial)}</div>
          )}
          {status === 'upgrade_due' && (
            <div className="text-[11px] text-amber-600 mt-0.5">Your first 3 months are complete — upgrade to Pro or Enterprise for more.</div>
          )}
          {trial && new Date(trial) > new Date() && status !== 'founding_free' && (
            <div className="text-[11px] text-emerald-600 mt-0.5">Trial ends {fmtRelative(trial)}</div>
          )}
          {renews && (
            <div className="text-[11px] text-slate-500 mt-0.5">
              {status === 'canceled' ? 'Access until' : 'Renews'} {fmtRelative(renews)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!isPaid && (
          <Link href="/pricing" className="btn btn-primary btn-sm">
            {status === 'upgrade_due' ? 'Upgrade to Pro or Enterprise →' : 'Upgrade your plan →'}
          </Link>
        )}
        {isPaid && provider === 'stripe' && (
          <a href="/api/billing/portal" className="btn btn-sm">
            Manage card &amp; invoices in Stripe ↗
          </a>
        )}
        {isPaid && provider === 'paypal' && (
          <a
            href="https://www.paypal.com/myaccount/autopay/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm"
          >
            Manage subscription in PayPal ↗
          </a>
        )}
        <Link href="/pricing" className="btn btn-sm">
          {isPaid ? 'Change plan' : 'See plans'}
        </Link>
      </div>
    </div>
  );
}

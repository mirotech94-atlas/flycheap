import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { PricingClient } from '@/components/PricingClient';
import { deliverableChannels } from '@/lib/channelHealth';
import { planFeatures, tierChannels, channelSentence, POLLING_PROMISE, plural } from '@/lib/tierCopy';
import { TIER_LIMITS } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pricing — FlyCheap',
  description: 'A 3-month free trial for every new account, then Free, Pro ($9/mo), or Enterprise ($39/mo). Pay with card (Stripe) or PayPal.',
};

export default async function PricingPage() {
  const user = await getCurrentUser().catch(() => null);

  // What we can actually send on right now, measured — not what a tier permits.
  const deliverable = deliverableChannels();
  const bullets = {
    free: planFeatures('free', deliverable),
    pro: planFeatures('pro', deliverable),
    enterprise: planFeatures('enterprise', deliverable),
  };
  const TIERS = ['free', 'pro', 'enterprise'] as const;
  const historyLabel = (d: number) =>
    d >= 3650 ? 'Complete' : d >= 365 ? `${Math.round(d / 365)} year${d >= 730 ? 's' : ''}` : plural(d, 'day');

  return (
    <div className="space-y-8">
      <div>
        <div className="eyebrow mb-1">Subscription</div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Plans &amp; pricing</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Every new account gets a <strong>3-month free trial of everything</strong> — all Pro and Enterprise features, no card. Love it? Email or call and we&rsquo;ll continue together; otherwise it rolls to Free.
          {user ? null : (
            <> You&rsquo;ll need to <Link href="/login?next=/pricing" className="underline text-brand">log in</Link> before checking out.</>
          )}
        </p>
      </div>

      <PricingClient signedIn={Boolean(user)} currentTier={user?.tier ?? 'free'} bullets={bullets} />

      <div className="card">
        <div className="eyebrow">Comparison</div>
        <h2 className="!mb-2 mt-1">What you get at each tier</h2>
        <div className="overflow-x-auto">
          {/* Every cell is derived from TIER_LIMITS. The hand-typed version of
              this table had a "Poll interval" row (4 hours / 30 min / 15 min),
              which is the promise that stops the poll allocator from deciding
              cadence on merit, and a channels row listing Slack, WhatsApp and
              Instagram DM — none of which can deliver a customer alert. */}
          <table className="fmt text-sm">
            <thead>
              <tr><th>Feature</th>{TIERS.map(t => <th key={t} className="capitalize">{t}</th>)}</tr>
            </thead>
            <tbody>
              <tr>
                <td>Tracked routes</td>
                {TIERS.map(t => (
                  <td key={t}>
                    {TIER_LIMITS[t].maxRoutes >= 9999
                      ? 'Unlimited'
                      : TIER_LIMITS[t].maxRoutes.toLocaleString('en-US')}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Alert channels</td>
                {TIERS.map(t => (
                  <td key={t}>{channelSentence(tierChannels(t, deliverable))}</td>
                ))}
              </tr>
              <tr>
                <td>Flexible &quot;any dates&quot; tracking</td>
                {TIERS.map(t => <td key={t}>{TIER_LIMITS[t].anyDates ? '\u2705' : '\u2014'}</td>)}
              </tr>
              <tr>
                <td>Price history depth</td>
                {TIERS.map(t => <td key={t}>{historyLabel(TIER_LIMITS[t].historyDays)}</td>)}
              </tr>
              <tr>
                <td>Price-drop alerts (&quot;unusually cheap&quot;, not just under target)</td>
                {TIERS.map(t => <td key={t}>{TIER_LIMITS[t].priceDropAlerts ? '\u2705' : '\u2014'}</td>)}
              </tr>
              <tr>
                <td>Household sharing</td>
                {TIERS.map(t => <td key={t}>{TIER_LIMITS[t].familyShare ? '\u2705' : '\u2014'}</td>)}
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500 mt-3">
          <strong>How often we check is not a plan feature.</strong> {POLLING_PROMISE}
        </p>

        {/* These used to sit in the table with a checkmark against Pro and a
            dash against Free. Nothing in the code actually withholds them, so
            the dash was not true. They are listed as included rather than
            quietly dropped. */}
        <p className="text-xs text-slate-500 mt-2">
          <strong>On every plan, including Free:</strong> the Mistake-Fare Radar,
          route intelligence, the fare calendar, your board and its verdicts, and
          the monthly retrospective.
        </p>
      </div>

      <div className="card">
        <div className="eyebrow">Billing</div>
        <h2 className="!mb-2 mt-1">How payment works</h2>
        <ul className="text-sm text-slate-600 dark:text-slate-300 list-disc pl-5 space-y-1">
          <li><strong>Card payments</strong> (Visa, Mastercard, Amex, etc.) are processed through Stripe Checkout — Apple Pay and Google Pay are auto-detected on supported devices.</li>
          <li><strong>PayPal</strong> charges through your PayPal balance, linked bank, or any card attached to your PayPal account.</li>
          <li>Card data <em>never touches our servers</em> — Stripe and PayPal are both PCI Level 1 certified.</li>
          <li>Cancel any time — click <strong>Downgrade to Free now</strong> on this page or use Settings → Subscription. Cancellation is immediate; you can re-subscribe at any time.</li>
        </ul>
      </div>
    </div>
  );
}

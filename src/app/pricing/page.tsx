import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { PricingClient } from '@/components/PricingClient';
import { isPaypalConfigured } from '@/lib/paypal';
import { deliverableChannels } from '@/lib/channelHealth';
import { planFeatures, tierChannels, channelSentence, POLLING_PROMISE, plural } from '@/lib/tierCopy';
import { TIER_LIMITS } from '@/lib/db';
import { PRICES } from '@/lib/prices';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pricing — FlyCheap',
  description: `A 3-month free trial for every new account, then Free, Pro ($${PRICES.pro.month}/mo), or Enterprise ($${PRICES.enterprise.month}/mo). Pay with card (Stripe) or PayPal.`,
};

export default async function PricingPage() {
  const user = await getCurrentUser().catch(() => null);

  // What we can actually send on right now, measured — not what a tier permits.
  const deliverable = deliverableChannels();
  const paypal = isPaypalConfigured();
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
        <div className="ed-eyebrow" style={{ marginBottom: 6 }}>Subscription</div>
        <h1 className="ed-h1" style={{ margin: '0 0 10px' }}>Plans &amp; pricing</h1>
        <p className="ed-sub" style={{ maxWidth: '52ch' }}>
          Every new account gets a <strong>3-month free trial of everything</strong> — all Pro and Enterprise features, no card. Love it? Email or call and we&rsquo;ll continue together; otherwise it rolls to Free.
          {user ? null : (
            <> You&rsquo;ll need to <Link href="/login?next=/pricing" className="underline" style={{ color: 'var(--accent)' }}>log in</Link> before checking out.</>
          )}
        </p>
      </div>

      {/* Offer PayPal only when it can actually take a payment. Its secret and
          billing-plan ids are unset in production, so the button was visible,
          clickable, and dead-ended on ?billing=paypal-not-configured — the
          worst moment to disappoint someone is the one where they are trying
          to pay. Same isConfigured-≠-enabled rule the alert channels follow. */}
      <PricingClient
        signedIn={Boolean(user)}
        currentTier={user?.tier ?? 'free'}
        bullets={bullets}
        paypalEnabled={paypal}
      />

      <div className="ed-panel">
        <div className="ed-eyebrow">Comparison</div>
        <h2 className="ed-h2" style={{ marginTop: 4 }}>What you get at each tier</h2>
        <div className="overflow-x-auto" style={{ marginTop: 18 }}>
          {/* Every cell is derived from TIER_LIMITS. The hand-typed version of
              this table had a "Poll interval" row (4 hours / 30 min / 15 min),
              which is the promise that stops the poll allocator from deciding
              cadence on merit, and a channels row listing Slack, WhatsApp and
              Instagram DM — none of which can deliver a customer alert. */}
          <table className="ed-table">
            <thead>
              <tr><th>Feature</th>{TIERS.map(t => <th key={t}>{t}</th>)}</tr>
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
                {TIERS.map(t => <td key={t}>{TIER_LIMITS[t].anyDates ? '✅' : '—'}</td>)}
              </tr>
              <tr>
                <td>Price history depth</td>
                {TIERS.map(t => <td key={t}>{historyLabel(TIER_LIMITS[t].historyDays)}</td>)}
              </tr>
              <tr>
                <td>Price-drop alerts (&quot;unusually cheap&quot;, not just under target)</td>
                {TIERS.map(t => <td key={t}>{TIER_LIMITS[t].priceDropAlerts ? '✅' : '—'}</td>)}
              </tr>
              <tr>
                <td>Household sharing</td>
                {TIERS.map(t => <td key={t}>{TIER_LIMITS[t].familyShare ? '✅' : '—'}</td>)}
              </tr>
            </tbody>
          </table>
        </div>

        <p className="ed-panel-note" style={{ marginTop: 14 }}>
          <strong>How often we check is not a plan feature.</strong> {POLLING_PROMISE}
        </p>

        {/* These used to sit in the table with a checkmark against Pro and a
            dash against Free. Nothing in the code actually withholds them, so
            the dash was not true. They are listed as included rather than
            quietly dropped. Two former entries are gone for the opposite
            reason: the "Mistake-Fare Radar" has no emitter (nothing writes a
            mistake-fare alert), and the "monthly retrospective" is an
            owner-only API with no customer trigger or schedule. */}
        <p className="ed-panel-note" style={{ marginTop: 8 }}>
          <strong>On every plan, including Free:</strong> route intelligence, the
          fare calendar, your board and its verdicts, and the daily or weekly
          digest email.
        </p>
      </div>

      <div className="ed-panel">
        <div className="ed-eyebrow">Billing</div>
        <h2 className="ed-h2" style={{ marginTop: 4 }}>How payment works</h2>
        <ul className="ed-panel-note list-disc pl-5 space-y-1" style={{ fontSize: 13, marginTop: 14 }}>
          <li><strong>Card payments</strong> (Visa, Mastercard, Amex, etc.) are processed through Stripe Checkout — Apple Pay and Google Pay are auto-detected on supported devices.</li>
          {paypal && <li><strong>PayPal</strong> charges through your PayPal balance, linked bank, or any card attached to your PayPal account.</li>}
          <li>Card data <em>never touches our servers</em> — {paypal ? 'Stripe and PayPal are both' : 'Stripe is'} PCI Level 1 certified.</li>
          <li>Cancel any time — click <strong>Downgrade to Free now</strong> on this page. Cancellation is immediate; you can re-subscribe at any time.</li>
        </ul>
      </div>
    </div>
  );
}

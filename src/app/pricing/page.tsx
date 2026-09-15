import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { PricingClient } from '@/components/PricingClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pricing — FlyCheap',
  description: 'A 3-month free trial for every new account, then Free, Pro ($9/mo), or Enterprise ($39/mo). Pay with card (Stripe) or PayPal.',
};

export default async function PricingPage() {
  const user = await getCurrentUser().catch(() => null);
  return (
    <div className="space-y-8">
      <div>
        <div className="eyebrow mb-1">Subscription</div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Plans &amp; pricing</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Every new account gets a <strong>3-month free trial</strong> of the basics, no card. Pro and Enterprise are plain monthly subscriptions — cancel anytime.
          {user ? null : (
            <> You&rsquo;ll need to <Link href="/login?next=/pricing" className="underline text-brand">sign in</Link> before checking out.</>
          )}
        </p>
      </div>

      <PricingClient signedIn={Boolean(user)} currentTier={user?.tier ?? 'free'} />

      <div className="card">
        <div className="eyebrow">Comparison</div>
        <h2 className="!mb-2 mt-1">What you get at each tier</h2>
        <div className="overflow-x-auto">
          <table className="fmt text-sm">
            <thead>
              <tr><th>Feature</th><th>Free</th><th>Pro</th><th>Enterprise</th></tr>
            </thead>
            <tbody>
              <tr><td>Tracked routes</td><td>5</td><td>100</td><td>Unlimited</td></tr>
              <tr><td>Poll interval</td><td>4 hours</td><td>30 min</td><td>15 min · priority</td></tr>
              <tr><td>Flexible &quot;any dates&quot; tracking</td><td>—</td><td>✅</td><td>✅</td></tr>
              <tr><td>Price history depth</td><td>7 days</td><td>Full history</td><td>Full history</td></tr>
              <tr><td>Price-drop anomaly alerts (&quot;unusually cheap&quot;)</td><td>—</td><td>✅</td><td>✅</td></tr>
              <tr><td>Household sharing</td><td>—</td><td>✅</td><td>✅</td></tr>
              <tr><td>Email alerts</td><td>✅</td><td>✅</td><td>✅</td></tr>
              <tr><td>Slack / Telegram / WhatsApp / Instagram DM / SMS</td><td>—</td><td>✅</td><td>✅</td></tr>
              <tr><td>Mistake-Fare Radar</td><td>✅</td><td>✅</td><td>✅</td></tr>
              <tr><td>Per-user AI Route Intelligence</td><td>—</td><td>✅</td><td>✅</td></tr>
              <tr><td>Monthly / 6-month / annual retrospectives</td><td>—</td><td>✅</td><td>✅</td></tr>
              <tr><td>API access</td><td>—</td><td>—</td><td>✅</td></tr>
              <tr><td>Custom domain</td><td>—</td><td>—</td><td>✅</td></tr>
              <tr><td>White-label branding</td><td>—</td><td>—</td><td>✅</td></tr>
            </tbody>
          </table>
        </div>
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

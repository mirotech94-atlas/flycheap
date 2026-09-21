import Link from 'next/link';
import type { Metadata } from 'next';
import { APP_VERSION_SHORT } from '@/lib/version';
import { PublicTopbar, PublicFooter } from '@/components/PublicChrome';

export const metadata: Metadata = {
  title: 'Checkout — FlyCheap',
  description: 'Review your FlyCheap plan before secure checkout.',
};

const PLANS = {
  pro: {
    name: 'Pro', price: 9,
    pitch: 'For the frequent traveler — speed and reach.',
    features: ['Up to 100 tracked routes', 'Checked most often when it matters', 'SMS and Telegram alerts', 'Buy/wait predictions + confidence', 'Mistake-fare radar'],
    href: '/api/billing/checkout?plan=pro',
  },
  enterprise: {
    name: 'Enterprise', price: 39,
    pitch: 'For agencies, family offices, and travel desks.',
    features: ['Unlimited routes', 'White-label branding + custom domain', 'REST API (/api/v1)', 'Everything in Pro', 'Audit log'],
    href: '/api/billing/checkout?plan=enterprise',
  },
} as const;

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: rawPlan } = await searchParams;
  const key: keyof typeof PLANS = rawPlan === 'pro' ? 'pro' : 'enterprise';
  const plan = PLANS[key];

  return (
    <div className="mk mk-bleed">
      <PublicTopbar right={<Link href="/pricing" className="ed-btn ed-btn-secondary">← Back to pricing</Link>} />

      <section className="mk-section">
        <div className="mk-wrap" style={{ maxWidth: 760 }}>
          <div className="ed-eyebrow">Checkout · {plan.name} plan</div>
          <h1 className="ed-h1">
            Review, then <em>pay securely</em>.
          </h1>
          <p className="ed-sub" style={{ maxWidth: 600 }}>
            {plan.pitch} You&rsquo;ll confirm payment on Stripe&rsquo;s secure page — card details never touch our servers.
          </p>

          <div className="ed-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="ed-stat"><div className="ed-stat-label">Plan</div><div className="ed-stat-value" style={{ fontSize: 20 }}>{plan.name}</div></div>
            <div className="ed-stat"><div className="ed-stat-label">Billed monthly</div><div className="ed-stat-value" style={{ fontSize: 20 }}>${plan.price}.00 / month</div></div>
            <div className="ed-stat"><div className="ed-stat-label">Commitment</div><div className="ed-stat-value" style={{ fontSize: 20 }}>None · cancel anytime</div></div>
          </div>

          <div className="ed-panel" style={{ marginTop: 22 }}>
            <ul className="ed-plan-list" style={{ marginBottom: 18 }}>
              {plan.features.map(f => <li key={f}>✓ {f}</li>)}
            </ul>
            <a href={plan.href} className="ed-btn ed-btn-primary">Continue to secure payment — ${plan.price}/mo →</a>
            <p className="ed-panel-note" style={{ marginTop: 14 }}>
              Secure checkout by Stripe · Cancel anytime from Settings · By continuing you agree to the <Link href="/terms">Terms</Link>
            </p>
          </div>

          {key === 'enterprise' && (
            <p className="ed-sub" style={{ marginTop: 22, marginBottom: 0 }}>
              Need white-label setup, a custom domain, or invoicing instead of card billing?{' '}
              <a href="mailto:sales@flycheap.live" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Talk to sales</a> — we&rsquo;ll set it up with you.
            </p>
          )}
        </div>
      </section>

      <PublicFooter
        left={<>© 2026 FlyCheap · All rights reserved</>}
        right={<>{APP_VERSION_SHORT} · NYC</>}
      />
    </div>
  );
}

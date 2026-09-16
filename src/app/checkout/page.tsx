import { LogoMark } from '@/components/Logo';
import Link from 'next/link';
import type { Metadata } from 'next';
import { APP_VERSION_SHORT } from '@/lib/version';

export const metadata: Metadata = {
  title: 'Checkout — FlyCheap',
  description: 'Review your FlyCheap plan before secure checkout.',
};

const PLANS = {
  pro: {
    name: 'Pro', price: 9,
    pitch: 'For the frequent traveler — speed and reach.',
    features: ['Up to 100 tracked routes', 'Priority 5-minute polling', 'SMS / WhatsApp / Telegram alerts', 'Buy/wait predictions + confidence', 'Mistake-fare radar'],
    href: '/api/billing/checkout?plan=pro',
  },
  enterprise: {
    name: 'Enterprise', price: 39,
    pitch: 'For agencies, family offices, and travel desks.',
    features: ['Unlimited routes · 1-minute polling', 'White-label branding + custom domain', 'REST API (/api/v1)', 'Slack channel alerts', 'Audit log'],
    href: '/api/billing/checkout?plan=enterprise',
  },
} as const;

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: rawPlan } = await searchParams;
  const key: keyof typeof PLANS = rawPlan === 'pro' ? 'pro' : 'enterprise';
  const plan = PLANS[key];

  return (
    <div className="fc-landing -mx-6 -my-8 -mb-24 md:-mb-8" data-fc-theme="ivory" data-fc-accent="gold">
      <header className="fc-l-topbar">
        <Link href="/welcome" className="fc-l-brand">
          <div className="fc-l-brand-mark">
            <LogoMark size={22} />
          </div>
          <div>
            <div className="fc-l-brand-name">FlyCheap</div>
            <div className="fc-l-brand-meta">Fare Intelligence Platform</div>
          </div>
        </Link>
        <div className="fc-l-topbar-right">
          <Link href="/welcome#pricing" className="fc-btn fc-btn-light fc-btn-sm">← Back to pricing</Link>
        </div>
      </header>

      <section className="fc-section" style={{ marginTop: 48, maxWidth: 760, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="fc-smallcaps">Checkout · {plan.name} plan</div>
        <h1 className="fc-section-title" style={{ marginTop: 10 }}>
          Review, then <em>pay securely</em>.
        </h1>
        <p className="fc-section-sub" style={{ maxWidth: 600 }}>
          {plan.pitch} You&rsquo;ll confirm payment on Stripe&rsquo;s secure page — card details never touch our servers.
        </p>

        <div className="fc-trial-summary" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div><span className="k">Plan</span><span className="v">{plan.name}</span></div>
          <div><span className="k">Billed monthly</span><span className="v">${plan.price}.00 / month</span></div>
          <div><span className="k">Commitment</span><span className="v">None · cancel anytime</span></div>
        </div>

        <div className="fc-trial-gate" style={{ marginTop: 22 }}>
          <ul className="fc-l-tier-list" style={{ marginBottom: 18 }}>
            {plan.features.map(f => (
              <li key={f}><span className="check">✓</span><span>{f}</span></li>
            ))}
          </ul>
          <a href={plan.href} className="fc-btn fc-btn-gold fc-trial-cta">Continue to secure payment — ${plan.price}/mo →</a>
          <div className="fc-trial-note">
            Secure checkout by Stripe · Cancel anytime from Settings · By continuing you agree to the <Link href="/terms">Terms</Link>
          </div>
        </div>

        {key === 'enterprise' && (
          <p className="fc-section-sub" style={{ marginTop: 22 }}>
            Need white-label setup, a custom domain, or invoicing instead of card billing?{' '}
            <a href="mailto:sales@flycheap.18dn.com" style={{ color: 'var(--fc-navy)', textDecoration: 'underline' }}>Talk to sales</a> — we&rsquo;ll set it up with you.
          </p>
        )}
      </section>

      <footer className="fc-l-footer" style={{ marginTop: 64 }}>
        <div className="fc-l-footer-legal" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div>© 2026 FlyCheap · All rights reserved</div>
          <div>{APP_VERSION_SHORT} · NYC</div>
        </div>
      </footer>
    </div>
  );
}

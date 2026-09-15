import Link from 'next/link';
import type { Metadata } from 'next';
import { AgreeGate } from './AgreeGate';

export const metadata: Metadata = {
  title: 'Pro Trial Terms — FlyCheap Tracker',
  description: 'Terms and conditions of the FlyCheap Pro 14-day free trial: $0 today, $9/month after the trial, cancel anytime.',
};

const TERMS: Array<{ h: string; body: React.ReactNode }> = [
  {
    h: '1 · What the trial includes',
    body: <>Every FlyCheap Pro feature, unrestricted, for 14 calendar days from the moment checkout completes: unlimited tracked routes, priority 5-minute polling, buy/wait predictions with confidence scores, the mistake-fare radar, and SMS / WhatsApp / Telegram alert channels.</>,
  },
  {
    h: '2 · Payment method & today’s charge',
    body: <>A valid payment card is collected at checkout by <strong>Stripe</strong>, our payment processor. <strong>You are charged $0.00 today.</strong> Card details never touch FlyCheap servers.</>,
  },
  {
    h: '3 · When billing starts',
    body: <>If you have not canceled by the end of day 14, your subscription converts automatically and your card is charged <strong>$9.00 USD per month</strong>, billed monthly in advance, starting on day 15. We email you a reminder <strong>3 days before</strong> the trial ends.</>,
  },
  {
    h: '4 · Canceling during the trial',
    body: <>Cancel anytime from <em>Settings → Billing → Manage subscription</em> — one click into the Stripe customer portal, no emails or calls required. Cancel before day 14 ends and you pay nothing, ever. Pro features remain active until the trial’s last day.</>,
  },
  {
    h: '5 · Canceling after the trial',
    body: <>After billing begins you can still cancel at any time; your Pro access continues to the end of the paid month, then your account drops to the Free tier. Tracked routes, fare history, and settings are preserved — nothing is deleted.</>,
  },
  {
    h: '6 · One trial per customer',
    body: <>The 14-day trial is available once per person and payment method. Signing up for repeat trials with new accounts is not permitted, and we may convert such subscriptions to paid immediately.</>,
  },
  {
    h: '7 · Refunds',
    body: <>Monthly charges are non-refundable once billed, which is exactly why we remind you before the trial converts and make cancellation self-serve. If you believe you were billed in error, email <a href="mailto:sales@flycheap.18dn.com">sales@flycheap.18dn.com</a> within 7 days and we will make it right.</>,
  },
  {
    h: '8 · The boring-but-important part',
    body: <>Fare data is informational, not an offer to sell travel; bookings complete on the airline or OTA site at their price. We may update these terms with notice on this page; the version in effect when you start your trial governs that trial. Our <Link href="/privacy">Privacy Policy</Link> applies to all data we hold.</>,
  },
];

export default function TrialTermsPage() {
  return (
    <div className="fc-landing -mx-6 -my-8 -mb-24 md:-mb-8" data-fc-theme="ivory" data-fc-accent="gold">
      <header className="fc-l-topbar">
        <Link href="/welcome" className="fc-l-brand">
          <div className="fc-l-brand-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M5 5 L5 19 M5 5 L14 5 M5 12 L11 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M22 8 A6 6 0 0 0 16 8 A6 6 0 0 0 22 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          <div>
            <div className="fc-l-brand-name">FlyCheap <em>Tracker</em></div>
            <div className="fc-l-brand-meta">Fare Intelligence Platform</div>
          </div>
        </Link>
        <div className="fc-l-topbar-right">
          <Link href="/welcome#pricing" className="fc-btn fc-btn-light fc-btn-sm">← Back to pricing</Link>
        </div>
      </header>

      <section className="fc-section" style={{ marginTop: 48, maxWidth: 860, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="fc-smallcaps">Pro plan · 14-day free trial</div>
        <h1 className="fc-section-title" style={{ marginTop: 10 }}>
          Trial terms, in <em>plain English</em>.
        </h1>
        <p className="fc-section-sub" style={{ maxWidth: 640 }}>
          Two minutes of reading before checkout. The short version: <strong>$0 today</strong>,
          full Pro access for 14 days, then <strong>$9/month</strong> unless you cancel —
          and canceling is one click, no questions asked.
        </p>

        <div className="fc-trial-summary">
          <div><span className="k">Today</span><span className="v">$0.00</span></div>
          <div><span className="k">Days 1–14</span><span className="v">Full Pro, free</span></div>
          <div><span className="k">Day 12</span><span className="v">Reminder email</span></div>
          <div><span className="k">Day 15 onward</span><span className="v">$9.00 / month</span></div>
        </div>

        <div className="fc-trial-terms">
          {TERMS.map(t => (
            <div className="fc-trial-term" key={t.h}>
              <h3>{t.h}</h3>
              <p>{t.body}</p>
            </div>
          ))}
        </div>

        <AgreeGate checkoutHref="/api/billing/checkout?plan=pro&trial=14" />
      </section>

      <footer className="fc-l-footer" style={{ marginTop: 64 }}>
        <div className="fc-l-footer-legal" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div>© 2026 FlyCheap Tracker · All rights reserved</div>
          <div><Link href="/privacy" style={{ color: 'inherit' }}>Privacy</Link> · v2.4 · NYC</div>
        </div>
      </footer>
    </div>
  );
}

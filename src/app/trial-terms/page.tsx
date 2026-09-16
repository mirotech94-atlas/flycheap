import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free Trial Terms — FlyCheap',
  description: 'Terms and conditions of the FlyCheap 3-month free trial: every new account gets 3 months of the full product — all Pro and Enterprise features — free, no card.',
};

const TERMS: Array<{ h: string; body: React.ReactNode }> = [
  {
    h: '1 · What the trial includes',
    body: <>Every new FlyCheap account starts with a <strong>3-month free trial of the entire product</strong> — every Free, Pro <em>and</em> Enterprise capability: unlimited tracked routes, priority polling, all alert channels (email, SMS, WhatsApp, Telegram), buy-vs-wait predictions, mistake-fare radar, family sharing, full price history, and the worldwide explore map. Nothing is held back.</>,
  },
  {
    h: '2 · No card, ever',
    body: <>The trial starts automatically when you sign up. <strong>No payment card is collected</strong> and you are never charged during, or at the end of, the trial.</>,
  },
  {
    h: '3 · What happens after 3 months',
    body: <>Near the end of your 3 months, if you love it, just <strong>reach out by email or phone</strong> and we&rsquo;ll sort out continuing together — there is no automatic charge and no card on file. If we don&rsquo;t hear from you, your account simply continues on the <strong>Free</strong> plan; nothing is paused, deleted, or billed.</>,
  },
  {
    h: '4 · One trial per person',
    body: <>The free trial is available once per person. Signing up for repeat trials with new accounts is not permitted.</>,
  },
  {
    h: '5 · Your data is kept',
    body: <>Whether or not you upgrade, your tracked routes, fare history, and settings are preserved when the trial ends. You can delete your account and all of its data at any time from Settings → Danger Zone.</>,
  },
  {
    h: '6 · The boring-but-important part',
    body: <>Fare data is informational, not an offer to sell travel; bookings complete on the airline or OTA site at their price. We may update these terms with notice on this page. Our <Link href="/privacy">Privacy Policy</Link> applies to all data we hold.</>,
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
            <div className="fc-l-brand-name">FlyCheap</div>
            <div className="fc-l-brand-meta">Fare Intelligence Platform</div>
          </div>
        </Link>
        <div className="fc-l-topbar-right">
          <Link href="/welcome#pricing" className="fc-btn fc-btn-light fc-btn-sm">← Back to pricing</Link>
        </div>
      </header>

      <section className="fc-section" style={{ marginTop: 48, maxWidth: 860, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="fc-smallcaps">3-month free trial</div>
        <h1 className="fc-section-title" style={{ marginTop: 10 }}>
          Trial terms, in <em>plain English</em>.
        </h1>
        <p className="fc-section-sub" style={{ maxWidth: 640 }}>
          The short version: <strong>every new account gets 3 months of the full product free</strong> —
          all Pro and Enterprise features, no card. Love it? Email or call and we&rsquo;ll continue together.
          Otherwise it just rolls to the Free plan.
        </p>

        <div className="fc-trial-summary">
          <div><span className="k">Today</span><span className="v">$0.00</span></div>
          <div><span className="k">Months 1–3</span><span className="v">Everything, free</span></div>
          <div><span className="k">Card required</span><span className="v">None, ever</span></div>
          <div><span className="k">After 3 months</span><span className="v">Contact us, or roll to Free</span></div>
        </div>

        <div className="fc-trial-terms">
          {TERMS.map(t => (
            <div className="fc-trial-term" key={t.h}>
              <h3>{t.h}</h3>
              <p>{t.body}</p>
            </div>
          ))}
        </div>

        <div className="fc-trial-gate" style={{ marginTop: 22 }}>
          <Link href="/login" className="fc-btn fc-btn-gold fc-trial-cta">Start free trial →</Link>
        </div>
      </section>

      <footer className="fc-l-footer" style={{ marginTop: 64 }}>
        <div className="fc-l-footer-legal" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div>© 2026 FlyCheap · All rights reserved</div>
          <div><Link href="/privacy" style={{ color: 'inherit' }}>Privacy</Link> · v2.4 · NYC</div>
        </div>
      </footer>
    </div>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { PublicTopbar, PublicFooter } from '@/components/PublicChrome';

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
    <div className="mk mk-bleed">
      <PublicTopbar right={<Link href="/pricing" className="ed-btn ed-btn-secondary">← Back to pricing</Link>} />

      <section className="mk-section">
        <div className="mk-wrap" style={{ maxWidth: 860 }}>
          <div className="ed-eyebrow">3-month free trial</div>
          <h1 className="ed-h1">
            Trial terms, in <em>plain English</em>.
          </h1>
          <p className="ed-sub" style={{ maxWidth: 640 }}>
            The short version: <strong>every new account gets 3 months of the full product free</strong> —
            all Pro and Enterprise features, no card. Love it? Email or call and we&rsquo;ll continue together.
            Otherwise it just rolls to the Free plan.
          </p>

          <div className="ed-stats">
            <div className="ed-stat"><div className="ed-stat-label">Today</div><div className="ed-stat-value" style={{ fontSize: 20 }}>$0.00</div></div>
            <div className="ed-stat"><div className="ed-stat-label">Months 1–3</div><div className="ed-stat-value" style={{ fontSize: 20 }}>Everything, free</div></div>
            <div className="ed-stat"><div className="ed-stat-label">Card required</div><div className="ed-stat-value" style={{ fontSize: 20 }}>None, ever</div></div>
            <div className="ed-stat"><div className="ed-stat-label">After 3 months</div><div className="ed-stat-value" style={{ fontSize: 20 }}>Contact us, or roll to Free</div></div>
          </div>

          <div className="ed-legal-list">
            {TERMS.map(t => (
              <div className="ed-legal-item" key={t.h}>
                <h3>{t.h}</h3>
                <p>{t.body}</p>
              </div>
            ))}
          </div>

          <div className="ed-actions" style={{ marginTop: 22, marginBottom: 0 }}>
            <Link href="/login" prefetch={false} className="ed-btn ed-btn-primary">Start free trial →</Link>
          </div>
        </div>
      </section>

      <PublicFooter
        left={<>© 2026 FlyCheap · All rights reserved</>}
        right={<><Link href="/privacy">Privacy</Link> · v2.5 · NYC</>}
      />
    </div>
  );
}

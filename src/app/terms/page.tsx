import Link from 'next/link';
import type { Metadata } from 'next';
import { APP_VERSION_SHORT } from '@/lib/version';
import { PublicTopbar, PublicFooter } from '@/components/PublicChrome';
import { PRICES } from '@/lib/prices';
import { paymentProcessors, listOf } from '@/lib/publicDisclosures';

// Prices and processors are read at request time so the terms can never
// quote a price the checkout does not charge, or a processor that is not wired.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Terms of Service — FlyCheap',
  description: 'Terms of service, subscription, refund and cancellation policy, and affiliate disclosure for FlyCheap.',
};

const EFFECTIVE = 'September 6, 2026';

type Derived = { processors: string; proMo: number; proYr: number; entMo: number; entYr: number };

const sections = (d: Derived): Array<{ id: string; h: string; body: React.ReactNode }> => [
  {
    id: 'service', h: '1 · The service',
    body: <>FlyCheap (&ldquo;we&rdquo;) is operated by <strong>Myron Mekhael</strong>, sole proprietor, New York, USA. FlyCheap is a fare-monitoring and alerting service. We poll third-party flight-data providers on a schedule, store the prices we see, and notify you when a fare meets rules you set. <strong>We are not a travel agency and do not sell tickets.</strong> Every booking is completed on the airline&rsquo;s or online travel agency&rsquo;s own website, under their terms and at their price.</>,
  },
  {
    id: 'accuracy', h: '2 · Fare data is informational',
    body: <>Prices come from our providers at the moment we polled them and can change or disappear at any time. A fare shown in FlyCheap is not an offer, a guarantee of availability, or a guarantee of price. Always verify the final price on the booking site before you pay. Buy/wait recommendations and confidence scores are statistical estimates based on the route&rsquo;s own history — they are not financial advice, and we are not liable for booking decisions you make.</>,
  },
  {
    id: 'account', h: '3 · Your account',
    body: <>You must provide a working email address; sign-in is by one-time code. You are responsible for activity under your account and for keeping your family share link private (you can rotate or revoke it at any time in Settings). One person per account; one free trial per person. We may suspend accounts that abuse the service, scrape it, resell access, or attempt to circumvent plan limits.</>,
  },
  {
    id: 'plans', h: '4 · Plans, billing and the free trial',
    body: <>Every new account starts with a <strong>3-month free trial of the full product</strong> — all Pro and Enterprise features — governed by the <Link href="/trial-terms">Trial Terms</Link>: no card is collected and you are never charged. Near the end of the trial you can contact us by email to continue; if you don&rsquo;t, your account continues automatically on the <strong>Free</strong> plan (free indefinitely). Pro (${d.proMo} USD/month or ${d.proYr} USD/year) and Enterprise (${d.entMo} USD/month or ${d.entYr} USD/year) are plain subscriptions, billed in advance through {d.processors} from the moment you subscribe; card details never touch our servers. Prices may change with at least 30 days&rsquo; notice by email; changes never apply mid-cycle.</>,
  },
  {
    id: 'refunds', h: '5 · Cancellation and refunds',
    body: <>Cancel at any time with <em>Downgrade to Free</em> on the <Link href="/pricing">Pricing page</Link> — one click, no retention calls. Your subscription then simply does not renew: you keep your paid plan until the end of the period you have already paid for, and on that date your account moves to Free, routes above the Free limit are paused, and paid-only alert channels stop. <strong>Nothing is deleted</strong>: routes, fare history, and settings are preserved, and you can re-subscribe at any time. Because you keep what you paid for, charges already billed are not refunded. If you believe you were billed in error, email <a href="mailto:sales@flycheap.live">sales@flycheap.live</a> within 7 days of the charge and we will make it right.</>,
  },
  {
    id: 'failed-payment', h: '6 · Failed payments',
    body: <>If a renewal payment fails we email you, and your payment provider retries over the following days. If payment still cannot be collected, the subscription is canceled and your account moves to Free — again with no data loss. You can update your payment method with the provider at any time.</>,
  },
  {
    id: 'affiliate', h: '7 · Affiliate disclosure',
    body: <>Some &ldquo;Book&rdquo; and &ldquo;Compare&rdquo; links are affiliate links. When you complete a booking through one, the booking site may pay us a commission. <strong>This never changes the price you pay.</strong> Fare rankings are never influenced by commission — the cheapest cached price wins, and you can always book directly with the airline. Current partners and details are listed on our <Link href="/about#affiliate-partners">About page</Link>. This disclosure is made in accordance with FTC guidelines.</>,
  },
  {
    id: 'acceptable-use', h: '8 · Acceptable use',
    body: <>Don&rsquo;t use FlyCheap to build a competing fare database, resell alerts, or hammer our providers. Automated access, including the API our mobile app uses, is rate-limited. We may add reasonable soft caps to any plan to keep the service healthy and will tell you if a cap affects you.</>,
  },
  {
    id: 'privacy', h: '9 · Privacy',
    body: <>Our <Link href="/privacy">Privacy Policy</Link> explains what we store and why. In short: your email, your routes, the fares we polled for them, and your alert preferences. We don&rsquo;t sell personal data and we don&rsquo;t run third-party ad trackers. You can delete your account from Settings → Danger zone; the Privacy Policy lists the few records that can remain afterward and how to have them erased.</>,
  },
  {
    id: 'liability', h: '10 · Warranties and liability',
    body: <>The service is provided &ldquo;as is&rdquo;. We work hard to keep polling running and alerts accurate, but we do not warrant uninterrupted service, that every fare drop will be caught, or that a fare will still be available when you click. To the fullest extent permitted by law, our total liability for any claim relating to the service is limited to the amount you paid us in the 12 months before the claim.</>,
  },
  {
    id: 'changes', h: '11 · Changes and contact',
    body: <>We may update these terms; material changes are announced by email or in-app at least 14 days before they take effect. Continued use after that date is acceptance. These terms are governed by the laws of the State of New York, USA. Questions: <a href="mailto:sales@flycheap.live">sales@flycheap.live</a>.</>,
  },
];

export default function TermsPage() {
  const SECTIONS = sections({
    processors: listOf(paymentProcessors()),
    proMo: PRICES.pro.month, proYr: PRICES.pro.year, entMo: PRICES.enterprise.month, entYr: PRICES.enterprise.year,
  });
  return (
    <div className="mk mk-bleed">
      <PublicTopbar right={<Link href="/" className="ed-btn ed-btn-secondary">← Back to site</Link>} />

      <section className="mk-section">
        <div className="mk-wrap" style={{ maxWidth: 860 }}>
          <div className="ed-eyebrow">Legal · Effective {EFFECTIVE}</div>
          <h1 className="ed-h1">
            Terms of <em>service</em>.
          </h1>
          <p className="ed-sub" style={{ maxWidth: 640 }}>
            Written to be read. The essentials: we monitor fares and alert you; we don&rsquo;t sell
            tickets; paid plans are cancel-anytime with no data loss; some Book links earn us a commission
            at no cost to you.
          </p>

          <nav className="ed-toc">
            {SECTIONS.map(s => <a key={s.id} href={`#${s.id}`}>{s.h.replace(/^\d+ · /, '')}</a>)}
          </nav>

          <div className="ed-legal-list">
            {SECTIONS.map(s => (
              <div className="ed-legal-item" key={s.id} id={s.id}>
                <h3>{s.h}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter
        left={<>© 2026 FlyCheap · Operated by Myron Mekhael, New York, USA · All rights reserved</>}
        right={<><Link href="/privacy">Privacy</Link> · <Link href="/trial-terms">Trial terms</Link> · {APP_VERSION_SHORT}</>}
      />
    </div>
  );
}

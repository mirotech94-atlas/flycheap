import Link from 'next/link';
import { APP_VERSION_SHORT } from '@/lib/version';
import type { Metadata } from 'next';
import { FcGlobe } from '@/components/FcGlobe';
import { FcKpiStrip } from '@/components/FcKpiStrip';
import { FcBestDealsTable, type FcDealRow } from '@/components/FcBestDealsTable';
import { FcLiveFeed, type LiveFeedItem } from '@/components/FcLiveFeed';
import { getPublicMetrics, fmtCompact } from '@/lib/public-metrics';

// Re-rendered every 10 minutes so every number on this page is real production data.
export const revalidate = 600;

export const metadata: Metadata = {
  title: 'FlyCheap Tracker — Fare intelligence, monitored for you',
  description: 'AI-powered flight intelligence. Track 1,000+ airlines, get email alerts when fares drop, and explore worldwide deals.',
  openGraph: {
    title: 'FlyCheap Tracker — Fare intelligence, monitored for you',
    description: 'Track 1,000+ airlines, get alerts when fares drop, explore worldwide deals.',
    url: 'https://flycheap.18dn.com/welcome',
    siteName: 'FlyCheap Tracker',
    images: [{ url: 'https://flycheap.18dn.com/api/og', width: 1200, height: 630, alt: 'FlyCheap Tracker dashboard' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FlyCheap Tracker — Fare intelligence, monitored for you',
    description: 'Track 1,000+ airlines, get alerts when fares drop, explore worldwide deals.',
    images: ['https://flycheap.18dn.com/api/og'],
  },
};

const DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const fmtD = (d: string) => {
  const dt = new Date(d + 'T12:00:00Z');
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

const FEATURES: Array<{ num: string; icon: string; title: React.ReactNode; desc: string }> = [
  { num: '01', icon: 'aim',   title: <>Buy / wait <em>recommendations</em></>, desc: 'Hopper-style verdict engine. 30-day trend + percentile analysis tells you to lock in or hold — with a confidence score.' },
  { num: '02', icon: 'map',   title: <>World <em>map</em> exploration</>,      desc: 'See the cheapest fares to every reachable destination from your home city, color-coded on an interactive map.' },
  { num: '03', icon: 'grid',  title: <>Fare-calendar <em>heatmap</em></>,      desc: '12-month grid of cheapest day-by-day prices. Click a green cell to filter; spot patterns at a glance.' },
  { num: '04', icon: 'pin',   title: <>Pin & <em>compare</em></>,              desc: 'Pin up to 3 itineraries, see side-by-side delta of price, dates, party total, and time-to-departure.' },
  { num: '05', icon: 'bell',  title: <>Smart <em>alerts</em></>,               desc: 'Two triggers: threshold-cross (below your target) and price-drop (under the 7-day median). Email on every plan; SMS, WhatsApp, Telegram one toggle away on Pro.' },
  { num: '06', icon: 'fam',   title: <>Family <em>share link</em></>,          desc: 'One read-only URL gives the whole family live access — no logins, no settings exposure. Rotate anytime.' },
  { num: '07', icon: 'split', title: <>Cross-shop <em>OTAs</em></>,            desc: 'Every Book button is a dropdown: Aviasales, Google Flights, Kayak, Skyscanner, Momondo, direct airline.' },
  { num: '08', icon: 'ai',    title: <>AI <em>concierge</em></>,               desc: 'Tool-equipped Claude assistant. Ask "find the cheapest weekend trip from NYC under $400" and it answers with real data.' },
  { num: '09', icon: 'cmd',   title: <>Command <em>palette</em> · ⌘K</>,       desc: 'Power-user shortcuts: refresh, poll, send digest, export CSV, toggle theme, jump anywhere — all one keystroke away.' },
];

function FeatureIcon({ kind }: { kind: string }) {
  const props = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'aim':   return (<svg {...props}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>);
    case 'map':   return (<svg {...props}><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" /><path d="M9 3v15M15 6v15" /></svg>);
    case 'grid':  return (<svg {...props}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor" fillOpacity=".15" /></svg>);
    case 'pin':   return (<svg {...props}><path d="M12 22s8-7.5 8-13a8 8 0 10-16 0c0 5.5 8 13 8 13z" /><circle cx="12" cy="9" r="3" /></svg>);
    case 'bell':  return (<svg {...props}><path d="M18 16V11a6 6 0 10-12 0v5l-1.5 2h15L18 16z" /><path d="M10 20a2 2 0 004 0" /></svg>);
    case 'fam':   return (<svg {...props}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5M14 20c0-2 1.5-4 4-4s3 1 3 3" /></svg>);
    case 'split': return (<svg {...props}><path d="M3 6h7l4 6-4 6H3" /><path d="M21 12H14" /><path d="M17 9l3 3-3 3" /></svg>);
    case 'ai':    return (<svg {...props}><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M9 9v2M15 9v2M9 14h6" /><path d="M3 12h2M19 12h2M12 3v2M12 19v2" /></svg>);
    case 'cmd':   return (<svg {...props}><path d="M9 6a3 3 0 11-3 3M15 6a3 3 0 113 3M15 18a3 3 0 113-3M9 18a3 3 0 11-3-3" /><path d="M9 6h6v12H9z" fill="currentColor" fillOpacity=".08" /></svg>);
    default: return null;
  }
}

const TIERS: Array<{
  name: string; price: string; unit: string; pitch: string;
  cta: string; ctaHref: string; ctaClass: string; note: string;
  featured?: boolean; badge?: string;
  features: string[];
}> = [
  {
    name: 'Free', price: '$0', unit: 'forever',
    pitch: 'For the family booker who watches a few routes.',
    cta: 'Sign up free →', ctaHref: '/login', ctaClass: 'fc-btn-light',
    note: 'No credit card required',
    features: ['Up to 5 tracked routes', 'Polling every 30 minutes', 'Email alerts + daily digest', 'Worldwide explore map', 'Family share link'],
  },
  {
    name: 'Pro', price: '$9', unit: '/ month',
    pitch: 'For the frequent traveler — speed and reach.',
    cta: 'Start 14-day free trial →', ctaHref: '/trial-terms?plan=pro', ctaClass: 'fc-btn-gold',
    featured: true, badge: 'Most popular',
    note: 'Free for 14 days, then $9/mo · cancel anytime',
    features: ['Up to 100 tracked routes', 'Priority 5-minute polling', 'SMS / WhatsApp / Telegram alerts', 'Buy/wait predictions + confidence', 'Mistake-fare radar'],
  },
  {
    name: 'Enterprise', price: '$39', unit: '/ month',
    pitch: 'For agencies, family offices, and travel desks.',
    cta: 'Continue to Enterprise →', ctaHref: '/checkout?plan=enterprise', ctaClass: 'fc-btn-ink',
    note: 'Billed monthly · cancel anytime',
    features: ['Unlimited routes · 1-minute polling', 'White-label branding + custom domain', 'REST API (/api/v1)', 'Slack channel alerts', 'Audit log'],
  },
];

const FAQS = [
  { q: 'Where does the pricing data come from?', a: 'We aggregate from Travelpayouts (the Aviasales metasearch network covering 1,000+ airlines), Duffel, and Google Flights via SerpAPI and SearchAPI. Every fare snapshot is tagged with its source so you can see exactly where a price came from.' },
  { q: 'How fresh is the data?', a: 'Tracked routes poll every 5–30 minutes (configurable per route on Pro). The 12-month best-deals scan refreshes every 12 hours. The Explore page hits live caches on each request.' },
  { q: 'Which routes and airlines can I track?', a: 'Any airport pair in the world — enter two IATA codes (JFK → LHR, LAX → BKK, EWR → DXB…) and we watch every airline our providers cover, low-cost carriers included. You can also group nearby origins (JFK + EWR) into one route.' },
  { q: 'Do you charge a booking fee?', a: 'Never. We are not a travel agency. Booking links route you to Aviasales, Kayak, Google Flights, or the airline directly — you complete the purchase there.' },
  { q: 'Is the family share link secure?', a: 'Yes. It uses a cryptographically-random token unique to your account. You can rotate or revoke it instantly from Settings — anyone holding the old URL loses access immediately.' },
  { q: 'Can I white-label this for my team?', a: 'Yes — Enterprise plans include a custom domain, custom logo, brand color, and sender email. Talk to sales for setup; provisioning takes one business day.' },
  { q: 'How does the 14-day Pro trial work?', a: 'Click "Start 14-day free trial", review and accept the trial terms, and complete checkout — your card is saved but not charged. You get every Pro feature for 14 days. If you cancel before day 14, you pay nothing; otherwise billing starts at $9/month. We email you a reminder 3 days before the trial ends.' },
  { q: 'How do I cancel my subscription?', a: 'From Settings → Billing, one click opens the secure Stripe customer portal where you can cancel instantly — no emails, no retention calls. Your plan stays active until the end of the paid period, then drops to Free without deleting any of your routes or history.' },
  { q: 'How accurate are the buy/wait recommendations?', a: 'Each verdict combines a z-score against your route’s 30-day price history with a 14-day trend slope, and ships with an explicit confidence percentage. We show you the math — percentile, median, trend — so you can judge the call yourself.' },
  { q: 'What is a mistake fare and will I really catch one?', a: 'A mistake fare is a pricing glitch — a fat-fingered fare filing or currency error — typically 40-80% below normal. They usually survive 30-90 minutes before airlines pull them. Our radar flags any fare ≥ 3 standard deviations below the 30-day mean and alerts Pro users within one polling cycle.' },
  { q: 'Which alert channels are supported?', a: 'Email on every plan. Pro adds SMS, WhatsApp, and Telegram — each is a single toggle in Settings, no bot setup required. Enterprise adds Slack and custom webhooks for routing alerts into your own systems.' },
  { q: 'Do I need to know the exact travel dates?', a: 'No. You can track a whole departure window (e.g. "any two weeks between August and October") and FlyCheap finds the cheapest date pairing inside it. Every tracked search also shows the cheapest ±3-day flex option, which often saves hundreds.' },
  { q: 'Is there a mobile app?', a: 'A native iOS and Android app with push notifications is in active development. Until it ships, the web dashboard is fully responsive and installable as a PWA — Add to Home Screen gives you an app-like experience today.' },
  { q: 'What happens to my data if I stop using FlyCheap?', a: 'Your account and fare history stay put on the Free tier. If you want out entirely, Settings → Danger Zone deletes your account and every row of your data immediately and irreversibly. We never sell or share personal data — see the Privacy page.' },
];

export default function LandingPage() {
  const m = getPublicMetrics();
  const providers = m.providersConfigured.length;
  return (
    <div className="fc-landing -mx-6 -my-8 -mb-24 md:-mb-8" data-fc-theme="ivory" data-fc-accent="gold">
      {/* ===== Marketing topbar ===== */}
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
        <nav className="fc-l-nav">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="fc-l-topbar-right">
          <Link href="/login" className="fc-btn fc-btn-light fc-btn-sm">Sign in</Link>
          <Link href="/login" className="fc-btn fc-btn-ink fc-btn-sm">Try free →</Link>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="fc-hero" style={{ marginTop: 28 }}>
        <div className="fc-hero-grid">
          <div>
            <div className="fc-l-live-pill">
              <span className="dot" />
              Live · {providers} data providers · {fmtCompact(m.snapshots)} fares recorded
            </div>
            <h1 style={{ marginTop: 22 }}>
              The <em>cheapest</em> fares,<br />
              monitored <em>for you</em>.
            </h1>
            <p className="fc-hero-lede">
              FlyCheap watches every route you care about across 1,000+ airlines, 24/7. We tell you the moment a fare drops below your threshold — or significantly under its 7-day median. Stop refreshing flight sites.
            </p>
            <div className="fc-hero-cta">
              <Link href="/login" className="fc-btn fc-btn-gold">Try it free →</Link>
              <a href="/demo" target="_blank" rel="noopener" className="fc-btn fc-btn-ghost">▶ Watch the live demo</a>
            </div>
            <div className="fc-hero-stats">
              <div>
                <div className="fc-hero-stat-label">Fare snapshots recorded</div>
                <div className="fc-hero-stat-value">{fmtCompact(m.snapshots)}<span className="delta fc-delta-flat">live</span></div>
              </div>
              <div>
                <div className="fc-hero-stat-label">Polling cadence</div>
                <div className="fc-hero-stat-value">30<span className="delta fc-delta-flat">min</span></div>
              </div>
              <div>
                <div className="fc-hero-stat-label">Free forever</div>
                <div className="fc-hero-stat-value">$0<span className="delta fc-delta-down">no card</span></div>
              </div>
              <div>
                <div className="fc-hero-stat-label">Data providers polled</div>
                <div className="fc-hero-stat-value">{providers}<span className="delta fc-delta-flat">live</span></div>
              </div>
            </div>
          </div>
          <div className="fc-hero-globe">
            <div className="fc-globe-frame">
              <span className="fc-corner tl" /><span className="fc-corner tr" />
              <span className="fc-corner bl" /><span className="fc-corner br" />
            </div>
            <div className="fc-globe-tag tl">LIVE NETWORK</div>
            <div className="fc-globe-tag br">{m.activeRoutes} ROUTES MONITORED</div>
            <FcGlobe accentColor="#d4af37" />
          </div>
        </div>
        {/* Ticker */}
        <div className="fc-ticker">
          <div className="fc-ticker-tag">BEST&nbsp;FARES · LIVE</div>
          <div className="fc-ticker-tape">
            <div className="fc-ticker-track">
              {[...m.ticker, ...m.ticker].map((d, i) => (
                <div className="fc-ticker-item" key={i}>
                  <span className="fc-ticker-route">{d.route}</span>
                  <span className="fc-ticker-price">${d.price}</span>
                  <span className={d.delta < 0 ? 'fc-ticker-delta-down' : 'fc-ticker-delta-flat'}>
                    {d.delta < 0 ? `▼ $${Math.abs(d.delta)} vs typical` : 'at typical'}
                  </span>
                  <span className="fc-ticker-sep" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Trust strip ===== */}
      <div className="fc-l-trust-strip">
        <div className="fc-l-trust-label">Live data providers · {providers} connected</div>
        <div className="fc-l-trust-logos">
          <span className="fc-l-trust-logo">Travelpayouts</span>
          <span className="fc-l-trust-logo bold">Aviasales</span>
          <span className="fc-l-trust-logo">Duffel</span>
          <span className="fc-l-trust-logo mono">SerpAPI</span>
          <span className="fc-l-trust-logo mono">SearchAPI</span>
        </div>
      </div>

      {/* ===== How it works ===== */}
      <section id="how" className="fc-section">
        <div className="fc-section-head">
          <div>
            <div className="fc-smallcaps">How it works · 3 steps to a cheaper flight</div>
            <h2 className="fc-section-title">Set it. Forget it. <em>Save big.</em></h2>
            <p className="fc-section-sub">
              Most people refresh flight sites for hours and still book at the wrong time. FlyCheap watches forever and tells you exactly when to buy.
            </p>
          </div>
        </div>
        <div className="fc-l-howit">
          <div className="fc-l-howit-step">
            <div className="fc-l-howit-num">01</div>
            <span className="fc-l-howit-tag">Add a route · 30 seconds</span>
            <h3 className="fc-l-howit-title">Tell us <em>where</em>, <em>when</em>, and your <em>target</em>.</h3>
            <p className="fc-l-howit-desc">
              Pick origin and destination, optional date windows, party size, and the per-adult price you&apos;d love. That&apos;s it — no credit card, no onboarding wizard.
            </p>
            <div className="fc-l-howit-screen">
              <span className="k">route:</span> <span className="v">JFK → CAI</span><span className="br" />
              <span className="k">depart:</span> <span className="v">Aug 1 – Sep 30</span><span className="br" />
              <span className="k">return:</span> <span className="v">+14 days</span><span className="br" />
              <span className="k">party:</span> <span className="v">4 ad + 1 inf</span><span className="br" />
              <span className="k">target:</span> <span className="hl">$800/adult</span>
            </div>
          </div>
          <div className="fc-l-howit-step">
            <div className="fc-l-howit-num">02</div>
            <span className="fc-l-howit-tag">We poll · Every 30 minutes</span>
            <h3 className="fc-l-howit-title">We watch <em>1,000+ airlines</em> while you sleep.</h3>
            <p className="fc-l-howit-desc">
              Our engine fans each search out to Travelpayouts, Duffel, and Google Flights (via SerpAPI and SearchAPI) in parallel — picking the cheapest valid offer every cycle and writing it to your fare history.
            </p>
            <div className="fc-l-howit-screen">
              <span className="g">▸ 04:12  Travelpayouts  $698</span><span className="br" />
              <span className="g">▸ 04:42  Travelpayouts  $698</span><span className="br" />
              <span className="g">▸ 05:11  Travelpayouts  $612</span> <span className="hl">−$86</span><span className="br" />
              <span className="g">▸ 05:42  SerpAPI       $612</span><span className="br" />
              <span className="g">▸ 06:12  Duffel        $589</span> <span className="hl">−$23</span>
            </div>
          </div>
          <div className="fc-l-howit-step">
            <div className="fc-l-howit-num">03</div>
            <span className="fc-l-howit-tag">You buy · The right moment</span>
            <h3 className="fc-l-howit-title">The instant a fare drops, you get a <em>ping</em>.</h3>
            <p className="fc-l-howit-desc">
              Two triggers: threshold-cross (below your target) and anomaly (≥ 10% under 7-day median). Email by default; SMS, WhatsApp, Telegram one toggle away on Pro. Click through to book direct.
            </p>
            <div className="fc-l-howit-screen">
              <span className="k">to:</span> <span className="v">you@company.com</span><span className="br" />
              <span className="k">subject:</span> <span className="v">JFK→CAI just dropped</span> <span className="hl">▼ 27%</span><span className="br" />
              <span className="k">───────────────────</span><span className="br" />
              $589/adult · Aug 12 → 30<span className="br" />
              MS986 · nonstop · Travelpayouts<span className="br" />
              <span className="hl">→ book direct or cross-shop</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Live dashboard preview ===== */}
      <section id="preview" className="fc-section">
        <div className="fc-section-head">
          <div>
            <div className="fc-smallcaps">A peek inside · Executive dashboard</div>
            <h2 className="fc-section-title">Not just alerts. A full <em>intelligence layer</em>.</h2>
            <p className="fc-section-sub">
              Live fare feeds, mistake-fare radar, route DNA cards, fare-calendar heatmaps, a Claude-powered concierge — and clean tabular data fit for an executive briefing.
            </p>
          </div>
          <Link href="/" className="fc-btn fc-btn-ink fc-btn-sm">Open live dashboard →</Link>
        </div>
        <div className="fc-l-preview-frame">
          <div className="fc-l-preview-tag">LIVE PRODUCTION DATA · REFRESHED EVERY 10 MIN</div>
          <div className="fc-l-preview-window">
            <div className="fc-l-preview-chrome">
              <div className="dots"><div className="dot" /><div className="dot" /><div className="dot" /></div>
              <div className="url">flycheap.18dn.com / <strong>dashboard</strong></div>
            </div>
            <div className="fc-l-preview-body">
              <FcKpiStrip items={[
                { label: 'Routes monitored',      value: String(m.activeRoutes), sub: `${m.routePairs} pairs in 12-month scan` },
                { label: 'Fare snapshots',        value: fmtCompact(m.snapshots), sub: m.lastPollAgoMin != null ? `Last poll ${m.lastPollAgoMin} min ago` : 'Polling continuously', accent: true },
                { label: 'Cheapest pairing',      value: m.cheapest ? `$${m.cheapest.per}` : '—', unit: 'per adult', sub: m.cheapest ? `${m.cheapest.origin} → ${m.cheapest.dest} · ${fmtD(m.cheapest.out)}` : '' },
                { label: 'Alerts delivered',      value: String(m.alertsSent), sub: 'Threshold + anomaly, all time' },
              ]} />
              <div className="fc-main-split" style={{ marginTop: 22 }}>
                <FcBestDealsTable
                  rows={m.topDeals.slice(0, 5).map(d => ({
                    origin: d.origin, dest: d.dest,
                    out: fmtD(d.out), outDay: `${DOW[d.outDow] ?? ''} ${hh(d.outHour)}`,
                    ret: fmtD(d.ret), retDay: `${DOW[d.retDow] ?? ''} ${hh(d.retHour)}`,
                    trip: d.trip, per: d.per, party: d.party, threshold: d.median,
                    sweet: d.trip >= 7 && d.trip <= 21,
                    hot: d.per <= d.median * 0.85,
                    // confidence = how far this fare sits below its route's typical price
                    conf: Math.min(95, Math.max(55, Math.round(60 + ((d.median - d.per) / Math.max(d.median, 1)) * 100))),
                    bookHref: '/login',
                  }))}
                  totalMonitored={m.routePairs}
                />
                <FcLiveFeed
                  providersLabel={`Polling ${providers} providers`}
                  initialItems={(m.recentAlerts.length > 0
                    ? m.recentAlerts.map((a, i) => ({ id: `a${i}`, route: a.route, price: a.price, delta: 0, who: a.kind === 'threshold' ? 'Threshold cross' : 'Anomaly · 7-day median', tag: a.kind === 'threshold' ? 'ALERT' : 'DROP', ts: a.ts }))
                    : m.ticker.slice(0, 4).map((t, i) => ({ id: `t${i}`, route: t.route, price: t.price, delta: t.delta, who: 'Best fare · 12-month scan', tag: 'LOW', ts: Date.now() - i * 600_000 }))
                  ) as LiveFeedItem[]}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Features grid ===== */}
      <section id="features" className="fc-section">
        <div className="fc-section-head">
          <div>
            <div className="fc-smallcaps">Built like an executive dashboard</div>
            <h2 className="fc-section-title">Everything you&apos;d want, <em>nothing</em> you wouldn&apos;t.</h2>
            <p className="fc-section-sub">
              Trend analysis, recommendations, heatmaps, comparison, family share, OTA cross-shop, an AI concierge. Designed for travelers who actually book — not browsers.
            </p>
          </div>
        </div>
        <div className="fc-l-features">
          {FEATURES.map(f => (
            <div className="fc-l-feature" key={f.num}>
              <div className="fc-l-feature-num">{f.num}<span style={{ color: 'var(--fc-muted)' }}>·</span> Feature</div>
              <div className="fc-l-feature-icon"><FeatureIcon kind={f.icon} /></div>
              <h3 className="fc-l-feature-title">{f.title}</h3>
              <p className="fc-l-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Pricing ===== */}
      <section id="pricing" className="fc-section">
        <div className="fc-section-head">
          <div>
            <div className="fc-smallcaps">Pricing · No credit card on free tier</div>
            <h2 className="fc-section-title">Free for one. <em>Priced per seat</em> for teams.</h2>
            <p className="fc-section-sub">
              Cancel anytime from the billing portal. Upgrade or downgrade in one click — your routes and history are never deleted.
            </p>
          </div>
        </div>
        <div className="fc-l-pricing">
          {TIERS.map(t => (
            <div className={'fc-l-tier' + (t.featured ? ' featured' : '')} key={t.name}>
              {t.badge && <div className="fc-l-tier-badge">{t.badge}</div>}
              <div className="fc-l-tier-name">{t.name}</div>
              <div className="fc-l-tier-price">
                {t.price}
                <span className="unit">{t.unit}</span>
              </div>
              <div className="fc-l-tier-pitch">{t.pitch}</div>
              <ul className="fc-l-tier-list">
                {t.features.map(f => (
                  <li key={f}>
                    <span className="check">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href={t.ctaHref} className={`fc-btn ${t.ctaClass} fc-l-tier-cta`}>{t.cta}</Link>
              <div className="fc-l-tier-note">{t.note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="fc-section">
        <div className="fc-section-head">
          <div>
            <div className="fc-smallcaps">Frequently asked</div>
            <h2 className="fc-section-title">Questions, <em>answered</em>.</h2>
          </div>
        </div>
        <div className="fc-l-faq">
          {FAQS.map((f, i) => (
            <details className="fc-l-faq-item" key={f.q} {...(i === 0 ? { open: true } : {})}>
              <summary className="fc-l-faq-q">
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <span style={{ flex: 1 }}>{f.q}</span>
                <span className="arrow">+</span>
              </summary>
              <div className="fc-l-faq-a">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* ===== Final CTA ===== */}
      <section className="fc-section">
        <div className="fc-l-final-cta">
          <div className="fc-eyebrow">Open invitation</div>
          <h2>Stop refreshing flight sites. <em>Set it once.</em> We watch forever.</h2>
          <p>Free tier, no credit card. Add your first route in 30 seconds — we&apos;ll start polling immediately and email you the moment a fare drops below your threshold.</p>
          <div className="fc-hero-cta">
            <Link href="/login" className="fc-btn fc-btn-gold">Try it free →</Link>
            <Link href="/about" className="fc-btn fc-btn-ghost">Read the docs</Link>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="fc-l-footer">
        <div className="fc-l-footer-mark">
          <Link href="/welcome" className="fc-l-brand">
            <div className="fc-l-brand-mark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M5 5 L5 19 M5 5 L14 5 M5 12 L11 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M22 8 A6 6 0 0 0 16 8 A6 6 0 0 0 22 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <div>
              <div className="fc-l-brand-name" style={{ fontSize: 22 }}>FlyCheap <em>Tracker</em></div>
            </div>
          </Link>
          <p>A flight intelligence platform built on Travelpayouts (Aviasales), Duffel, and Google Flights data. Some Book links are affiliate links — we may earn a commission at no extra cost to you. <Link href="/about#affiliate-partners">Disclosure →</Link></p>
        </div>
        <div className="fc-l-footer-col">
          <h4>Product</h4>
          <Link href="/">Dashboard</Link>
          <Link href="/explore">Explore</Link>
          <Link href="/searches">Watchlist</Link>
          <a href="/demo" target="_blank" rel="noopener">Live demo</a>
          <Link href="/welcome#pricing">Pricing</Link>
          <Link href="/status">Status</Link>
        </div>
        <div className="fc-l-footer-col">
          <h4>Company</h4>
          <Link href="/about">About &amp; docs</Link>
          <Link href="/login">Sign in</Link>
          <a href="mailto:sales@flycheap.18dn.com">Contact sales</a>
        </div>
        <div className="fc-l-footer-col">
          <h4>Legal</h4>
          <Link href="/terms">Terms of service</Link>
          <Link href="/terms#refunds">Refunds &amp; cancellation</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/trial-terms">Trial terms</Link>
        </div>
        <div className="fc-l-footer-legal">
          <div>© 2026 FlyCheap Tracker · Operated by Myron Mekhael, New York · All rights reserved</div>
          <div>{APP_VERSION_SHORT} · NYC</div>
        </div>
      </footer>
    </div>
  );
}

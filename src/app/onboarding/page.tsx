import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { DemoCarousel } from '@/components/DemoCarousel';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'FlyCheap — Cheap flights, monitored for you',
  description: 'AI-powered flight intelligence. Track 1,000+ airlines, get alerts when fares drop, and explore worldwide deals from your home city.',
  openGraph: {
    title: 'FlyCheap — Cheap flights, monitored for you',
    description: 'Track 1,000+ airlines, get alerts when fares drop, explore worldwide deals.',
    url: 'https://my.flycheap.live/onboarding',
    siteName: 'FlyCheap',
    images: [{ url: 'https://my.flycheap.live/api/og', width: 1200, height: 630, alt: 'FlyCheap dashboard' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FlyCheap — Cheap flights, monitored for you',
    description: 'Track 1,000+ airlines, get alerts when fares drop, explore worldwide deals.',
    images: ['https://my.flycheap.live/api/og'],
  },
};

export default function OnboardingPage() {
  return (
    <div className="-mx-6 -my-8 -mb-24 md:-mb-8">
      {/* Top bar — logo + login pill (uses dashboard for now) */}
      <header className="sticky top-0 z-30" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--rule)' }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/onboarding" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="font-display font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
              FlyCheap<span style={{ color: 'var(--accent)' }}>.</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <a href="#features" className="hidden sm:inline-flex text-sm px-3 py-1.5" style={{ color: 'var(--muted)' }}>Features</a>
            <a href="#pricing" className="hidden sm:inline-flex text-sm px-3 py-1.5" style={{ color: 'var(--muted)' }}>Pricing</a>
            <a href="#faq" className="hidden sm:inline-flex text-sm px-3 py-1.5" style={{ color: 'var(--muted)' }}>FAQ</a>
            <Link href="/" className="ed-btn ed-btn-primary" style={{ fontSize: 13, padding: '7px 14px' }}>Open dashboard →</Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="px-6 pt-16 pb-14" style={{ maxWidth: '72rem', margin: '0 auto' }}>
        <span className="ed-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="ed-dot" /> Live · 1,000+ airlines tracked · refreshed continuously
        </span>

        <h1 className="ed-h1" style={{ fontSize: 'clamp(38px, 5.5vw, 64px)', maxWidth: '18ch' }}>
          The cheapest fares, monitored for you.
        </h1>

        <p className="ed-sub" style={{ fontSize: 17, maxWidth: '60ch' }}>
          FlyCheap watches every route you care about across 1,000+ airlines, 24/7. Get an email
          the moment a fare drops below your target — or significantly under its 7-day median.
          Built originally for executive families, now for everyone.
        </p>

        <div className="ed-actions">
          <Link href="/" className="ed-btn ed-btn-primary ed-btn-hero">Try it free →</Link>
          <Link href="/explore" className="ed-btn ed-btn-secondary ed-btn-hero">Explore worldwide deals</Link>
        </div>

        {/* Stat strip */}
        <div className="ed-stats" style={{ maxWidth: 640, marginTop: 24 }}>
          {[
            { v: '1,000+', l: 'Airlines tracked' },
            { v: '24/7', l: 'Continuous polling' },
            { v: '$0', l: 'Free forever tier' },
            { v: '4', l: 'Live data providers' },
          ].map(s => (
            <div className="ed-stat" key={s.l}>
              <div className="ed-stat-label">{s.l}</div>
              <div className="ed-stat-value" style={{ fontSize: 26 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* LIVE DEMO CAROUSEL */}
      <DemoCarousel />

      {/* FEATURES GRID */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto">
          <div className="ed-eyebrow" style={{ textAlign: 'center' }}>Everything you need</div>
          <h2 className="ed-h2" style={{ fontSize: 34 }}>
            Built like an executive dashboard.
          </h2>
          <p className="ed-sub" style={{ margin: '14px auto 0' }}>
            Not just an alert tool — a full intelligence platform. Trend analysis, recommendations,
            heatmaps, side-by-side comparison, family share links, and a Claude-powered concierge.
          </p>
        </div>

        <div className="ed-tiles" style={{ marginTop: 40 }}>
          {[
            { icon: '🎯', title: 'Buy / wait recommendations', desc: 'Hopper-style verdict engine analyzes 30-day trend + percentile to tell you whether to lock in or hold.' },
            { icon: '🗺️', title: 'World map exploration', desc: 'See the cheapest fares to every reachable destination from your home city, color-coded on an interactive map.' },
            { icon: '📊', title: 'Fare heatmap calendar', desc: '12-month grid of cheapest day-by-day prices. Click a green cell to filter; spot patterns at a glance.' },
            { icon: '📌', title: 'Pin & compare', desc: 'Pin up to 3 itineraries, see side-by-side delta of price, dates, and party total.' },
            { icon: '🔔', title: 'Smart alerts', desc: 'Two flavors: threshold-cross (below your target) and price-drop (≥10% under 7-day median). Email channel; SMS/WhatsApp/Telegram one toggle away.' },
            { icon: '👨‍👩‍👧', title: 'Family share link', desc: 'One read-only URL gives the whole family live access — no logins, no settings exposure. Rotate anytime.' },
            { icon: '✈️', title: 'Cross-shop OTAs', desc: 'Every Book button is a split dropdown: Aviasales, Google Flights, Kayak, Skyscanner, Momondo, EgyptAir direct.' },
            { icon: '🤖', title: 'AI concierge', desc: 'Tool-equipped Claude assistant. Ask "find me the cheapest weekend trip from NYC under $400" and it answers with real data.' },
            { icon: '⚡', title: 'Command palette (⌘K)', desc: 'Power-user shortcuts: refresh, poll, send digest, export CSV, toggle theme — all one keystroke away.' },
          ].map(f => (
            <div key={f.title} className="ed-tile">
              <div className="text-3xl">{f.icon}</div>
              <div className="ed-tile-value" style={{ fontSize: 15, marginTop: 6 }}>{f.title}</div>
              <p className="ed-tile-meta" style={{ marginTop: 4 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      {/* Round 1 fix (F3): --surface-2 measured .ed-eyebrow/.ed-sub (--muted/
          --muted-2) at 4.18:1 in light — below AA. --surface clears it
          (same tokens measure 4.71:1+ there, matching the DemoCarousel body
          text above the pricing section). */}
      <section id="pricing" className="py-24" style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', background: 'var(--surface)' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto">
            <div className="ed-eyebrow" style={{ textAlign: 'center' }}>Pricing</div>
            <h2 className="ed-h2" style={{ fontSize: 34 }}>
              Free for individuals. Priced per seat for teams.
            </h2>
            <p className="ed-sub" style={{ margin: '14px auto 0' }}>No card required for the free tier. White-label and API access on Enterprise.</p>
          </div>

          <div className="ed-plans" style={{ marginTop: 40, maxWidth: 960, marginLeft: 'auto', marginRight: 'auto' }}>
            {[
              {
                name: 'Free', price: '$0', tag: 'forever', cta: 'Get started',
                ctaHref: '/',
                features: ['1 home airport', '5 tracked routes', 'Daily digest email', 'Worldwide explore', 'Family share link'],
              },
              {
                name: 'Pro', price: '$9', tag: '/mo', cta: 'Get Pro',
                ctaHref: '/checkout?plan=pro',
                features: ['100 tracked routes', 'Weekly anomaly digest', 'SMS and Telegram alerts', 'Buy/wait predictions', 'Flexible "any dates" tracking'],
                badge: 'Most popular',
                featured: true,
              },
              {
                name: 'Enterprise', price: 'Custom', tag: 'priced per seat', cta: 'Contact sales',
                ctaHref: '/contact',
                features: ['Unlimited tracked routes', 'White-label branding', 'Custom domain', 'REST API (/api/v1)', 'Audit log'],
              },
            ].map(t => (
              <div key={t.name} className={`ed-plan${t.featured ? ' featured' : ''}`}>
                {t.badge && <div className="ed-plan-badge">{t.badge}</div>}
                <div className="ed-eyebrow">{t.name}</div>
                <div className="ed-plan-price">{t.price}</div>
                <p className="ed-plan-note">{t.tag}</p>
                <ul className="ed-plan-list">
                  {t.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ color: 'var(--green)' }}>✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="ed-plan-cta">
                  <Link href={t.ctaHref} className={`ed-btn ${t.featured ? 'ed-btn-primary' : 'ed-btn-secondary'}`} style={{ justifyContent: 'center' }}>
                    {t.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-24">
        <div className="text-center">
          <div className="ed-eyebrow" style={{ textAlign: 'center' }}>FAQ</div>
          <h2 className="ed-h2" style={{ fontSize: 34 }}>
            Frequently asked
          </h2>
        </div>

        <div className="mt-10 space-y-3">
          {[
            { q: 'Where does the pricing data come from?', a: 'We aggregate from Travelpayouts (the Aviasales metasearch network covering 1,000+ airlines), Duffel, and Google Flights via SerpAPI and SearchAPI. Every fare snapshot is tagged with its source.' },
            { q: 'How fresh is the data?', a: 'We check your tracked routes continuously, and check the ones that matter most — close to departure, close to your target, or moving fast — most often. Every price we show you carries the time it was last verified. The Explore page hits live caches on each request.' },
            { q: 'Can I track airlines other than EgyptAir?', a: 'Yes — toggle off the "EgyptAir only" filter on the Offers page and search any airline. The default is set per route in Settings.' },
            { q: 'Do I need credit-card-level data to book?', a: 'No — we never touch payments. Booking links route you to Aviasales / Kayak / Google Flights / the airline directly, where you complete the purchase.' },
            { q: 'Is the family share link secure?', a: 'Yes. It uses a cryptographically random token unique to your account. You can rotate or revoke it instantly from Settings — anyone holding the old URL loses access.' },
            { q: 'Can I white-label this for my team?', a: 'Yes — Enterprise plans get custom domain + custom branding (logo, colors, sender email). Contact sales for details.' },
          ].map(f => (
            <details key={f.q} className="ed-panel" style={{ cursor: 'pointer' }}>
              <summary className="flex items-center justify-between gap-3" style={{ listStyle: 'none', fontWeight: 600, color: 'var(--ink)' }}>
                <span>{f.q}</span>
                <span style={{ color: 'var(--muted-2)' }}>+</span>
              </summary>
              <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 12, lineHeight: 1.6 }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 text-center" style={{ background: 'var(--panel-bg)', color: 'var(--panel-fg)' }}>
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="ed-h2" style={{ fontSize: 40, color: 'var(--panel-fg)' }}>
            Stop refreshing flight sites.
          </h2>
          <p style={{ color: 'color-mix(in srgb, var(--panel-fg) 80%, var(--panel-bg))', marginTop: 16, fontSize: 17 }}>
            Set your routes once. We watch them forever. You get an email the moment they drop.
          </p>
          <Link href="/" className="ed-btn ed-btn-primary ed-btn-hero" style={{ marginTop: 28, display: 'inline-flex', background: 'var(--panel-fg)', color: 'var(--panel-bg)' }}>
            Open the dashboard →
          </Link>
        </div>
      </section>

      <footer className="py-10" style={{ background: 'var(--panel-bg)', color: 'color-mix(in srgb, var(--panel-fg) 72%, var(--panel-bg))' }}>
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Logo size={20} />
            <span>© 2026 FlyCheap · A flight intelligence platform</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" style={{ color: 'var(--panel-fg)' }}>Dashboard</Link>
            <Link href="/explore" style={{ color: 'var(--panel-fg)' }}>Explore</Link>
            <a href="mailto:support@flycheap.live" style={{ color: 'var(--panel-fg)' }}>Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

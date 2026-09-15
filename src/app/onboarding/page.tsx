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
    url: 'https://flycheap.18dn.com/onboarding',
    siteName: 'FlyCheap',
    images: [{ url: 'https://flycheap.18dn.com/api/og', width: 1200, height: 630, alt: 'FlyCheap dashboard' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FlyCheap — Cheap flights, monitored for you',
    description: 'Track 1,000+ airlines, get alerts when fares drop, explore worldwide deals.',
    images: ['https://flycheap.18dn.com/api/og'],
  },
};

export default function OnboardingPage() {
  return (
    <div className="-mx-6 -my-8 -mb-24 md:-mb-8">
      {/* Top bar — logo + login pill (uses dashboard for now) */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-950/80 backdrop-blur border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/onboarding" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="font-display font-bold text-slate-900 dark:text-white tracking-tight">
              FlyCheap<span className="text-brand-gold">.</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <a href="#features"  className="hidden sm:inline-flex text-sm text-slate-600 dark:text-slate-300 hover:text-brand-700 px-3 py-1.5 rounded-md">Features</a>
            <a href="#pricing"   className="hidden sm:inline-flex text-sm text-slate-600 dark:text-slate-300 hover:text-brand-700 px-3 py-1.5 rounded-md">Pricing</a>
            <a href="#faq"       className="hidden sm:inline-flex text-sm text-slate-600 dark:text-slate-300 hover:text-brand-700 px-3 py-1.5 rounded-md">FAQ</a>
            <Link href="/" className="btn btn-primary !text-sm !py-1.5">Open dashboard →</Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-brand-gradient" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-brand-gold/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full bg-brand-400/30 blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-28 text-white">
          <div className="motion-fade-in">
            <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-semibold bg-white/10 text-white/90 px-3 py-1.5 rounded-full backdrop-blur border border-white/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 motion-pulse" />
              Live · 1,000+ airlines tracked · refreshed continuously
            </span>
          </div>

          <h1 className="motion-slide-up motion-delay-1 font-display font-extrabold text-5xl md:text-7xl tracking-tight mt-6 max-w-4xl leading-[1.05]">
            The cheapest fares,
            <br />
            <span className="text-brand-gold">monitored for you.</span>
          </h1>

          <p className="motion-slide-up motion-delay-2 text-lg md:text-xl text-white/80 mt-6 max-w-2xl leading-relaxed">
            FlyCheap watches every route you care about across 1,000+ airlines, 24/7. Get an email
            the moment a fare drops below your target — or significantly under its 7-day median.
            Built originally for executive families, now for everyone.
          </p>

          <div className="motion-slide-up motion-delay-3 mt-8 flex items-center gap-3 flex-wrap">
            <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-gold hover:bg-yellow-400 text-brand-900 font-bold shadow-lift hover:scale-105 transition">
              Try it free →
            </Link>
            <Link href="/explore" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/20 backdrop-blur font-semibold transition">
              Explore worldwide deals
            </Link>
          </div>

          {/* Stat strip */}
          <div className="motion-slide-up motion-delay-4 mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl">
            {[
              { v: '1,000+',   l: 'Airlines tracked' },
              { v: '24/7',   l: 'Continuous polling' },
              { v: '$0',     l: 'Free forever tier' },
              { v: '4',  l: 'Live data providers' },
            ].map(s => (
              <div key={s.l} className="text-white">
                <div className="font-display font-extrabold text-3xl text-brand-gold">{s.v}</div>
                <div className="text-xs uppercase tracking-wide text-white/70 mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Soft fade into next section */}
        <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-b from-transparent to-canvas" />
      </section>

      {/* LIVE DEMO CAROUSEL */}
      <DemoCarousel />

      {/* FEATURES GRID */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto motion-slide-up">
          <div className="eyebrow text-brand-700">Everything you need</div>
          <h2 className="font-display font-bold text-4xl text-slate-900 dark:text-white mt-2">
            Built like an executive dashboard.
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-4">
            Not just an alert tool — a full intelligence platform. Trend analysis, recommendations,
            heatmaps, side-by-side comparison, family share links, and a Claude-powered concierge.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
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
          ].map((f, i) => (
            <div key={f.title} className="card lift motion-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="text-3xl">{f.icon}</div>
              <h3 className="font-display font-bold text-base mt-3">{f.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="bg-canvas py-24 border-y border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto motion-slide-up">
            <div className="eyebrow text-brand-700">Pricing</div>
            <h2 className="font-display font-bold text-4xl text-slate-900 dark:text-white mt-2">
              Free for individuals. Priced per seat for teams.
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-4">No card required for the free tier. White-label and API access on Enterprise.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-12 max-w-5xl mx-auto">
            {[
              {
                name: 'Free', price: '$0', tag: 'forever', cta: 'Get started',
                ctaHref: '/',
                features: ['1 home airport', '5 tracked routes', 'Daily digest email', 'Worldwide explore', 'Family share link'],
                accent: 'border-slate-200 dark:border-slate-700',
              },
              {
                name: 'Pro', price: '$9', tag: '/mo', cta: 'Start 14-day trial',
                ctaHref: '/?upgrade=pro',
                features: ['Unlimited tracked routes', 'Weekly anomaly digest', 'SMS / WhatsApp / Telegram alerts', 'Buy/wait predictions', 'Priority polling (5-min)'],
                accent: 'border-brand-500 ring-2 ring-brand-500/20 scale-105',
                badge: 'Most popular',
              },
              {
                name: 'Enterprise', price: 'Custom', tag: 'priced per seat', cta: 'Contact sales',
                ctaHref: 'mailto:sales@fareintel.com',
                features: ['White-label branding', 'Custom domain', 'REST API (/api/v1)', 'Slack channel alerts', 'SSO + audit logs'],
                accent: 'border-slate-200 dark:border-slate-700',
              },
            ].map(t => (
              <div key={t.name} className={`card relative ${t.accent}`}>
                {t.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-gold text-brand-900 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full shadow">
                    {t.badge}
                  </div>
                )}
                <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t.name}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-display font-extrabold text-4xl text-slate-900 dark:text-white">{t.price}</span>
                  <span className="text-slate-500 text-sm">{t.tag}</span>
                </div>
                <ul className="mt-5 space-y-2">
                  {t.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <span className="text-emerald-600 mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href={t.ctaHref} className={`btn w-full justify-center mt-6 ${t.name === 'Pro' ? 'btn-primary' : ''}`}>
                  {t.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-24">
        <div className="text-center motion-slide-up">
          <div className="eyebrow text-brand-700">FAQ</div>
          <h2 className="font-display font-bold text-4xl text-slate-900 dark:text-white mt-2">
            Frequently asked
          </h2>
        </div>

        <div className="mt-10 space-y-3">
          {[
            { q: 'Where does the pricing data come from?', a: 'We aggregate from Travelpayouts (the Aviasales metasearch network covering 1,000+ airlines), Duffel, and Google Flights via SerpAPI and SearchAPI. Every fare snapshot is tagged with its source.' },
            { q: 'How fresh is the data?', a: 'Tracked routes poll every 5–30 minutes (configurable). The 12-month best-deals scan refreshes every 12 hours. The Explore page hits live caches on each request.' },
            { q: 'Can I track airlines other than EgyptAir?', a: 'Yes — toggle off the "EgyptAir only" filter on the Offers page and search any airline. The default is set per route in Settings.' },
            { q: 'Do I need credit-card-level data to book?', a: 'No — we never touch payments. Booking links route you to Aviasales / Kayak / Google Flights / the airline directly, where you complete the purchase.' },
            { q: 'Is the family share link secure?', a: 'Yes. It uses a cryptographically random token unique to your account. You can rotate or revoke it instantly from Settings — anyone holding the old URL loses access.' },
            { q: 'Can I white-label this for my team?', a: 'Yes — Enterprise plans get custom domain + custom branding (logo, colors, sender email). Contact sales for details.' },
          ].map((f, i) => (
            <details key={f.q} className="card group cursor-pointer motion-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
              <summary className="flex items-center justify-between gap-3 list-none">
                <span className="font-semibold text-slate-900 dark:text-white">{f.q}</span>
                <span className="text-slate-400 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative bg-brand-gradient text-white py-20 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-brand-gold/20 blur-3xl" />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="font-display font-extrabold text-4xl md:text-5xl tracking-tight">
            Stop refreshing flight sites.
          </h2>
          <p className="text-white/80 mt-4 text-lg">
            Set your routes once. We watch them forever. You get an email the moment they drop.
          </p>
          <Link href="/" className="inline-flex items-center gap-2 mt-8 px-8 py-4 rounded-xl bg-brand-gold hover:bg-yellow-400 text-brand-900 font-bold shadow-lift hover:scale-105 transition text-lg">
            Open the dashboard →
          </Link>
        </div>
      </section>

      <footer className="bg-slate-950 text-slate-400 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Logo size={20} />
            <span>© 2026 FlyCheap · A flight intelligence platform</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-white">Dashboard</Link>
            <Link href="/explore" className="hover:text-white">Explore</Link>
            <a href="mailto:sales@fareintel.com" className="hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

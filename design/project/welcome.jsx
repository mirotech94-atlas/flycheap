/* global React, ReactDOM */
const { useState: useStateW, useEffect: useEffectW } = React;

/* ============================================================
   Top bar — marketing variant
   ============================================================ */
function MarketingTopBar() {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M5 5 L5 19 M5 5 L14 5 M5 12 L11 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M22 8 A6 6 0 0 0 16 8 A6 6 0 0 0 22 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          </svg>
        </div>
        <div>
          <div className="brand-name">FlyCheap <em>Tracker</em></div>
          <div className="brand-meta">Fare Intelligence Platform</div>
        </div>
      </div>
      <nav>
        <a href="#how">How it works</a>
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQ</a>
      </nav>
      <div className="topbar-right">
        <a className="btn btn-light btn-sm">Sign in</a>
        <a className="btn btn-ink btn-sm">Try free →</a>
      </div>
    </header>
  );
}

/* ============================================================
   Hero
   ============================================================ */
function WelcomeHero() {
  return (
    <section className="hero welcome-hero" data-screen-label="Welcome Hero">
      <div className="hero-grid">
        <div>
          <div className="live-pill">
            <span className="dot" />
            Live · 700+ airlines · refreshed continuously
          </div>
          <h1>
            The <em>cheapest</em> fares,<br />
            monitored <em>for you</em>.
          </h1>
          <p className="hero-lede">
            FlyCheap watches every route you care about across 700+ airlines, 24/7. We tell you the moment a fare drops below your threshold — or significantly under its 7-day median. Stop refreshing flight sites.
          </p>
          <div className="hero-cta">
            <button className="btn btn-gold">Try it free →</button>
            <button className="btn btn-ghost">See live demo</button>
          </div>
          <div className="hero-stats">
            <div>
              <div className="hero-stat-label">Airlines tracked</div>
              <div className="hero-stat-value">700<span className="delta delta-flat">+</span></div>
            </div>
            <div>
              <div className="hero-stat-label">Polling cadence</div>
              <div className="hero-stat-value">30<span className="delta delta-flat">min</span></div>
            </div>
            <div>
              <div className="hero-stat-label">Free forever</div>
              <div className="hero-stat-value">$0<span className="delta delta-down">no card</span></div>
            </div>
            <div>
              <div className="hero-stat-label">Alert latency</div>
              <div className="hero-stat-value">10<span className="delta delta-flat">ms</span></div>
            </div>
          </div>
        </div>
        <div className="hero-globe">
          <div className="globe-frame">
            <span className="corner tl" /><span className="corner tr" />
            <span className="corner bl" /><span className="corner br" />
          </div>
          <div className="globe-tag tl">LIVE NETWORK</div>
          <div className="globe-tag br">87 ROUTES MONITORED</div>
          <Globe accentColor="#d4af37" />
        </div>
      </div>
      <HeroTicker />
    </section>
  );
}

/* ============================================================
   Trust strip
   ============================================================ */
function TrustStrip() {
  return (
    <div className="trust-strip">
      <div className="trust-label">Data partners · Verified affiliates</div>
      <div className="trust-logos">
        <span className="trust-logo">Travelpayouts</span>
        <span className="trust-logo bold">AMADEUS</span>
        <span className="trust-logo">Duffel</span>
        <span className="trust-logo mono">SerpAPI</span>
        <span className="trust-logo">Kiwi</span>
        <span className="trust-logo bold">RESEND</span>
        <span className="trust-logo">Anthropic</span>
      </div>
    </div>
  );
}

/* ============================================================
   How it works — 3 numbered steps
   ============================================================ */
function HowItWorks() {
  return (
    <section id="how" className="section">
      <div className="section-head">
        <div>
          <div className="smallcaps">How it works · 3 steps to a cheaper flight</div>
          <h2 className="section-title">Set it. Forget it. <em>Save big.</em></h2>
          <p className="section-sub">
            Most people refresh flight sites for hours and still book at the wrong time. FlyCheap watches forever and tells you exactly when to buy.
          </p>
        </div>
      </div>
      <div className="howit">
        <div className="howit-step">
          <div className="howit-num">01</div>
          <span className="howit-tag">Add a route · 30 seconds</span>
          <h3 className="howit-title">Tell us <em>where</em>, <em>when</em>, and your <em>target</em>.</h3>
          <p className="howit-desc">
            Pick origin and destination, optional date windows, party size, and the per-adult price you'd love. That's it — no credit card, no onboarding wizard.
          </p>
          <div className="howit-screen">
            <span className="k">route:</span> <span className="v">JFK → CAI</span><span className="br" />
            <span className="k">depart:</span> <span className="v">Aug 1 – Sep 30</span><span className="br" />
            <span className="k">return:</span> <span className="v">+14 days</span><span className="br" />
            <span className="k">party:</span> <span className="v">4 ad + 1 inf</span><span className="br" />
            <span className="k">target:</span> <span className="hl">$800/adult</span>
          </div>
        </div>
        <div className="howit-step">
          <div className="howit-num">02</div>
          <span className="howit-tag">We poll · Every 30 minutes</span>
          <h3 className="howit-title">We watch <em>700+ airlines</em> while you sleep.</h3>
          <p className="howit-desc">
            Our engine hits Travelpayouts, Amadeus, Duffel, Kiwi, Google Flights and direct airline APIs in tiered fallback — picking the cheapest valid offer every cycle and writing it to your fare history.
          </p>
          <div className="howit-screen">
            <span className="g">▸ 04:12  Travelpayouts  $698</span><span className="br" />
            <span className="g">▸ 04:42  Travelpayouts  $698</span><span className="br" />
            <span className="g">▸ 05:11  Travelpayouts  $612</span> <span className="hl">−$86</span><span className="br" />
            <span className="g">▸ 05:42  Amadeus       $612</span><span className="br" />
            <span className="g">▸ 06:12  Duffel        $589</span> <span className="hl">−$23</span>
          </div>
        </div>
        <div className="howit-step">
          <div className="howit-num">03</div>
          <span className="howit-tag">You buy · The right moment</span>
          <h3 className="howit-title">The instant a fare drops, you get a <em>ping</em>.</h3>
          <p className="howit-desc">
            Two triggers: threshold-cross (below your target) and anomaly (≥ 10% under 7-day median). Email by default; SMS, WhatsApp, Telegram one toggle away on Pro. Click through to book direct.
          </p>
          <div className="howit-screen">
            <span className="k">to:</span> <span className="v">you@company.com</span><span className="br" />
            <span className="k">subject:</span> <span className="v">JFK→CAI just dropped</span> <span className="hl">▼ 27%</span><span className="br" />
            <span className="k">───────────────────</span><span className="br" />
            $589/adult · Aug 12 → 30<span className="br" />
            EgyptAir MS986 · nonstop<span className="br" />
            <span className="hl">→ book on EgyptAir</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Preview — embedded fragment of the dashboard
   ============================================================ */
function PreviewFragment() {
  return (
    <section className="section" id="preview">
      <div className="section-head">
        <div>
          <div className="smallcaps">A peek inside · Executive dashboard</div>
          <h2 className="section-title">Not just alerts. A full <em>intelligence layer</em>.</h2>
          <p className="section-sub">
            Live fare feeds, mistake-fare radar, route DNA cards, fare-calendar heatmaps, a Claude-powered concierge — and clean tabular data fit for an executive briefing.
          </p>
        </div>
        <button className="btn btn-ink btn-sm">Open live dashboard →</button>
      </div>
      <div className="preview-frame">
        <div className="preview-tag">LIVE PREVIEW · TRACKER.18DN.COM</div>
        <div className="preview-window" style={{ marginTop: 28 }}>
          <div className="preview-window-chrome">
            <div className="dots"><div className="dot" /><div className="dot" /><div className="dot" /></div>
            <div className="url">tracker.flycheap.io / <strong>dashboard</strong></div>
          </div>
          <div style={{ background: 'var(--cream)', padding: 22 }}>
            <div className="kpi-strip" style={{ marginTop: 0, marginBottom: 22 }}>
              <Kpi label="Tracked routes" value="12" sub="Active across 4 origins" trend={[3, 5, 4, 6, 8, 10, 12]} />
              <Kpi label="Total savings YTD" value="$4.8" unit="K USD" sub="vs. 90-day median" accent trend={[1.2, 1.8, 2.4, 2.9, 3.4, 4.1, 4.8]} />
              <Kpi label="Cheapest pairing" value="$589" unit="per adult" sub="EWR → CAI · Aug 12" trend={[820, 780, 720, 680, 650, 612, 589]} />
              <Kpi label="Mistake fares (24h)" value="04" sub="3 still bookable" trend={[0, 1, 1, 2, 3, 3, 4]} trendColor="#d4af37" />
            </div>
            <div className="main-split" style={{ marginTop: 0 }}>
              <BestDealsCard />
              <LiveFeedCard />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Feature grid (9 features, editorial, no emoji)
   ============================================================ */
const FEATURES = [
  { num: '01', icon: 'aim',  title: <>Buy / wait <em>recommendations</em></>, desc: 'Hopper-style verdict engine. 30-day trend + percentile analysis tells you to lock in or hold — with a confidence score.' },
  { num: '02', icon: 'map',  title: <>World <em>map</em> exploration</>, desc: 'See the cheapest fares to every reachable destination from your home city, color-coded on an interactive map.' },
  { num: '03', icon: 'grid', title: <>Fare-calendar <em>heatmap</em></>, desc: '12-month grid of cheapest day-by-day prices. Click a green cell to filter; spot patterns at a glance.' },
  { num: '04', icon: 'pin',  title: <>Pin & <em>compare</em></>, desc: 'Pin up to 3 itineraries, see side-by-side delta of price, dates, party total, and time-to-departure.' },
  { num: '05', icon: 'bell', title: <>Smart <em>alerts</em></>, desc: 'Two triggers: threshold-cross and price-drop. Email default; SMS, WhatsApp, Telegram one toggle away on Pro.' },
  { num: '06', icon: 'fam',  title: <>Family <em>share link</em></>, desc: 'One read-only URL gives the whole family live access — no logins, no settings exposure. Rotate anytime.' },
  { num: '07', icon: 'split',title: <>Cross-shop <em>OTAs</em></>, desc: 'Every Book button is a dropdown: Aviasales, Google Flights, Kayak, Skyscanner, Momondo, direct airline.' },
  { num: '08', icon: 'ai',   title: <>AI <em>concierge</em></>, desc: 'Tool-equipped Claude assistant. Ask "find the cheapest weekend trip from NYC under $400" and it answers with real data.' },
  { num: '09', icon: 'cmd',  title: <>Command <em>palette</em> · ⌘K</>, desc: 'Power-user shortcuts: refresh, poll, send digest, export CSV, toggle theme, jump anywhere — all one keystroke away.' },
];

function FeatureIcon({ kind }) {
  const stroke = 'currentColor';
  const props = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (kind) {
    case 'aim':   return (<svg {...props}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill={stroke} /></svg>);
    case 'map':   return (<svg {...props}><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" /><path d="M9 3v15M15 6v15" /></svg>);
    case 'grid':  return (<svg {...props}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" fill={stroke} fillOpacity=".15" /></svg>);
    case 'pin':   return (<svg {...props}><path d="M12 22s8-7.5 8-13a8 8 0 10-16 0c0 5.5 8 13 8 13z" /><circle cx="12" cy="9" r="3" /></svg>);
    case 'bell':  return (<svg {...props}><path d="M18 16V11a6 6 0 10-12 0v5l-1.5 2h15L18 16z" /><path d="M10 20a2 2 0 004 0" /></svg>);
    case 'fam':   return (<svg {...props}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5M14 20c0-2 1.5-4 4-4s3 1 3 3" /></svg>);
    case 'split': return (<svg {...props}><path d="M3 6h7l4 6-4 6H3" /><path d="M21 12H14" /><path d="M17 9l3 3-3 3" /></svg>);
    case 'ai':    return (<svg {...props}><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M9 9v2M15 9v2M9 14h6" /><path d="M3 12h2M19 12h2M12 3v2M12 19v2" /></svg>);
    case 'cmd':   return (<svg {...props}><path d="M9 6a3 3 0 11-3 3M15 6a3 3 0 113 3M15 18a3 3 0 113-3M9 18a3 3 0 11-3-3" /><path d="M9 6h6v12H9z" fill={stroke} fillOpacity=".08" /></svg>);
    default: return null;
  }
}

function Features() {
  return (
    <section id="features" className="section">
      <div className="section-head">
        <div>
          <div className="smallcaps">Built like an executive dashboard</div>
          <h2 className="section-title">Everything you'd want, <em>nothing</em> you wouldn't.</h2>
          <p className="section-sub">
            Trend analysis, recommendations, heatmaps, comparison, family share, OTA cross-shop, an AI concierge. Designed for travelers who actually book — not browsers.
          </p>
        </div>
      </div>
      <div className="features">
        {FEATURES.map(f => (
          <div className="feature" key={f.num}>
            <div className="feature-num">{f.num}<span style={{ color: 'var(--muted)' }}>·</span> Feature</div>
            <div className="feature-icon"><FeatureIcon kind={f.icon} /></div>
            <h3 className="feature-title">{f.title}</h3>
            <p className="feature-desc">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Quote
   ============================================================ */
function QuoteSection() {
  return (
    <section className="section">
      <div className="quote">
        <div className="quote-mark">"</div>
        <blockquote className="quote-body">
          I run a family of five between New York and Cairo. FlyCheap saved us <em>$3,400</em> on the last trip alone — and I never opened a single tab.
        </blockquote>
        <div className="quote-byline">
          <strong>Hany R.</strong> &nbsp;·&nbsp; Founder, NYC&nbsp;Strategy &nbsp;·&nbsp; FlyCheap Pro since 2024
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Pricing
   ============================================================ */
const TIERS = [
  {
    name: 'Free',
    price: '$0',
    unit: 'forever',
    pitch: 'For the family booker who watches a few routes.',
    cta: 'Get started →',
    ctaStyle: 'btn-light',
    features: [
      '1 home airport',
      '5 tracked routes',
      'Daily digest email',
      'Worldwide explore',
      'Family share link',
    ],
  },
  {
    name: 'Pro',
    price: '$9',
    unit: '/ month',
    pitch: 'For the executive traveler — speed and reach.',
    cta: 'Start 14-day trial →',
    ctaStyle: 'btn-gold',
    featured: true,
    badge: 'Most popular',
    features: [
      'Unlimited tracked routes',
      'Weekly anomaly digest',
      'SMS / WhatsApp / Telegram alerts',
      'Buy/wait predictions + confidence',
      'Priority 5-minute polling',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Talk',
    unit: 'per seat',
    pitch: 'For agencies, family offices, and travel desks.',
    cta: 'Contact sales →',
    ctaStyle: 'btn-ink',
    features: [
      'White-label branding',
      'Custom domain',
      'REST API + webhooks',
      'Multi-tenant workspace',
      'SSO + audit logs',
    ],
  },
];

function Pricing() {
  return (
    <section id="pricing" className="section">
      <div className="section-head">
        <div>
          <div className="smallcaps">Pricing · No credit card on free tier</div>
          <h2 className="section-title">Free for one. <em>Priced per seat</em> for teams.</h2>
          <p className="section-sub">
            Cancel anytime. Upgrade or downgrade in one click. Enterprise plans include a dedicated success engineer.
          </p>
        </div>
      </div>
      <div className="pricing">
        {TIERS.map(t => (
          <div className={'tier' + (t.featured ? ' featured' : '')} key={t.name}>
            {t.badge && <div className="tier-badge">{t.badge}</div>}
            <div className="tier-name">{t.name}</div>
            <div className="tier-price">
              {t.price}
              <span className="unit">{t.unit}</span>
            </div>
            <div className="tier-pitch">{t.pitch}</div>
            <ul className="tier-list">
              {t.features.map(f => (
                <li key={f}>
                  <span className="check">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button className={'btn tier-cta ' + t.ctaStyle}>{t.cta}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   FAQ accordion
   ============================================================ */
const FAQS = [
  { q: 'Where does the pricing data come from?', a: 'We aggregate from Travelpayouts (Aviasales — 100M+ daily searches), Amadeus Self-Service GDS, SerpAPI / SearchAPI for Google Flights, and direct airline endpoints where available. Every fare is tagged with its source.' },
  { q: 'How fresh is the data?', a: 'Tracked routes poll every 5–30 minutes (configurable per route on Pro). The 12-month best-deals scan refreshes every 12 hours. The Explore page hits live caches on each request.' },
  { q: 'Can I track airlines other than EgyptAir?', a: 'Yes — FlyCheap supports every airline our providers cover. Toggle off the airline filter on the Offers page or set it per-route in Settings.' },
  { q: 'Do you charge a booking fee?', a: 'Never. We are not a travel agency. Booking links route you to Aviasales, Kayak, Google Flights, or the airline directly — you complete the purchase there.' },
  { q: 'Is the family share link secure?', a: 'Yes. It uses a cryptographically-random token unique to your account. You can rotate or revoke it instantly from Settings — anyone holding the old URL loses access immediately.' },
  { q: 'Can I white-label this for my team?', a: 'Yes — Enterprise plans include a custom domain, custom logo, brand color, and sender email. Talk to sales for setup; provisioning takes one business day.' },
];

function FAQ() {
  const [open, setOpen] = useStateW(0);
  return (
    <section id="faq" className="section">
      <div className="section-head">
        <div>
          <div className="smallcaps">Frequently asked</div>
          <h2 className="section-title">Questions, <em>answered</em>.</h2>
        </div>
      </div>
      <div className="faq" style={{ maxWidth: 920 }}>
        {FAQS.map((f, i) => (
          <div className={'faq-item' + (open === i ? ' open' : '')} key={f.q} onClick={() => setOpen(open === i ? -1 : i)}>
            <div className="faq-q">
              <span className="num">{String(i + 1).padStart(2, '0')}</span>
              <span style={{ flex: 1 }}>{f.q}</span>
              <span className="arrow">+</span>
            </div>
            <div className="faq-a">{f.a}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Final CTA
   ============================================================ */
function FinalCTA() {
  return (
    <section className="section">
      <div className="final-cta">
        <div className="eyebrow">Open invitation</div>
        <h2>Stop refreshing flight sites. <em>Set it once.</em> We watch forever.</h2>
        <p>Free tier, no credit card. Add your first route in 30 seconds — we'll start polling immediately and email you the moment a fare drops below your threshold.</p>
        <div className="hero-cta">
          <button className="btn btn-gold">Try it free →</button>
          <button className="btn btn-ghost">Read the docs</button>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Footer
   ============================================================ */
function WelcomeFooter() {
  return (
    <footer className="welcome-footer">
      <div className="footer-mark">
        <div className="brand">
          <div className="brand-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M5 5 L5 19 M5 5 L14 5 M5 12 L11 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M22 8 A6 6 0 0 0 16 8 A6 6 0 0 0 22 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          <div className="brand-name">FlyCheap <em>Tracker</em></div>
        </div>
        <p>A flight intelligence platform. Built on Travelpayouts, Amadeus, Duffel, Kiwi, and direct airline data feeds.</p>
      </div>
      <div className="footer-col">
        <h4>Product</h4>
        <a>Dashboard</a>
        <a>Explore</a>
        <a>Watchlist</a>
        <a>Concierge</a>
        <a>Status</a>
      </div>
      <div className="footer-col">
        <h4>Company</h4>
        <a>About</a>
        <a>Affiliates</a>
        <a>Press kit</a>
        <a>Contact sales</a>
      </div>
      <div className="footer-col">
        <h4>Legal</h4>
        <a>Privacy</a>
        <a>Terms</a>
        <a>Cookie policy</a>
        <a>Security</a>
      </div>
      <div className="footer-legal">
        <div>© 2026 FlyCheap Tracker · All rights reserved</div>
        <div>v2.4 · build 4892 · NYC</div>
      </div>
    </footer>
  );
}

/* ============================================================
   App
   ============================================================ */
const WELCOME_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "ivory",
  "accent": "gold",
  "showQuote": true,
  "showPreview": true
}/*EDITMODE-END*/;

function WelcomeApp() {
  const [t, setTweak] = useTweaks(WELCOME_DEFAULTS);
  useEffectW(() => {
    document.body.setAttribute('data-theme', t.theme);
    document.body.setAttribute('data-accent', t.accent);
  }, [t.theme, t.accent]);

  return (
    <>
      <div className="app welcome-app">
        <MarketingTopBar />
        <WelcomeHero />
        <TrustStrip />
        <HowItWorks />
        {t.showPreview && <PreviewFragment />}
        <Features />
        {t.showQuote && <QuoteSection />}
        <Pricing />
        <FAQ />
        <FinalCTA />
        <WelcomeFooter />
      </div>

      <TweaksPanel title="Welcome Tweaks">
        <TweakSection label="Theme">
          <TweakRadio
            label="Background"
            value={t.theme}
            onChange={v => setTweak('theme', v)}
            options={[
              { value: 'ivory', label: 'Ivory' },
              { value: 'paper', label: 'Paper' },
              { value: 'charcoal', label: 'Coal' },
            ]}
          />
          <TweakSelect
            label="Accent color"
            value={t.accent}
            onChange={v => setTweak('accent', v)}
            options={[
              { value: 'gold', label: 'Gold (default)' },
              { value: 'emerald', label: 'Emerald' },
              { value: 'copper', label: 'Copper' },
              { value: 'violet', label: 'Violet' },
            ]}
          />
        </TweakSection>
        <TweakSection label="Sections">
          <TweakToggle label="Live dashboard preview" value={t.showPreview} onChange={v => setTweak('showPreview', v)} />
          <TweakToggle label="Testimonial quote" value={t.showQuote} onChange={v => setTweak('showQuote', v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<WelcomeApp />);

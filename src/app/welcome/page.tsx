import { LogoMark } from '@/components/Logo';
import Link from 'next/link';
import { TIER_LIMITS } from '@/lib/db';
import { APP_VERSION_SHORT } from '@/lib/version';
import type { Metadata } from 'next';
import { FcGlobe } from '@/components/FcGlobe';
import { SkyGradient } from '@/components/fc/SkyGradient';
import { FcKpiStrip } from '@/components/FcKpiStrip';
import { FcBestDealsTable, type FcDealRow } from '@/components/FcBestDealsTable';
import { FcLiveFeed, type LiveFeedItem } from '@/components/FcLiveFeed';
import { LanguageMenu } from '@/components/LanguageMenu';
import { getPublicMetrics, fmtCompact } from '@/lib/public-metrics';
import { getRequestLocale } from '@/lib/i18n/server';
import { getAppDict, fill } from '@/lib/i18n/app';
import { Em } from '@/lib/i18n/rich';

// Re-rendered every 10 minutes so every number on this page is real production data.
export const revalidate = 600;

export const metadata: Metadata = {
  title: 'FlyCheap — Fare intelligence, monitored for you',
  description: 'AI-powered flight intelligence. Track 1,000+ airlines, get email alerts when fares drop, and explore worldwide deals.',
  openGraph: {
    title: 'FlyCheap — Fare intelligence, monitored for you',
    description: 'Track 1,000+ airlines, get alerts when fares drop, explore worldwide deals.',
    url: 'https://flycheap.live/welcome',
    siteName: 'FlyCheap',
    images: [{ url: 'https://flycheap.live/api/og', width: 1200, height: 630, alt: 'FlyCheap dashboard' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FlyCheap — Fare intelligence, monitored for you',
    description: 'Track 1,000+ airlines, get alerts when fares drop, explore worldwide deals.',
    images: ['https://flycheap.live/api/og'],
  },
};

const DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const fmtD = (d: string) => {
  const dt = new Date(d + 'T12:00:00Z');
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

// Static per-feature metadata; copy (title/desc) lives in the app dictionary, indexed in the same order.
const FEATURE_META: Array<{ num: string; icon: string }> = [
  { num: '01', icon: 'aim' }, { num: '02', icon: 'map' }, { num: '03', icon: 'grid' },
  { num: '04', icon: 'pin' }, { num: '05', icon: 'bell' }, { num: '06', icon: 'fam' },
  { num: '07', icon: 'split' }, { num: '08', icon: 'ai' }, { num: '09', icon: 'cmd' },
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

// Non-copy tier attributes (routing, styling); copy comes from the dictionary in the same order.
const TIER_META: Array<{ ctaHref: string; ctaClass: string; featured?: boolean }> = [
  { ctaHref: '/login', ctaClass: 'fc-btn-light' },
  { ctaHref: '/login', ctaClass: 'fc-btn-light' },
  { ctaHref: '/checkout?plan=pro', ctaClass: 'fc-btn-gold', featured: true },
  { ctaHref: '/checkout?plan=enterprise', ctaClass: 'fc-btn-ink' },
];

export default async function LandingPage() {
  const m = getPublicMetrics();
  const providers = m.providersConfigured.length;
  const locale = await getRequestLocale();
  const dict = getAppDict(locale);
  const t = dict.welcome;
  // This was hardcoded to 30, but a visitor who signs up lands on FREE, which
  // polls every 4 hours — 30 minutes is the Pro cadence. Advertise what the
  // reader actually gets.
  const freeMin = TIER_LIMITS.free.pollIntervalMin;
  const freeCadence = freeMin >= 120
    ? { value: Math.round(freeMin / 60), unit: 'h' }
    : { value: freeMin, unit: t.hero.min };

  // The copy assumes several providers. With one enabled it rendered
  // "1 data providers". Singularise for the English strings; other locales
  // fall through unchanged rather than being mangled by a rule that does not
  // apply to them.
  const singular = (str: string) =>
    providers === 1 ? str.replace(/\bdata providers\b/gi, m =>
      m[0] === m[0].toUpperCase() ? 'Data provider' : 'data provider') : str;

  return (
    <div className="fc-landing -mx-6 -my-8 -mb-24 md:-mb-8" data-fc-theme="cabin" data-fc-accent="gold">
      {/* ===== Marketing topbar ===== */}
      <header className="fc-l-topbar">
        <Link href="/welcome" className="fc-l-brand">
          <div className="fc-l-brand-mark">
            <LogoMark size={22} />
          </div>
          <div>
            <div className="fc-l-brand-name">FlyCheap</div>
            <div className="fc-l-brand-meta">{t.brandMeta}</div>
          </div>
        </Link>
        <nav className="fc-l-nav">
          <a href="#how">{t.nav.how}</a>
          <a href="#features">{t.nav.features}</a>
          <a href="#pricing">{t.nav.pricing}</a>
          <a href="#faq">{t.nav.faq}</a>
        </nav>
        <div className="fc-l-topbar-right">
          <LanguageMenu locale={locale} variant="topbar" label={dict.common.language} />
          <Link href="/login" prefetch={false} className="fc-btn fc-btn-light fc-btn-sm">{t.nav.signIn}</Link>
          <Link href="/early-access" className="fc-btn fc-btn-ink fc-btn-sm">{t.nav.earlyAccess}</Link>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="fc-hero" style={{ marginTop: 28 }}>
        <SkyGradient className="fc-hero-sky" />
        <div className="fc-hero-grid">
          <div>
            <div className="fc-l-live-pill">
              <span className="dot" />
              {singular(fill(t.hero.pill, { providers, fares: fmtCompact(m.snapshots) }))}
            </div>
            <h1 style={{ marginTop: 22 }}>
              <Em r={t.hero.h1[0]} /><br />
              <Em r={t.hero.h1[1]} />
            </h1>
            <p className="fc-hero-lede">
              {t.hero.lede}
            </p>
            <div className="fc-hero-cta">
              <Link href="/early-access" className="fc-btn fc-btn-gold">{t.hero.ctaEarly}</Link>
              <a href="/demo" target="_blank" rel="noopener" className="fc-btn fc-btn-ghost">{t.hero.ctaDemo}</a>
            </div>
            <div className="fc-hero-stats">
              <div>
                <div className="fc-hero-stat-label">{t.hero.statSnapshots}</div>
                <div className="fc-hero-stat-value">{fmtCompact(m.snapshots)}<span className="delta fc-delta-flat">{t.hero.live}</span></div>
              </div>
              <div>
                <div className="fc-hero-stat-label">{t.hero.statCadence}</div>
                <div className="fc-hero-stat-value">
                  {freeCadence.value}<span className="delta fc-delta-flat">{freeCadence.unit}</span>
                </div>
              </div>
              <div>
                <div className="fc-hero-stat-label">{t.hero.statFree}</div>
                <div className="fc-hero-stat-value">$0<span className="delta fc-delta-down">{t.hero.noCard}</span></div>
              </div>
              <div>
                <div className="fc-hero-stat-label">{singular(t.hero.statProviders)}</div>
                <div className="fc-hero-stat-value">{providers}<span className="delta fc-delta-flat">{t.hero.live}</span></div>
              </div>
            </div>
          </div>
          <div className="fc-hero-globe">
            <div className="fc-globe-frame">
              <span className="fc-corner tl" /><span className="fc-corner tr" />
              <span className="fc-corner bl" /><span className="fc-corner br" />
            </div>
            <div className="fc-globe-tag tl">{t.hero.globeTl}</div>
            <div className="fc-globe-tag br">{fill(t.hero.globeBr, { n: m.activeRoutes })}</div>
            <FcGlobe />
          </div>
        </div>
        {/* Ticker */}
        <div className="fc-ticker">
          <div className="fc-ticker-tag">{t.hero.ticker}</div>
          <div className="fc-ticker-tape">
            <div className="fc-ticker-track">
              {[...m.ticker, ...m.ticker].map((d, i) => (
                <div className="fc-ticker-item" key={i}>
                  <span className="fc-ticker-route">{d.route}</span>
                  <span className="fc-ticker-price">${d.price}</span>
                  <span className={d.delta < 0 ? 'fc-ticker-delta-down' : 'fc-ticker-delta-flat'}>
                    {d.delta < 0 ? fill(t.hero.tickerDown, { n: Math.abs(d.delta) }) : t.hero.tickerFlat}
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
        <div className="fc-l-trust-label">{singular(fill(t.hero.trust, { n: providers }))}</div>
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
            <div className="fc-smallcaps">{t.how.eyebrow}</div>
            <h2 className="fc-section-title"><Em r={t.how.title} /></h2>
            <p className="fc-section-sub">
              {t.how.sub}
            </p>
          </div>
        </div>
        <div className="fc-l-howit">
          <div className="fc-l-howit-step">
            <div className="fc-l-howit-num">01</div>
            <span className="fc-l-howit-tag">{t.how.steps[0].tag}</span>
            <h3 className="fc-l-howit-title"><Em r={t.how.steps[0].title} /></h3>
            <p className="fc-l-howit-desc">
              {t.how.steps[0].desc}
            </p>
            <div className="fc-l-howit-screen">
              <span className="k">{t.how.screen1.route}</span> <span className="v">JFK → CAI</span><span className="br" />
              <span className="k">{t.how.screen1.depart}</span> <span className="v">Aug 1 – Sep 30</span><span className="br" />
              <span className="k">{t.how.screen1.ret}</span> <span className="v">{t.how.screen1.retVal}</span><span className="br" />
              <span className="k">{t.how.screen1.party}</span> <span className="v">{t.how.screen1.partyVal}</span><span className="br" />
              <span className="k">{t.how.screen1.target}</span> <span className="hl">{t.how.screen1.targetVal}</span>
            </div>
          </div>
          <div className="fc-l-howit-step">
            <div className="fc-l-howit-num">02</div>
            <span className="fc-l-howit-tag">{t.how.steps[1].tag}</span>
            <h3 className="fc-l-howit-title"><Em r={t.how.steps[1].title} /></h3>
            <p className="fc-l-howit-desc">
              {t.how.steps[1].desc}
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
            <span className="fc-l-howit-tag">{t.how.steps[2].tag}</span>
            <h3 className="fc-l-howit-title"><Em r={t.how.steps[2].title} /></h3>
            <p className="fc-l-howit-desc">
              {t.how.steps[2].desc}
            </p>
            <div className="fc-l-howit-screen">
              <span className="k">{t.how.screen3.to}</span> <span className="v">you@company.com</span><span className="br" />
              <span className="k">{t.how.screen3.subject}</span> <span className="v">{t.how.screen3.subjectVal}</span> <span className="hl">▼ 27%</span><span className="br" />
              <span className="k">───────────────────</span><span className="br" />
              {t.how.screen3.line1}<span className="br" />
              {t.how.screen3.line2}<span className="br" />
              <span className="hl">{t.how.screen3.line3}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Live dashboard preview ===== */}
      <section id="preview" className="fc-section">
        <div className="fc-section-head">
          <div>
            <div className="fc-smallcaps">{t.preview.eyebrow}</div>
            <h2 className="fc-section-title"><Em r={t.preview.title} /></h2>
            <p className="fc-section-sub">
              {t.preview.sub}
            </p>
          </div>
          <Link href="/" className="fc-btn fc-btn-ink fc-btn-sm">{t.preview.open}</Link>
        </div>
        <div className="fc-l-preview-frame">
          <div className="fc-l-preview-tag">{t.preview.tag}</div>
          <div className="fc-l-preview-window">
            <div className="fc-l-preview-chrome">
              <div className="dots"><div className="dot" /><div className="dot" /><div className="dot" /></div>
              <div className="url">flycheap.live / <strong>{t.preview.dashboard}</strong></div>
            </div>
            <div className="fc-l-preview-body">
              <FcKpiStrip items={[
                { label: t.preview.kpiRoutes,    value: String(m.activeRoutes), sub: fill(t.preview.kpiRoutesSub, { n: m.routePairs }) },
                { label: t.preview.kpiSnapshots, value: fmtCompact(m.snapshots), sub: m.lastPollAgoMin != null ? fill(t.preview.lastPoll, { n: m.lastPollAgoMin }) : t.preview.polling, accent: true },
                { label: t.preview.kpiCheapest,  value: m.cheapest ? `$${m.cheapest.per}` : '—', unit: t.preview.perAdult, sub: m.cheapest ? `${m.cheapest.origin} → ${m.cheapest.dest} · ${fmtD(m.cheapest.out)}` : '' },
                { label: t.preview.kpiAlerts,    value: String(m.alertsSent), sub: t.preview.kpiAlertsSub },
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
                  providersLabel={fill(t.preview.pollingProviders, { n: providers })}
                  initialItems={(m.recentAlerts.length > 0
                    ? m.recentAlerts.map((a, i) => ({ id: `a${i}`, route: a.route, price: a.price, delta: 0, who: a.kind === 'threshold' ? t.preview.feedThreshold : t.preview.feedAnomaly, tag: a.kind === 'threshold' ? 'ALERT' : 'DROP', ts: a.ts }))
                    : m.ticker.slice(0, 4).map((tk, i) => ({ id: `t${i}`, route: tk.route, price: tk.price, delta: tk.delta, who: t.preview.feedBest, tag: 'LOW', ts: Date.now() - i * 600_000 }))
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
            <div className="fc-smallcaps">{t.features.eyebrow}</div>
            <h2 className="fc-section-title"><Em r={t.features.title} /></h2>
            <p className="fc-section-sub">
              {t.features.sub}
            </p>
          </div>
        </div>
        <div className="fc-l-features">
          {FEATURE_META.map((f, i) => (
            <div className="fc-l-feature" key={f.num}>
              <div className="fc-l-feature-num">{f.num}<span style={{ color: 'var(--fc-muted)' }}>·</span> {t.features.label}</div>
              <div className="fc-l-feature-icon"><FeatureIcon kind={f.icon} /></div>
              <h3 className="fc-l-feature-title"><Em r={t.features.items[i].title} /></h3>
              <p className="fc-l-feature-desc">{t.features.items[i].desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Pricing ===== */}
      <section id="pricing" className="fc-section">
        <div className="fc-section-head">
          <div>
            <div className="fc-smallcaps">{t.pricing.eyebrow}</div>
            <h2 className="fc-section-title"><Em r={t.pricing.title} /></h2>
            <p className="fc-section-sub">
              {t.pricing.sub}
            </p>
          </div>
        </div>
        <div className="fc-l-pricing">
          {t.pricing.tiers.map((tier, i) => {
            const meta = TIER_META[i];
            return (
              <div className={'fc-l-tier' + (meta.featured ? ' featured' : '')} key={tier.name}>
                {tier.badge && <div className="fc-l-tier-badge">{tier.badge}</div>}
                <div className="fc-l-tier-name">{tier.name}</div>
                <div className="fc-l-tier-price">
                  {tier.price}
                  <span className="unit">{tier.unit}</span>
                </div>
                <div className="fc-l-tier-pitch">{tier.pitch}</div>
                <ul className="fc-l-tier-list">
                  {tier.features.map(f => (
                    <li key={f}>
                      <span className="check">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href={meta.ctaHref} className={`fc-btn ${meta.ctaClass} fc-l-tier-cta`}>{tier.cta}</Link>
                <div className="fc-l-tier-note">{tier.note}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="fc-section">
        <div className="fc-section-head">
          <div>
            <div className="fc-smallcaps">{t.faq.eyebrow}</div>
            <h2 className="fc-section-title"><Em r={t.faq.title} /></h2>
          </div>
        </div>
        <div className="fc-l-faq">
          {t.faq.items.map((f, i) => (
            <details className="fc-l-faq-item" key={i} {...(i === 0 ? { open: true } : {})}>
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
          <div className="fc-eyebrow">{t.final.eyebrow}</div>
          <h2><Em r={t.final.title} /></h2>
          <p>{t.final.sub}</p>
          <div className="fc-hero-cta">
            <Link href="/login" prefetch={false} className="fc-btn fc-btn-gold">{t.final.tryFree}</Link>
            <Link href="/about" className="fc-btn fc-btn-ghost">{t.final.docs}</Link>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="fc-l-footer">
        <div className="fc-l-footer-mark">
          <Link href="/welcome" className="fc-l-brand">
            <div className="fc-l-brand-mark">
              <LogoMark size={22} />
            </div>
            <div>
              <div className="fc-l-brand-name" style={{ fontSize: 22 }}>FlyCheap</div>
            </div>
          </Link>
          <p>{t.footer.blurb}<Link href="/about#affiliate-partners">{t.footer.disclosure}</Link></p>
        </div>
        <div className="fc-l-footer-col">
          <h4>{t.footer.product}</h4>
          <Link href="/">{t.footer.dashboard}</Link>
          <Link href="/explore">{t.footer.explore}</Link>
          <Link href="/searches">{t.footer.watchlist}</Link>
          <a href="/demo" target="_blank" rel="noopener">{t.footer.liveDemo}</a>
          <Link href="/welcome#pricing">{t.footer.pricing}</Link>
          <Link href="/status">{t.footer.status}</Link>
        </div>
        <div className="fc-l-footer-col">
          <h4>{t.footer.company}</h4>
          <Link href="/about">{t.footer.about}</Link>
          <Link href="/login" prefetch={false}>{t.footer.signIn}</Link>
          <a href="mailto:sales@flycheap.live">{t.footer.contactSales}</a>
        </div>
        <div className="fc-l-footer-col">
          <h4>{t.footer.legal}</h4>
          <Link href="/terms">{t.footer.terms}</Link>
          <Link href="/terms#refunds">{t.footer.refunds}</Link>
          <Link href="/privacy">{t.footer.privacy}</Link>
          <Link href="/trial-terms">{t.footer.trialTerms}</Link>
        </div>
        <div className="fc-l-footer-legal">
          <div>{t.footer.copyright}</div>
          <div>{APP_VERSION_SHORT} · NYC</div>
        </div>
      </footer>
    </div>
  );
}

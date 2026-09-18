import { RouteField } from '@/components/fc/RouteField';
import { Logo } from '@/components/Logo';
import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { getPublicMetrics, fmtCompact } from '@/lib/public-metrics';
import { earlyAccessCount, getFeedPool } from '@/lib/early-access';
import { LiveFeed } from './LiveFeed';
import { LOCALES, LOCALE_COOKIE, resolveLocale, type Locale } from '@/lib/i18n/locales';
import { getEarlyAccessDict, fill } from '@/lib/i18n/early-access';
import { EarlyAccessForm } from './EarlyAccessForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Early access — FlyCheap',
  description: 'Overpaying for flights stops here. FlyCheap watches 1,000+ airlines on your routes and pings you the moment a fare drops — founding members get in first.',
  openGraph: {
    title: 'FlyCheap — overpaying for flights stops here',
    description: 'Founding-member early access: a 3-month free trial, then upgrade to Pro or Enterprise only if you want more.',
    url: 'https://flycheap.live/early-access', siteName: 'FlyCheap', type: 'website',
    images: [{ url: 'https://flycheap.live/api/og', width: 1200, height: 630, alt: 'FlyCheap' }],
  },
};

const ICONS: Record<string, React.ReactNode> = {
  verdict: <path d="M4 14l4-4 4 3 8-8M15 5h5v5" />,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></>,
  split: <><path d="M4 6h6l4 6-4 6H4" /><path d="M20 12h-6M17 9l3 3-3 3" /></>,
  ai: <><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M9 9v2M15 9v2M9 14h6" /></>,
  pin: <><path d="M12 22s7-7 7-13a7 7 0 10-14 0c0 6 7 13 7 13z" /><circle cx="12" cy="9" r="2.5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
  users: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5M14 20c0-2 1.5-4 4-4s3 1 3 3" /></>,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />,
  direct: <><path d="M4 12h12" /><path d="M12 7l5 5-5 5" /><path d="M20 5v14" /></>,
  stop: <><circle cx="12" cy="12" r="9" /><path d="M9 9h6v6H9z" /></>,
  q: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5M12 17h.01" /></>,
};
function Icon({ k }: { k: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{ICONS[k]}</svg>;
}
const WHY_ICONS = ['verdict', 'calendar', 'globe', 'split', 'ai', 'pin'];
const WRONG_ICONS = ['shield', 'direct', 'stop'];
const MODE_ICONS = ['mail', 'bolt', 'users'];

export default async function EarlyAccessPage({ searchParams }: { searchParams: Promise<{ ref?: string; lang?: string }> }) {
  const { ref, lang } = await searchParams;
  const ck = await cookies(); const hd = await headers();
  const locale: Locale = resolveLocale({ query: lang, cookie: ck.get(LOCALE_COOKIE)?.value, acceptLanguage: hd.get('accept-language') });
  const L = LOCALES[locale];
  const t = getEarlyAccessDict(locale);
  const m = getPublicMetrics();
  const count = earlyAccessCount();
  const pool = getFeedPool(40);
  const nextPath = ref ? `/early-access?ref=${encodeURIComponent(ref)}` : '/early-access';
  const formLabels = { placeholder: t.cta.placeholder, airport: t.cta.airport, button: t.cta.button, busy: t.cta.busy, fine: t.cta.fine, invited: t.cta.invited, err: t.cta.err, netErr: t.cta.netErr, doneA: t.cta.doneA, doneExisting: t.cta.doneExisting, doneOf: t.cta.doneOf, share: t.cta.share, joined: t.cta.joined, copy: t.cta.copy, copied: t.cta.copied, shareX: t.cta.shareX, shareWa: t.cta.shareWa, shareMail: t.cta.shareMail, shareText: t.cta.shareText, notYou: t.cta.notYou };

  return (
    <div className="dc" dir={L.dir} lang={locale} data-locale={locale}>
      {L.font && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${L.font}&display=swap`} />}

      {/* ===== Nav ===== */}
      <header className="dc-nav">
        <div className="dc-wrap dc-nav-in">
          <Link href="/early-access" className="dc-logo" aria-label="FlyCheap">
            <Logo size={26} />
            <span>flycheap</span>
          </Link>
          <nav className="dc-links">
            <a href="#why">{t.nav.why}</a>
            <a href="#how">{t.nav.how}</a>
            <a href="#fit">{t.nav.who}</a>
          </nav>
          <div className="dc-nav-right">
            <Link href="/login" prefetch={false} className="dc-signin">{t.nav.signin}</Link>
            <details className="dc-lang">
              <summary>{L.flag} {locale.toUpperCase()} <span className="chev">▾</span></summary>
              <div className="dc-lang-menu">
                {(Object.keys(LOCALES) as Locale[]).map(code => (
                  <a key={code} href={`/api/lang?set=${code}&next=${encodeURIComponent(nextPath)}`} className={code === locale ? 'on' : ''}>
                    <span>{LOCALES[code].flag}</span>{LOCALES[code].label}
                  </a>
                ))}
              </div>
            </details>
            <a href="#join" className="dc-btn dc-btn-primary">{t.nav.cta}</a>
          </div>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="dc-hero">
        <RouteField className="dc-hero-sky" />
        <div className="dc-wrap dc-center">
          <div className="dc-pill fc-glass-pill"><span className="dot" />{t.hero.pill}</div>
          <h1>{t.hero.h1a}<br /><span className="dc-accent">{t.hero.h1b}</span></h1>
          <p className="dc-lede">{t.hero.sub}</p>
          <div className="dc-actions">
            <a href="#join" className="dc-btn dc-btn-primary dc-btn-lg">{t.hero.cta}</a>
            <a href="#how" className="dc-btn dc-btn-ghost dc-btn-lg">{t.hero.secondary}</a>
          </div>

          {/* Live feed (real data, rotating) */}
          <LiveFeed
            initial={pool}
            labels={{ title: t.feed.title, typical: t.feed.typical, at: t.feed.at, foot: t.feed.foot, lastPoll: t.feed.lastPoll, tagLow: t.feed.tagLow, tagDrop: t.feed.tagDrop, empty: t.feed.empty }}
            lastPollText={m.lastPollAgoMin != null ? fill(t.feed.lastPoll, { n: m.lastPollAgoMin }) : ''}
            footRight={`${count.toLocaleString()} · ${fmtCompact(m.snapshots)}`}
          />
        </div>
      </section>

      {/* ===== Logos ===== */}
      <section className="dc-logos">
        <div className="dc-wrap dc-center">
          <div className="dc-logos-label">{t.logos.data}</div>
          <div className="dc-logos-row"><span>Travelpayouts</span><span>Aviasales</span><span>Duffel</span><span>SerpAPI</span><span>SearchAPI</span></div>
          <div className="dc-logos-label" style={{ marginTop: 22 }}>{t.logos.book}</div>
          <div className="dc-logos-row dim"><span>Google Flights</span><span>Kayak</span><span>Skyscanner</span><span>Momondo</span><span>Trip.com</span><span>Airline direct</span><span>Hotellook</span><span>Airbnb</span><span>Vrbo</span></div>
        </div>
      </section>

      {/* ===== Problem ===== */}
      <section className="dc-section" id="why">
        <div className="dc-wrap dc-center">
          <div className="dc-eyebrow">{t.problem.eyebrow}</div>
          <h2>{t.problem.h2a}<br />{t.problem.h2b}</h2>
          <p className="dc-sub">{t.problem.sub}</p>
          <div className="dc-quotes">
            {t.problem.quotes.map(q => <div className="dc-quote" key={q}>{q}</div>)}
          </div>
          <p className="dc-close">{t.problem.closeA} <span className="dc-accent">{t.problem.closeB}</span></p>
        </div>
      </section>

      {/* ===== Difference ===== */}
      <section className="dc-section">
        <div className="dc-wrap dc-center">
          <div className="dc-eyebrow">{t.diff.eyebrow}</div>
          <h2>{t.diff.h2a}<br />{t.diff.h2b}</h2>
          <p className="dc-sub">{t.diff.sub}</p>
          <div className="dc-grid3">
            {t.diff.cards.map(([h, d]) => (
              <div className="dc-card dc-card-q" key={h}><div className="dc-qicon"><Icon k="q" /></div><h4>{h}</h4><p>{d}</p></div>
            ))}
          </div>
          <p className="dc-close">{t.diff.closeA} <span className="dc-accent">{t.diff.closeB}</span></p>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section className="dc-section" id="how">
        <div className="dc-wrap dc-center">
          <div className="dc-eyebrow">{t.how.eyebrow}</div>
          <h2>{t.how.h2}</h2>
          <p className="dc-sub">{t.how.sub}</p>
          <div className="dc-grid3">
            {t.how.steps.map(([h, d], i) => (
              <div className="dc-card dc-step" key={h}><div className="dc-step-n">0{i + 1}</div><h3>{h}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Metric band ===== */}
      <section className="dc-section dc-band">
        <div className="dc-wrap dc-center">
          <div className="dc-eyebrow dim">{t.metric.eyebrow}</div>
          <h2 className="big">{fill(t.metric.h2a, { fares: fmtCompact(m.snapshots) })}<br /><span className="dc-accent">{t.metric.h2b}</span></h2>
          <p className="dc-sub">{fill(t.metric.sub, { routes: m.activeRoutes, alerts: m.alertsSent })}</p>
        </div>
      </section>

      {/* ===== Wrong call ===== */}
      <section className="dc-section">
        <div className="dc-wrap dc-center">
          <div className="dc-eyebrow">{t.wrong.eyebrow}</div>
          <h2>{t.wrong.h2a}<br />{t.wrong.h2b}</h2>
          <p className="dc-sub">{t.wrong.sub}</p>
          <div className="dc-grid3">
            {t.wrong.cards.map(([h, d], i) => (
              <div className="dc-card" key={h}><div className="dc-icon"><Icon k={WRONG_ICONS[i]} /></div><h4>{h}</h4><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Modes ===== */}
      <section className="dc-section">
        <div className="dc-wrap dc-center">
          <div className="dc-eyebrow">{t.modes.eyebrow}</div>
          <h2>{t.modes.h2a}<br />{t.modes.h2b}</h2>
          <p className="dc-sub">{t.modes.sub}</p>
          <div className="dc-grid3">
            {t.modes.cards.map(([h, d], i) => (
              <div className="dc-card" key={h}><div className="dc-icon"><Icon k={MODE_ICONS[i]} /></div><div className="dc-mode-tag">{t.modes.tags[i]}</div><h4>{h}</h4><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Sovereign / stats ===== */}
      <section className="dc-section dc-band">
        <div className="dc-wrap dc-center">
          <div className="dc-eyebrow">{t.sovereign.eyebrow}</div>
          <h2>{t.sovereign.h2a}<br />{t.sovereign.h2b}</h2>
          <p className="dc-sub">{t.sovereign.sub}</p>
          <div className="dc-stats">
            {t.sovereign.stats.map(([v, l]) => <div className="dc-stat" key={l}><div className="v">{v}</div><div className="l">{l}</div></div>)}
          </div>
        </div>
      </section>

      {/* ===== Coverage ===== */}
      <section className="dc-section">
        <div className="dc-wrap dc-center">
          <div className="dc-eyebrow">{t.coverage.eyebrow}</div>
          <h2>{t.coverage.h2a}<br />{t.coverage.h2b}</h2>
          <div className="dc-chips">
            {t.coverage.chips.map(([h, d]) => <div className="dc-chip" key={h}><div className="h">✓ {h}</div><div className="d">{d}</div></div>)}
          </div>
        </div>
      </section>

      {/* ===== Why ===== */}
      <section className="dc-section">
        <div className="dc-wrap dc-center">
          <div className="dc-eyebrow">{t.why.eyebrow}</div>
          <h2>{t.why.h2a}<br />{t.why.h2b}</h2>
          <p className="dc-sub">{t.why.sub}</p>
          <div className="dc-grid3">
            {t.why.cards.map(([h, d], i) => (
              <div className="dc-card" key={h}><div className="dc-icon"><Icon k={WHY_ICONS[i]} /></div><h4>{h}</h4><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Fit ===== */}
      <section className="dc-section" id="fit">
        <div className="dc-wrap dc-center">
          <div className="dc-eyebrow">{t.fit.eyebrow}</div>
          <h2>{t.fit.h2}</h2>
          <p className="dc-sub">{t.fit.sub}</p>
          <div className="dc-grid-fit">
            {t.fit.cards.map(([h, who, ...tips], i) => (
              <div className="dc-card dc-fit" key={h}>
                <div className="dc-step-n">0{i + 1}</div>
                <h4>{h}</h4>
                <p className="who">{who}</p>
                <ul>{tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="dc-section dc-cta-wrap" id="join">
        <div className="dc-wrap">
          <div className="dc-cta">
            <h2>{t.cta.h2a}<br /><span className="dc-accent">{t.cta.h2b}</span></h2>
            <p className="dc-sub">{t.cta.sub}</p>
            <EarlyAccessForm initialRef={ref ?? ''} labels={formLabels} />
            <div className="dc-cta-chips">{t.cta.chips.map(c => <span key={c}>✓ {c}</span>)}</div>
            <p className="dc-consent">{t.cta.consent} <Link href="/privacy">Privacy</Link></p>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="dc-footer">
        <div className="dc-wrap">
          <div className="dc-footer-grid">
            <div className="dc-footer-brand">
              <div className="dc-logo"><Logo size={22} /><span>flycheap</span></div>
              <p>{t.footer.tag}</p>
              <p className="dc-accent">{t.footer.sovereign}</p>
            </div>
            {t.footer.cols.map(col => {
              const [title, links] = col as [string, string[][]];
              return (
                <div className="dc-footer-col" key={title}>
                  <h5>{title}</h5>
                  {links.map(([label, href]) => href.startsWith('#') || href.startsWith('mailto:') ? <a key={label} href={href}>{label}</a> : <Link key={label} href={href}>{label}</Link>)}
                </div>
              );
            })}
          </div>
          <div className="dc-footer-langs">
            {(Object.keys(LOCALES) as Locale[]).map(code => (
              <a key={code} href={`/api/lang?set=${code}&next=${encodeURIComponent(nextPath)}`} className={code === locale ? 'on' : ''}>{LOCALES[code].flag} {LOCALES[code].label}</a>
            ))}
          </div>
          <div className="dc-footer-legal">
            <span>{t.footer.copyright}</span>
            <span><Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></span>
          </div>
        </div>
      </footer>
    </div>
  );
}

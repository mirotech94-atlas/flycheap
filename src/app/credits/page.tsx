import { LogoMark } from '@/components/Logo';
import Link from 'next/link';
import type { Metadata } from 'next';
import { APP_VERSION_SHORT } from '@/lib/version';
import { placeCredits } from '@/lib/places';

export const metadata: Metadata = {
  title: 'Photo credits — FlyCheap',
  description: 'Photographer and licence for every destination photograph used in FlyCheap.',
};

export default function CreditsPage() {
  const credits = placeCredits();

  return (
    <div className="fc-landing -mx-6 -my-8 -mb-24 md:-mb-8" data-fc-theme="cabin" data-fc-accent="gold">
      <header className="fc-l-topbar">
        <Link href="/" className="fc-l-brand">
          <div className="fc-l-brand-mark">
            <LogoMark size={22} />
          </div>
          <div>
            <div className="fc-l-brand-name">FlyCheap</div>
            <div className="fc-l-brand-meta">Fare Intelligence Platform</div>
          </div>
        </Link>
        <div className="fc-l-topbar-right">
          <Link href="/" className="fc-btn fc-btn-light fc-btn-sm">← Back to site</Link>
        </div>
      </header>

      <section className="fc-section" style={{ marginTop: 48, maxWidth: 1040, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="fc-smallcaps">Credits · {credits.length} photographs</div>
        <h1 className="fc-section-title" style={{ marginTop: 10 }}>
          Photo <em>credits</em>.
        </h1>
        <p className="fc-section-sub" style={{ maxWidth: 680 }}>
          The destination photographs in Hotels, Airbnbs and Explore come from Wikimedia
          Commons and Wikipedia. Each is used under the licence its photographer chose, and
          each is listed below with the photographer&rsquo;s name and a link to the original
          file. We resize them to fit the layout; otherwise they are unaltered. If you are a
          photographer here and want a credit corrected or an image removed, email{' '}
          <a href="mailto:sales@flycheap.live">sales@flycheap.live</a> and we will act on it.
        </p>

        <ul className="fc-credits">
          {credits.map(c => (
            <li className="fc-credit" key={c.code}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.photo} alt={c.place} loading="lazy" />
              <div className="fc-credit-body">
                <div className="fc-credit-place">
                  {c.place} <span className="fc-credit-code">{c.code}</span>
                </div>
                <div className="fc-credit-author">{c.author}</div>
                <div className="fc-credit-meta">
                  {c.license_url
                    ? <a href={c.license_url} target="_blank" rel="noopener nofollow">{c.license}</a>
                    : <span>{c.license}</span>}
                  {c.page && <> · <a href={c.page} target="_blank" rel="noopener nofollow">Original file</a></>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="fc-l-footer" style={{ marginTop: 64 }}>
        <div className="fc-l-footer-legal" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div>© 2026 FlyCheap · Operated by Myron Mekhael, New York, USA · All rights reserved</div>
          <div>
            <Link href="/privacy" style={{ color: 'inherit' }}>Privacy</Link> ·{' '}
            <Link href="/terms" style={{ color: 'inherit' }}>Terms</Link> · {APP_VERSION_SHORT}
          </div>
        </div>
      </footer>
    </div>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { APP_VERSION_SHORT } from '@/lib/version';
import { placeCredits } from '@/lib/places';
import { PublicTopbar, PublicFooter } from '@/components/PublicChrome';

export const metadata: Metadata = {
  title: 'Photo credits — FlyCheap',
  description: 'Photographer and licence for every destination photograph used in FlyCheap.',
};

export default function CreditsPage() {
  const credits = placeCredits();

  return (
    <div className="mk mk-bleed">
      <PublicTopbar right={<Link href="/" className="ed-btn ed-btn-secondary">← Back to site</Link>} />

      <section className="mk-section">
        <div className="mk-wrap" style={{ maxWidth: 1040 }}>
          <div className="ed-eyebrow">Credits · {credits.length} photographs</div>
          <h1 className="ed-h1">
            Photo <em>credits</em>.
          </h1>
          <p className="ed-sub" style={{ maxWidth: 680 }}>
            The destination photographs in Hotels, Airbnbs and Explore come from Wikimedia
            Commons and Wikipedia. Each is used under the licence its photographer chose, and
            each is listed below with the photographer&rsquo;s name and a link to the original
            file. We resize them to fit the layout; otherwise they are unaltered. If you are a
            photographer here and want a credit corrected or an image removed, email{' '}
            <a href="mailto:sales@flycheap.live">sales@flycheap.live</a> and we will act on it.
          </p>

          <ul className="ed-credits" style={{ listStyle: 'none', padding: 0, margin: '28px 0 0' }}>
            {credits.map(c => (
              <li className="ed-credit" key={c.code}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.photo} alt={c.place} loading="lazy" />
                <div className="ed-credit-body">
                  <div className="ed-credit-place">
                    {c.place} <span className="ed-credit-code">{c.code}</span>
                  </div>
                  <div className="ed-credit-author">{c.author}</div>
                  <div className="ed-credit-meta">
                    {c.license_url
                      ? <a href={c.license_url} target="_blank" rel="noopener nofollow">{c.license}</a>
                      : <span>{c.license}</span>}
                    {c.page && <> · <a href={c.page} target="_blank" rel="noopener nofollow">Original file</a></>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PublicFooter
        left={<>© 2026 FlyCheap · Operated by Myron Mekhael, New York, USA · All rights reserved</>}
        right={<><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · {APP_VERSION_SHORT}</>}
      />
    </div>
  );
}

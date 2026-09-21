import Link from 'next/link';
import { APP_VERSION_SHORT } from '@/lib/version';
import { travelpayoutsReferralUrl } from '@/lib/affiliate';
import { PublicTopbar, PublicFooter } from '@/components/PublicChrome';

export const metadata = {
  title: 'About & Docs — FlyCheap',
  description: 'Why we built FlyCheap, how the fare engine works, and how we make money.',
};

export default function AboutPage() {
  return (
    <div className="mk mk-bleed">
      <PublicTopbar
        right={(
          <>
            <Link href="/" className="ed-btn ed-btn-secondary">← Back to site</Link>
            <Link href="/login" prefetch={false} className="ed-btn ed-btn-primary">Try free →</Link>
          </>
        )}
      />

      <section className="mk-section">
        <div className="mk-wrap" style={{ maxWidth: 880 }}>
          <div className="ed-eyebrow">About · The docs</div>
          <h1 className="ed-h1">
            Built so families stop <em>overpaying</em> for flights.
          </h1>
          <p className="ed-sub" style={{ maxWidth: 680 }}>
            FlyCheap is a private fare-watching dashboard that polls 1,000+ airlines
            through live partner APIs and alerts you the moment a price drops below your target.
            Here is exactly how it works, who runs it, and how it makes money.
          </p>

          <div className="ed-legal-list" style={{ marginTop: 24 }}>
            <div className="ed-legal-item">
              <div className="ed-eyebrow">01</div>
              <h3 className="ed-h2" style={{ fontSize: 20, marginTop: 4 }}>How it works</h3>
              <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 10 }}>
                <li><strong>Pick a route + dates.</strong> Add JFK→CAI on July 7, or anything else — any 3-letter IATA pair works.</li>
                <li><strong>A scheduler runs continuously.</strong> Each time it wakes it fans the routes that are due out to Travelpayouts (Aviasales), Duffel, and Google Flights via SerpAPI and SearchAPI in parallel. Cheapest result wins. How often a given route is due depends on how much it matters — close to departure, close to your target, or moving fast means more often.</li>
                <li><strong>Three alert kinds, instant.</strong> Threshold-cross (below your target), price-drop (≥ N% below the 7-day median), and the mistake-fare detector (≥ 3σ below the 30-day mean — the genuine glitches that get pulled within 90 minutes).</li>
                <li><strong>You decide when to book.</strong> We never charge cards. Every deal links straight to the airline / OTA.</li>
              </ol>
            </div>

            <div className="ed-legal-item">
              <div className="ed-eyebrow">02</div>
              <h3 className="ed-h2" style={{ fontSize: 20, marginTop: 4 }}>What makes it different</h3>
              <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 10 }}>
                <li><strong>Multi-provider fan-out.</strong> One search hits four live data providers in parallel. Cheaper than any single OTA quote.</li>
                <li><strong>Mistake-fare detector.</strong> Statistical anomaly detection over your route&apos;s real history — the kind of fares that disappear in under an hour.</li>
                <li><strong>Buy / Hold / Wait recommender.</strong> Per-search z-score + 14-day trend slope. We don&apos;t just show the price; we tell you whether to act.</li>
                <li><strong>Ask FarePilot.</strong> Voice + chat concierge with full read access to your dashboard. &ldquo;Cheapest week in August under $700/adult?&rdquo; — she queries and answers.</li>
                <li><strong>Flex ±3 days.</strong> Every tracked search shows the cheapest pairing within a 3-day window on either side — often saves hundreds.</li>
                <li><strong>Calendar export.</strong> One click drops the cheapest fare&apos;s outbound + return + a 24h reminder into your iCal.</li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <div className="ed-eyebrow">03</div>
              <h3 className="ed-h2" style={{ fontSize: 20, marginTop: 4 }}>Who we are</h3>
              <p>
                Built and run by a small team out of New York. The original use case was an annual
                family trip to Cairo where we kept missing the good fares; the watchlist + alerting
                layer became valuable enough to share, so here it is.
              </p>
              <p style={{ marginTop: 10, color: 'var(--muted-2)', fontSize: '12.5px' }}>
                No banner ads. No selling your data. No third-party tracking pixels. The only outbound
                calls we make are to the airline / OTA APIs the deals come from. We do earn affiliate
                commission on bookings — see <a href="#affiliate-partners">how we make money</a> below.
              </p>
            </div>

            <div className="ed-legal-item">
              <div className="ed-eyebrow">04</div>
              <h3 className="ed-h2" style={{ fontSize: 20, marginTop: 4 }}>Privacy &amp; security</h3>
              <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>Code-based sign-in only — no passwords stored.</li>
                <li>Cookies are <code className="ed-code">httpOnly</code> + <code className="ed-code">Secure</code> + <code className="ed-code">SameSite=Lax</code>; sessions auto-rotate every 30 days.</li>
                <li>Every admin action is recorded in an audit log (who / what / when / diff / IP).</li>
                <li>No credit card data ever touches our servers — Stripe and PayPal handle billing entirely.</li>
              </ul>
            </div>

            <div className="ed-legal-item ed-panel" id="affiliate-partners" style={{ padding: '20px 22px' }}>
              <div className="ed-eyebrow">05</div>
              <h3 className="ed-h2" style={{ fontSize: 20, marginTop: 4 }}>How we make money — affiliate partnerships</h3>
              <p>
                FlyCheap&apos;s free tier is genuinely free. Beyond subscriptions, we partner with a handful
                of established travel booking sites — when you click a <strong>&ldquo;Book →&rdquo;</strong> button
                and complete a booking on their site, they pay us a small commission.
              </p>
              <p style={{ marginTop: 10 }}>
                You pay <strong>exactly the same price</strong> as if you visited the booking site directly —
                the commission comes out of the booking site&apos;s margin, not your wallet. This is the same
                model used by Wirecutter, NerdWallet, and most price-comparison tools.
              </p>
              <h4 className="ed-h2" style={{ fontSize: 15, marginTop: 18 }}>Our current partners</h4>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>
                  <strong><a href={travelpayoutsReferralUrl()} target="_blank" rel="noopener noreferrer">Travelpayouts</a></strong>
                  {' '}— the affiliate network behind Aviasales (1,000+ airline flight metasearch), Hotellook
                  (hotel comparison), and WayAway (cashback flights). Our primary data source for fare polling.
                </li>
                <li>
                  <strong><a href="https://www.trip.com/partners/" target="_blank" rel="noopener noreferrer">Trip.com</a></strong>
                  {' '}— major OTA, especially competitive on Asia routes. Appears in our &ldquo;Book →&rdquo;
                  dropdown and hotel suggestions.
                </li>
              </ul>
              <p style={{ marginTop: 10, color: 'var(--muted-2)', fontSize: '12.5px' }}>
                Stays: hotel links go through Hotellook (Travelpayouts) and Trip.com, which pay a commission. <strong>Airbnb and Vrbo</strong> have no partner programme — those buttons are plain, prefilled searches that earn us nothing; we include them because many travelers prefer homes to hotels.
              </p>
              <p style={{ marginTop: 6, color: 'var(--muted-2)', fontSize: '12.5px' }}>
                Note: Skyscanner appears in our cross-shop dropdown as a price-comparison option, but we are
                <strong> not</strong> currently in their affiliate programme — clicks to Skyscanner earn us nothing.
                We show it because the price comparison is useful to you.
              </p>
              <h4 className="ed-h2" style={{ fontSize: 15, marginTop: 18 }}>What this means for you</h4>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>Every booking link routes through our redirect endpoint <code className="ed-code">/go</code>, which logs the click for accounting and adds partner identifiers to the destination URL.</li>
                <li>We do <strong>not</strong> manipulate fare rankings to favor any partner. The cheapest cached price wins; partner choice is yours.</li>
                <li>You can always book directly with the airline — we include EgyptAir.com, Google Flights, etc. as non-affiliate comparison options. We never hide direct booking.</li>
                <li>More detail in our <Link href="/privacy">Privacy Policy</Link> — the &ldquo;Sharing&rdquo; section covers exactly what each partner sees.</li>
              </ul>
              <p style={{ marginTop: 10, color: 'var(--muted-2)', fontSize: '12.5px' }}>
                FTC disclosure: FlyCheap earns commission on bookings made through our partner links — at no extra cost to you.
              </p>
            </div>
          </div>

          <div className="ed-actions" style={{ justifyContent: 'center', marginTop: 44 }}>
            <Link href="/login" prefetch={false} className="ed-btn ed-btn-primary">Open the dashboard →</Link>
            <Link href="/contact" className="ed-btn ed-btn-secondary">Get in touch</Link>
            <Link href="/status" className="ed-btn ed-btn-secondary">System status</Link>
          </div>
        </div>
      </section>

      <PublicFooter
        left={<>© 2026 FlyCheap · All rights reserved</>}
        right={<>{APP_VERSION_SHORT} · NYC</>}
      />
    </div>
  );
}

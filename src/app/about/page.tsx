import { LogoMark } from '@/components/Logo';
import Link from 'next/link';
import { APP_VERSION_SHORT } from '@/lib/version';
import { travelpayoutsReferralUrl } from '@/lib/affiliate';

export const metadata = {
  title: 'About & Docs — FlyCheap',
  description: 'Why we built FlyCheap, how the fare engine works, and how we make money.',
};

export default function AboutPage() {
  return (
    <div className="fc-landing fc-about -mx-6 -my-8 -mb-24 md:-mb-8" data-fc-theme="ivory" data-fc-accent="gold">
      <header className="fc-l-topbar">
        <Link href="/welcome" className="fc-l-brand">
          <div className="fc-l-brand-mark">
            <LogoMark size={22} />
          </div>
          <div>
            <div className="fc-l-brand-name">FlyCheap</div>
            <div className="fc-l-brand-meta">Fare Intelligence Platform</div>
          </div>
        </Link>
        <div className="fc-l-topbar-right">
          <Link href="/welcome" className="fc-btn fc-btn-light fc-btn-sm">← Back to site</Link>
          <Link href="/login" className="fc-btn fc-btn-ink fc-btn-sm">Try free →</Link>
        </div>
      </header>

      <section className="fc-section" style={{ marginTop: 48, maxWidth: 880, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="fc-smallcaps">About · The docs</div>
        <h1 className="fc-section-title" style={{ marginTop: 10 }}>
          Built so families stop <em>overpaying</em> for flights.
        </h1>
        <p className="fc-section-sub" style={{ maxWidth: 680 }}>
          FlyCheap is a private fare-watching dashboard that polls 1,000+ airlines
          through live partner APIs and alerts you the moment a price drops below your target.
          Here is exactly how it works, who runs it, and how it makes money.
        </p>

        <div className="fc-about-doc">
          <div className="fc-about-block">
            <h2><span className="num">01</span>How it works</h2>
            <ol>
              <li><strong>Pick a route + dates.</strong> Add JFK→CAI on July 7, or anything else — any 3-letter IATA pair works.</li>
              <li><strong>We poll every 5 minutes.</strong> A scheduler fans the search out to Travelpayouts (Aviasales), Duffel, and Google Flights via SerpAPI and SearchAPI in parallel. Cheapest result wins.</li>
              <li><strong>Three alert kinds, instant.</strong> Threshold-cross (below your target), price-drop (≥ N% below the 7-day median), and the mistake-fare detector (≥ 3σ below the 30-day mean — the genuine glitches that get pulled within 90 minutes).</li>
              <li><strong>You decide when to book.</strong> We never charge cards. Every deal links straight to the airline / OTA.</li>
            </ol>
          </div>

          <div className="fc-about-block">
            <h2><span className="num">02</span>What makes it different</h2>
            <ul>
              <li><strong>Multi-provider fan-out.</strong> One search hits four live data providers in parallel. Cheaper than any single OTA quote.</li>
              <li><strong>Mistake-fare detector.</strong> Statistical anomaly detection over your route&apos;s real history — the kind of fares that disappear in under an hour.</li>
              <li><strong>Buy / Hold / Wait recommender.</strong> Per-search z-score + 14-day trend slope. We don&apos;t just show the price; we tell you whether to act.</li>
              <li><strong>Ask FarePilot.</strong> Voice + chat concierge with full read access to your dashboard. &ldquo;Cheapest week in August under $700/adult?&rdquo; — she queries and answers.</li>
              <li><strong>Flex ±3 days.</strong> Every tracked search shows the cheapest pairing within a 3-day window on either side — often saves hundreds.</li>
              <li><strong>Calendar export.</strong> One click drops the cheapest fare&apos;s outbound + return + a 24h reminder into your iCal.</li>
            </ul>
          </div>

          <div className="fc-about-block">
            <h2><span className="num">03</span>Who we are</h2>
            <p>
              Built and run by a small team out of New York. The original use case was an annual
              family trip to Cairo where we kept missing the good fares; the watchlist + alerting
              layer became valuable enough to share, so here it is.
            </p>
            <p className="dim">
              No banner ads. No selling your data. No third-party tracking pixels. The only outbound
              calls we make are to the airline / OTA APIs the deals come from. We do earn affiliate
              commission on bookings — see <a href="#affiliate-partners">how we make money</a> below.
            </p>
          </div>

          <div className="fc-about-block">
            <h2><span className="num">04</span>Privacy &amp; security</h2>
            <ul>
              <li>Code-based sign-in only — no passwords stored.</li>
              <li>Cookies are <code>httpOnly</code> + <code>Secure</code> + <code>SameSite=Lax</code>; sessions auto-rotate every 30 days.</li>
              <li>Every admin action is recorded in an audit log (who / what / when / diff / IP).</li>
              <li>No credit card data ever touches our servers — Stripe and PayPal handle billing entirely.</li>
            </ul>
          </div>

          <div className="fc-about-block gold" id="affiliate-partners">
            <h2><span className="num">05</span>How we make money — affiliate partnerships</h2>
            <p>
              FlyCheap&apos;s free tier is genuinely free. Beyond subscriptions, we partner with a handful
              of established travel booking sites — when you click a <strong>&ldquo;Book →&rdquo;</strong> button
              and complete a booking on their site, they pay us a small commission.
            </p>
            <p>
              You pay <strong>exactly the same price</strong> as if you visited the booking site directly —
              the commission comes out of the booking site&apos;s margin, not your wallet. This is the same
              model used by Wirecutter, NerdWallet, and most price-comparison tools.
            </p>
            <h3>Our current partners</h3>
            <ul>
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
            <p className="dim small">
              Stays: hotel links go through Hotellook (Travelpayouts) and Trip.com, which pay a commission. <strong>Airbnb and Vrbo</strong> have no partner programme — those buttons are plain, prefilled searches that earn us nothing; we include them because many travelers prefer homes to hotels.
            </p>
            <p className="dim small">
              Note: Skyscanner appears in our cross-shop dropdown as a price-comparison option, but we are
              <strong> not</strong> currently in their affiliate programme — clicks to Skyscanner earn us nothing.
              We show it because the price comparison is useful to you.
            </p>
            <h3>What this means for you</h3>
            <ul>
              <li>Every booking link routes through our redirect endpoint <code>/go</code>, which logs the click for accounting and adds partner identifiers to the destination URL.</li>
              <li>We do <strong>not</strong> manipulate fare rankings to favor any partner. The cheapest cached price wins; partner choice is yours.</li>
              <li>You can always book directly with the airline — we include EgyptAir.com, Google Flights, etc. as non-affiliate comparison options. We never hide direct booking.</li>
              <li>More detail in our <Link href="/privacy">Privacy Policy</Link> — the &ldquo;Sharing&rdquo; section covers exactly what each partner sees.</li>
            </ul>
            <p className="dim small">
              FTC disclosure: FlyCheap earns commission on bookings made through our partner links — at no extra cost to you.
            </p>
          </div>
        </div>

        <div className="fc-hero-cta" style={{ justifyContent: 'center', marginTop: 44 }}>
          <Link href="/login" className="fc-btn fc-btn-gold">Open the dashboard →</Link>
          <Link href="/contact" className="fc-btn fc-btn-light">Get in touch</Link>
          <Link href="/status" className="fc-btn fc-btn-light">System status</Link>
        </div>
      </section>

      <footer className="fc-l-footer" style={{ marginTop: 72 }}>
        <div className="fc-l-footer-legal" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div>© 2026 FlyCheap · All rights reserved</div>
          <div>{APP_VERSION_SHORT} · NYC</div>
        </div>
      </footer>
    </div>
  );
}

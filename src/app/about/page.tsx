import Link from 'next/link';
import { APP_VERSION_SHORT } from '@/lib/version';
import { travelpayoutsReferralUrl } from '@/lib/affiliate';
import { PublicTopbar, PublicFooter } from '@/components/PublicChrome';
import { getPublicMetrics } from '@/lib/public-metrics';
import { deliverableChannels } from '@/lib/channelHealth';
import { tierChannels, channelSentence } from '@/lib/tierCopy';
import { COOKIE_MAX_AGE_SEC, DEVICE_MAX_AGE_SEC } from '@/lib/auth';
import { TIER_LIMITS } from '@/lib/db';
import { affiliatePartners } from '@/lib/publicDisclosures';

// Every number and every "we use X" on this page is read from the running
// system (public-metrics, channelHealth, TIER_LIMITS, env gates), so the page
// is rendered per request rather than baked at build time.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'About & Docs — FlyCheap',
  description: 'Why we built FlyCheap, how the fare engine works, and how we make money.',
};

const PROVIDER_LABEL: Record<string, string> = {
  travelpayouts: 'Travelpayouts (Aviasales)', amadeus: 'Amadeus', duffel: 'Duffel', kiwi: 'Kiwi',
  serpapi: 'Google Flights via SerpAPI', searchapi: 'Google Flights via SearchAPI',
};
const listOf = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export default function AboutPage() {
  // Derived, never typed. `providersConfigured` is the ENABLED-and-keyed set,
  // not the integrations that merely exist — see public-metrics.ts.
  const m = getPublicMetrics();
  const enabled = m.providersConfigured.map(id => PROVIDER_LABEL[id] ?? id);
  const providerSentence = enabled.length > 0
    ? `Each time it wakes it fans the routes that are due out to the fare providers enabled right now — ${listOf(enabled)} — and the cheapest valid offer wins.`
    : 'Each time it wakes it fans the routes that are due out to the enabled fare providers, and the cheapest valid offer wins.';
  const fanout = enabled.length > 1
    ? `${enabled.length} providers are enabled today and every search hits all of them in parallel.`
    : m.providersTotal > 0
      ? `${m.providersTotal} provider integrations are built in; the ones enabled in Settings are searched in parallel and the cheapest valid offer wins.`
      : 'The provider integrations enabled in Settings are searched in parallel and the cheapest valid offer wins.';
  const deliverable = deliverableChannels();
  const paidChannels = channelSentence(tierChannels('pro', deliverable));
  const freeChannels = channelSentence(tierChannels('free', deliverable));
  const sessionDays = Math.round(COOKIE_MAX_AGE_SEC / 86_400);
  const deviceDays = Math.round(DEVICE_MAX_AGE_SEC / 86_400);
  const freeRoutes = TIER_LIMITS.free.maxRoutes;
  const partners = affiliatePartners();
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
            FlyCheap is a private fare-watching dashboard that polls airline fares
            through live partner APIs and alerts you the moment a price drops below your target.
            Here is exactly how it works, who runs it, and how it makes money.
          </p>

          <div className="ed-legal-list" style={{ marginTop: 24 }}>
            <div className="ed-legal-item">
              <div className="ed-eyebrow">01</div>
              <h3 className="ed-h2" style={{ fontSize: 20, marginTop: 4 }}>How it works</h3>
              <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 10 }}>
                <li><strong>Pick a route + dates.</strong> Add JFK→CAI on July 7, or anything else — any 3-letter IATA pair works.</li>
                <li><strong>A scheduler runs continuously.</strong> {providerSentence} How often a given route is due depends on how much it matters — close to departure, close to your target, or moving fast means more often.</li>
                <li><strong>Two alert triggers.</strong> Threshold-cross (the fare lands at or below your target) and price-drop (the fare falls more than your drop percentage below the route&apos;s own recent median — you set the percentage in Settings). Alerts go out by {freeChannels} on Free and by {paidChannels} on paid plans.</li>
                <li><strong>You decide when to book.</strong> We never charge cards. Every deal links straight to the airline / OTA.</li>
              </ol>
            </div>

            <div className="ed-legal-item">
              <div className="ed-eyebrow">02</div>
              <h3 className="ed-h2" style={{ fontSize: 20, marginTop: 4 }}>What makes it different</h3>
              <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 10 }}>
                <li><strong>Provider fan-out.</strong> {fanout} Every fare snapshot is tagged with the provider it came from.</li>
                <li><strong>Buy / Hold / Wait verdict.</strong> Plain rules over your route&apos;s own history (where today&apos;s fare sits against its median, and which way it is trending) blended with a small model trained nightly on our polling data. Every verdict shows its inputs on the <Link href="/model">Model</Link> page.</li>
                <li><strong>Ask FarePilot.</strong> Voice + chat concierge with read access to your dashboard. &ldquo;Cheapest week in August under $700/adult?&rdquo; — it queries your data and answers.</li>
                <li><strong>Date windows.</strong> A watch can be an exact pair of dates or a departure window with a range of trip lengths; we price the pairings inside it and surface the cheapest.</li>
                <li><strong>Calendar export.</strong> One click drops the cheapest fare&apos;s outbound + return + a 24h reminder into your iCal.</li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <div className="ed-eyebrow">03</div>
              <h3 className="ed-h2" style={{ fontSize: 20, marginTop: 4 }}>Who we are</h3>
              <p>
                Built and run by Myron Mekhael, sole proprietor, in New York. The original use case was an annual
                family trip to Cairo where we kept missing the good fares; the watchlist + alerting
                layer became valuable enough to share, so here it is.
              </p>
              <p style={{ marginTop: 10, color: 'var(--muted-2)', fontSize: '12.5px' }}>
                No banner ads. No selling your data. No third-party tracking pixels — usage analytics are
                first-party. The <Link href="/privacy">Privacy Policy</Link> names every outside service
                that sees any of your data (fare providers, email, billing, the AI assistant). We do earn
                affiliate commission on bookings — see <a href="#affiliate-partners">how we make money</a> below.
              </p>
            </div>

            <div className="ed-legal-item">
              <div className="ed-eyebrow">04</div>
              <h3 className="ed-h2" style={{ fontSize: 20, marginTop: 4 }}>Privacy &amp; security</h3>
              <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>Code-based sign-in only — no passwords stored.</li>
                <li>Cookies are <code className="ed-code">httpOnly</code> + <code className="ed-code">Secure</code> + <code className="ed-code">SameSite=Lax</code>; a session expires after {sessionDays} days, and an optional device cookie lets you skip the code for {deviceDays} days.</li>
                <li>Admin actions are recorded in an audit log (who / what / when / old and new values / IP).</li>
                <li>No card data, no billing, no payment processor — FlyCheap is free and open source, and there is nothing to charge for.</li>
              </ul>
            </div>

            <div className="ed-legal-item ed-panel" id="affiliate-partners" style={{ padding: '20px 22px' }}>
              <div className="ed-eyebrow">05</div>
              <h3 className="ed-h2" style={{ fontSize: 20, marginTop: 4 }}>How we make money — affiliate partnerships</h3>
              <p>
                FlyCheap&apos;s free tier is genuinely free ({freeRoutes} tracked routes, no card). Beyond subscriptions, we partner with a handful
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
                {partners.map(p => (
                  <li key={p.name}>
                    <strong><a href={p.name === 'Travelpayouts' ? travelpayoutsReferralUrl() : p.href} target="_blank" rel="noopener noreferrer">{p.name}</a></strong>
                    {' '}— {p.note}{p.name === 'Travelpayouts' ? '. Also our primary data source for fare polling' : ''}.
                  </li>
                ))}
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

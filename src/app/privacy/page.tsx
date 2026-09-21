import type { Metadata } from 'next';
import Link from 'next/link';
import { travelpayoutsReferralUrl } from '@/lib/affiliate';
import { PublicTopbar, PublicFooter } from '@/components/PublicChrome';

export const metadata: Metadata = {
  title: 'Privacy Policy · FlyCheap',
  description: 'How FlyCheap (flycheap.live) collects and uses your data.',
};

export default function PrivacyPage() {
  const lastUpdated = '2026-05-12';

  return (
    <div className="mk mk-bleed">
      <PublicTopbar right={<Link href="/" className="ed-btn ed-btn-secondary">← Back to site</Link>} />

      <section className="mk-section">
        <div className="mk-wrap" style={{ maxWidth: 720 }}>
          <div className="ed-eyebrow">Legal · Last updated {lastUpdated}</div>
          <h1 className="ed-h1">Privacy <em>policy</em>.</h1>
          <p className="ed-sub" style={{ maxWidth: 640 }}>
            FlyCheap (the &quot;Service&quot;, available at{' '}
            <a href="https://flycheap.live">flycheap.live</a>) is operated by Myron Mekhael
            (sole proprietor, New York, USA) and is a fare-monitoring tool that lets you track
            flight prices across 1,000+ airlines and notifies you when fares drop on routes you
            choose. This page explains what data we collect, why, and how it&apos;s used.
          </p>

          <div className="ed-legal-list">
            <div className="ed-legal-item">
              <h3>What we collect</h3>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>
                  <strong>Tracked routes you create:</strong> origin, destination, target
                  price, date windows, and adult/infant counts. We need these to poll
                  fares for the routes you care about.
                </li>
                <li>
                  <strong>Account info (if you sign in):</strong> email address. We use
                  it to send fare alerts and account-related notifications.
                </li>
                <li>
                  <strong>Click logs:</strong> when you click a &quot;Book&quot; button
                  we record an anonymous click token, the route, IP address, and user
                  agent. This is used to attribute affiliate revenue and detect abuse.
                </li>
                <li>
                  <strong>Marketing attribution:</strong> if you arrived from a social
                  post that included a tracking marker in the URL, we store that
                  marker in a cookie for up to 30 days so we can attribute any
                  subsequent booking to the post that referred you.
                </li>
                <li>
                  <strong>Standard server logs:</strong> request paths, response codes,
                  and timing — used to diagnose outages and improve performance. Logs
                  are retained for up to 30 days.
                </li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3>What we do NOT collect</h3>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>Payment or credit-card data — bookings happen entirely on the airline / OTA site you select.</li>
                <li>Passport or government-ID data.</li>
                <li>Location data beyond the IP-derived country/city used for routing and abuse detection.</li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3>How we use it</h3>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>To poll airline / fare-aggregator APIs (Travelpayouts, Aviasales, Kiwi, others) for the routes you track.</li>
                <li>To send you price-drop notifications by email.</li>
                <li>To attribute affiliate revenue back to specific marketing campaigns and partners.</li>
                <li>To keep the service running and prevent abuse.</li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3>Sharing</h3>
              <p>
                We don&apos;t sell your personal data. We share data with the following
                categories of third parties strictly to operate the Service:
              </p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>
                  <strong>Fare-data partners</strong> (
                  <a href={travelpayoutsReferralUrl()} target="_blank" rel="noopener noreferrer">
                    Travelpayouts
                  </a>
                  , Aviasales, Kiwi, and similar) — we forward route queries to them so
                  they can return fares. They receive the route parameters only, not
                  your email or account ID.
                </li>
                <li>
                  <strong>Affiliate networks</strong> — when you click &quot;Book&quot;
                  or &ldquo;Compare on&rdquo;, you&apos;re sent to the partner site with
                  a click token + an attribution marker. The token lets us correlate
                  any later commission payment back to your click. Current affiliate
                  partners (see also our <Link href="/about#affiliate-partners">About page</Link>):
                  <ul style={{ margin: '8px 0 0 24px', display: 'grid', gap: 6, fontSize: 13.5 }}>
                    <li>
                      <strong>
                        <a href={travelpayoutsReferralUrl()} target="_blank" rel="noopener noreferrer">
                          Travelpayouts
                        </a>
                      </strong>{' '}
                      — covers Aviasales (flights), Hotellook (hotels), WayAway (cashback flights). Our affiliate marker: <code>727998</code>.
                    </li>
                    <li>
                      <strong>
                        <a href="https://www.trip.com/partners/" target="_blank" rel="noopener noreferrer">
                          Trip.com Partners
                        </a>
                      </strong>{' '}
                      — flight + hotel bookings, especially competitive on Asia routes. Our Alliance ID: <code>8227801</code>.
                    </li>
                  </ul>
                  <p style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
                    You pay exactly the same price as if you visited the partner site directly — commission comes from the partner&apos;s margin, not your wallet.
                  </p>
                </li>
                <li>
                  <strong>Infrastructure providers</strong> (VPSie for hosting,
                  Cloudflare for DNS, Resend or similar for transactional email,
                  Anthropic for AI-generated copy in marketing posts) — they only see
                  data they need to deliver the underlying service.
                </li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3>Cookies</h3>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li><code>fareintel_session</code> — your signed-in session (httpOnly, 30 days).</li>
                <li><code>fc_marker</code> — your most recent inbound marketing marker (30 days). Used only for affiliate attribution. No personal info.</li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3>Your rights</h3>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li><strong>Access / delete:</strong> sign in, delete your tracked searches, or close your account from Settings. Account closure removes your email, searches, and alert preferences within 30 days.</li>
                <li><strong>Opt out of marketing emails:</strong> every alert email has a one-click unsubscribe link.</li>
                <li><strong>Contact:</strong> for any privacy question, email <a href="mailto:privacy@flycheap.live">privacy@flycheap.live</a>.</li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3>Children</h3>
              <p>
                The Service is not directed at children under 13. We don&apos;t
                knowingly collect data from them. If you believe a child has provided
                us with data, contact us and we&apos;ll delete it.
              </p>
            </div>

            <div className="ed-legal-item">
              <h3>Changes</h3>
              <p>
                If we make material changes, we&apos;ll update the &quot;Last updated&quot;
                date at the top of this page and, if you have an account, notify you
                by email before the change takes effect.
              </p>
            </div>
          </div>

          <p className="ed-panel-note" style={{ marginTop: 28 }}>
            Operated by the FlyCheap team. Questions:{' '}
            <a href="mailto:privacy@flycheap.live">privacy@flycheap.live</a>.
          </p>
        </div>
      </section>

      <PublicFooter left={<span>© FlyCheap</span>} right={<Link href="/terms">Terms</Link>} />
    </div>
  );
}

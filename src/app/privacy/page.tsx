import type { Metadata } from 'next';
import Link from 'next/link';
import { travelpayoutsReferralUrl } from '@/lib/affiliate';

export const metadata: Metadata = {
  title: 'Privacy Policy · FlyCheap',
  description: 'How FlyCheap (flycheap.live) collects and uses your data.',
};

export default function PrivacyPage() {
  const lastUpdated = '2026-09-27';

  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="ed-eyebrow">Legal · Last updated {lastUpdated}</div>
      <h1 className="ed-h1">Privacy <em>policy</em>.</h1>
      <p className="ed-sub" style={{ maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' }}>
            FlyCheap (the &quot;Service&quot;, available at{' '}
            <a href="https://flycheap.live">flycheap.live</a>) is operated by Myron Mekhael
            (sole proprietor, New York, USA) and is a fare-monitoring tool that tracks flight
            prices on the routes you choose and notifies you when they drop. This page explains
            what data we collect, why, and where it goes.
          </p>

          <div className="ed-legal-list">
            <div className="ed-legal-item">
              <h3 className="text-center">What we collect</h3>
              <ul className="text-left" style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>
                  <strong>Tracked routes you create:</strong> origin, destination, target
                  price, date windows, and adult/infant counts. We need these to poll
                  fares for the routes you care about.
                </li>
                <li>
                  <strong>Account info (if you sign in):</strong> your email address.
                  Sign-in is passwordless — we email you a one-time link or code; we never
                  ask for or store a password.
                </li>
                <li>
                  <strong>Click logs:</strong> when you click a &quot;Book&quot; button we
                  record a click token, the route, your account (if you&apos;re signed in),
                  your IP address, and browser. Only the token — never your email or
                  account — is passed on to the affiliate partner.
                </li>
                <li>
                  <strong>Usage analytics:</strong> as you use the site we log page views,
                  clicks, form interactions, and roughly how you move the pointer, tied to a
                  session ID kept in your browser, your IP address and browser, and — if
                  you&apos;re signed in — your account. This helps us find broken flows and
                  slow pages. We never log what you type into a password or email field.
                </li>
                <li>
                  <strong>The AI flight-chat assistant:</strong> if you use it (web or app),
                  your message and our reply are sent to whichever AI provider is available
                  at that moment — Anthropic, and depending on availability Groq, OpenAI,
                  OpenRouter, Google Gemini, or Cloudflare Workers AI — to generate the
                  answer, and we keep a copy of the exchange tied to your account.
                </li>
                <li>
                  <strong>Support requests:</strong> if you contact us (in-app or by email),
                  we keep the message thread so we can help you and follow up.
                </li>
                <li>
                  <strong>Marketing attribution:</strong> if you follow a link that includes
                  a tracking marker from one of our posts, we forward that marker to the
                  affiliate partner when you click &quot;Book&quot;, so we can attribute a
                  resulting booking to that post.
                </li>
                <li>
                  <strong>Standard server logs:</strong> request paths, response codes, and
                  timing — used to diagnose outages and improve performance.
                </li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3 className="text-center">What we do NOT collect</h3>
              <ul className="text-left" style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>
                  Your card number or bank details. Subscription payments run through
                  Stripe&apos;s own checkout page — we only ever see a customer/subscription
                  ID and status, never your card. Flight bookings happen entirely on the
                  airline or travel site you choose.
                </li>
                <li>Passport or government-ID data.</li>
                <li>
                  Precise (GPS) location. We do log IP addresses (see above), which can hint
                  at your general location, but we don&apos;t run any location lookup on them
                  ourselves.
                </li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3 className="text-center">How we use it</h3>
              <ul className="text-left" style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>To query flight-data providers (Travelpayouts/Aviasales, Duffel, Google Flights, Amadeus, Kiwi, and others) for the routes you track.</li>
                <li>To send you price-drop notifications by email.</li>
                <li>To process your subscription payment, through Stripe.</li>
                <li>To attribute affiliate revenue back to the right partner and campaign.</li>
                <li>To power the AI flight-chat assistant, if you use it.</li>
                <li>To keep the service running, debug problems, and prevent abuse.</li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3 className="text-center">Sharing</h3>
              <p>
                We don&apos;t sell your personal data. We share it only with the following,
                and only what each needs to do its job:
              </p>
              <ul className="text-left" style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>
                  <strong>Fare-data partners</strong> (
                  <a href={travelpayoutsReferralUrl()} target="_blank" rel="noopener noreferrer">
                    Travelpayouts
                  </a>
                  , Duffel, and others) — we forward route parameters only, never your
                  email or account ID.
                </li>
                <li>
                  <strong>Affiliate networks</strong> — when you click &quot;Book&quot;
                  or &ldquo;Compare on&rdquo;, you&apos;re sent to the partner site with
                  a click token and, if present, an attribution marker. This lets us match
                  any later commission payment back to your click. Current affiliate
                  partners (see also our <Link href="/about#affiliate-partners">About page</Link>):
                  <ul className="text-left" style={{ margin: '8px 0 0 24px', display: 'grid', gap: 6, fontSize: 13.5 }}>
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
                      — flight and hotel bookings. We&apos;re a registered Trip.com affiliate; our partner ID is on file with Trip.com.
                    </li>
                  </ul>
                  <p style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
                    You pay exactly the same price as if you visited the partner site directly — commission comes from the partner&apos;s margin, not your wallet.
                  </p>
                </li>
                <li>
                  <strong>AI providers</strong> — Anthropic, and depending on availability
                  Groq, OpenAI, OpenRouter, Google Gemini, or Cloudflare Workers AI, see
                  messages you send the flight-chat assistant, and Anthropic also generates
                  some of the copy in our marketing posts.
                </li>
                <li>
                  <strong>Slack (internal)</strong> — when you sign up or delete your
                  account, a short alert including your email and IP address posts to our
                  own private team channel, so we can watch for abuse. Only our team can
                  see it.
                </li>
                <li>
                  <strong>Infrastructure providers</strong> (Resend for transactional email,
                  our hosting provider, and Stripe for billing) — they only see what they
                  need to deliver that specific service.
                </li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3 className="text-center">Cookies and browser storage</h3>
              <ul className="text-left" style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li><code>fareintel_session</code> — keeps you signed in (httpOnly, 30 days).</li>
                <li><code>fareintel_device</code> — remembers your device so you can skip the sign-in code next time (httpOnly, 90 days).</li>
                <li><code>fc-theme</code> — remembers your light/dark preference (1 year). Not personal data.</li>
                <li>A telemetry session ID is kept in your browser&apos;s local storage (not a cookie) so we can group your usage events together — see &quot;Usage analytics&quot; above.</li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3 className="text-center">Your rights</h3>
              <ul className="text-left" style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li>
                  <strong>Access / delete:</strong> sign in to delete individual tracked
                  searches any time, or permanently delete your account from Settings →
                  Danger zone. This removes your account, tracked routes, and fare history
                  immediately. Some records that include your email or IP address — such as
                  sign-in history and security logs — may still exist afterward; email us if
                  you&apos;d like those erased too.
                </li>
                <li><strong>Opt out of alert emails:</strong> every alert email has a one-click unsubscribe link.</li>
                <li><strong>Contact:</strong> for any privacy question or request, email <a href="mailto:support@flycheap.live">support@flycheap.live</a>.</li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3 className="text-center">Children</h3>
              <p>
                The Service is not directed at children under 13. We don&apos;t
                knowingly collect data from them. If you believe a child has provided
                us with data, contact us and we&apos;ll delete it.
              </p>
            </div>

            <div className="ed-legal-item">
              <h3 className="text-center">Changes</h3>
              <p>
                If we make material changes, we&apos;ll update the &quot;Last updated&quot;
                date at the top of this page.
              </p>
            </div>
          </div>

      <p className="ed-panel-note" style={{ marginTop: 28 }}>
        Operated by Myron Mekhael, sole proprietor. Questions:{' '}
        <a href="mailto:support@flycheap.live">support@flycheap.live</a>.
      </p>
    </div>
  );
}

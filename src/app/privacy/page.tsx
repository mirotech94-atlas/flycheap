import type { Metadata } from 'next';
import Link from 'next/link';
import { travelpayoutsReferralUrl } from '@/lib/affiliate';
import { enabledFareProviders, configuredAiProviders, paymentProcessors, alertChannelSentences, alertCarriers, affiliatePartners, listOf } from '@/lib/publicDisclosures';
import { COOKIE_MAX_AGE_SEC, DEVICE_MAX_AGE_SEC } from '@/lib/auth';

// Vendor and channel lists below are read from the deployment per request,
// so this page cannot name a processor, AI vendor or provider we do not use.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Privacy Policy · FlyCheap',
  description: 'How FlyCheap (flycheap.live) collects and uses your data.',
};

export default function PrivacyPage() {
  const lastUpdated = '2026-09-27';
  const providers = enabledFareProviders();
  const providerList = providers.labels.length ? listOf(providers.labels) : 'the fare providers enabled at the time';
  const ai = configuredAiProviders();
  const aiList = ai.length ? listOf(ai) : 'the AI provider configured at the time';
  const processors = listOf(paymentProcessors());
  const channels = alertChannelSentences();
  const carriers = alertCarriers();
  const partners = affiliatePartners();
  const sessionDays = Math.round(COOKIE_MAX_AGE_SEC / 86_400);
  const deviceDays = Math.round(DEVICE_MAX_AGE_SEC / 86_400);

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
                  <strong>Alert contact details (only if you turn that channel on):</strong> a
                  phone number for SMS alerts, a Telegram chat ID for Telegram alerts, and a
                  push token for the mobile app. Each is stored only while that channel is
                  enabled.
                </li>
                <li>
                  <strong>Early-access sign-up:</strong> if you join the waitlist we keep the
                  name, email, optional phone number and home airport you enter, a referral
                  code, and the IP address the request came from.
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
                  your message and our reply are sent to whichever of our configured AI
                  providers is available at that moment — currently {aiList} — to generate
                  the answer, and we keep a copy of the exchange tied to your account.
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
                <li>To query the flight-data providers enabled at the time — currently {providerList} — for the routes you track. Providers receive route parameters only.</li>
                <li>To send you fare alerts: by {channels.free} on the Free plan, and by {channels.paid} on paid plans if you enable those channels.</li>
                <li>To process your subscription payment, through {processors}.</li>
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
                  {providers.labels.length > 1 ? ` and the other providers enabled at the time — currently ${listOf(providers.labels)}` : ' — the only provider enabled right now'}) — we forward route parameters only, never your
                  email or account ID.
                </li>
                <li>
                  <strong>Affiliate networks</strong> — when you click &quot;Book&quot;
                  or &ldquo;Compare on&rdquo;, you&apos;re sent to the partner site with
                  a click token and, if present, an attribution marker. This lets us match
                  any later commission payment back to your click. Current affiliate
                  partners (see also our <Link href="/about#affiliate-partners">About page</Link>):
                  <ul className="text-left" style={{ margin: '8px 0 0 24px', display: 'grid', gap: 6, fontSize: 13.5 }}>
                    {partners.map(p => (
                      <li key={p.name}>
                        <strong>
                          <a href={p.name === 'Travelpayouts' ? travelpayoutsReferralUrl() : p.href} target="_blank" rel="noopener noreferrer">{p.name}</a>
                        </strong>{' '}
                        — {p.note}.
                      </li>
                    ))}
                  </ul>
                  <p style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
                    You pay exactly the same price as if you visited the partner site directly — commission comes from the partner&apos;s margin, not your wallet.
                  </p>
                </li>
                <li>
                  <strong>AI providers</strong> — {aiList} — see messages you send the
                  flight-chat assistant. The same providers also draft some of the copy in
                  our own marketing posts, which contains no customer data.
                </li>
                <li>
                  <strong>Slack (internal)</strong> — when you sign up or delete your
                  account, a short notice including your email and IP address posts to our
                  own private team channel, so we can watch for abuse; subscription events
                  (started, payment received or failed, cancelled) post your email and the
                  amount. Only our team can see it.
                </li>
                <li>
                  <strong>Infrastructure providers</strong> ({listOf([...carriers, `${processors} for billing`, 'our hosting provider'])}) — they only see what they
                  need to deliver that specific service.
                </li>
              </ul>
            </div>

            <div className="ed-legal-item">
              <h3 className="text-center">Cookies and browser storage</h3>
              <ul className="text-left" style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li><code>fareintel_session</code> — keeps you signed in (httpOnly, {sessionDays} days).</li>
                <li><code>fareintel_device</code> — remembers your device so you can skip the sign-in code next time (httpOnly, {deviceDays} days).</li>
                <li><code>fc-theme</code> — remembers your light/dark preference (1 year; also mirrored in local storage). Not personal data.</li>
                <li><code>fc_lang</code> — remembers the language you picked (1 year). Not personal data.</li>
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
                  immediately, along with your sessions, settings, chat history, click logs
                  and usage events. A few records that include your email or IP address can
                  remain afterward — expired sign-in links and codes, support tickets you
                  opened, an early-access waitlist entry, and server logs — email us if
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

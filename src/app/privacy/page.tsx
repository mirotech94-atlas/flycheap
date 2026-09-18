import type { Metadata } from 'next';
import { travelpayoutsReferralUrl } from '@/lib/affiliate';

export const metadata: Metadata = {
  title: 'Privacy Policy · FlyCheap',
  description: 'How FlyCheap (flycheap.live) collects and uses your data.',
};

export default function PrivacyPage() {
  const lastUpdated = '2026-05-12';

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[15px] leading-relaxed text-neutral-200">
      <h1 className="font-display text-3xl font-semibold text-white">Privacy Policy</h1>
      <p className="mt-2 text-sm text-neutral-400">Last updated: {lastUpdated}</p>

      <p className="mt-8">
        FlyCheap (the &quot;Service&quot;, available at{' '}
        <a className="underline" href="https://flycheap.live">flycheap.live</a>)
        is operated by Myron Mekhael (sole proprietor, New York, USA) and is a fare-monitoring tool that lets you track flight prices across
        1,000+ airlines and notifies you when fares drop on routes you choose.
        This page explains what data we collect, why, and how it&apos;s used.
      </p>

      <h2 className="mt-10 font-display text-xl font-semibold text-white">What we collect</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
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

      <h2 className="mt-10 font-display text-xl font-semibold text-white">What we do NOT collect</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>Payment or credit-card data — bookings happen entirely on the airline / OTA site you select.</li>
        <li>Passport or government-ID data.</li>
        <li>Location data beyond the IP-derived country/city used for routing and abuse detection.</li>
      </ul>

      <h2 className="mt-10 font-display text-xl font-semibold text-white">How we use it</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>To poll airline / fare-aggregator APIs (Travelpayouts, Aviasales, Kiwi, others) for the routes you track.</li>
        <li>To send you price-drop notifications by email.</li>
        <li>To attribute affiliate revenue back to specific marketing campaigns and partners.</li>
        <li>To keep the service running and prevent abuse.</li>
      </ul>

      <h2 className="mt-10 font-display text-xl font-semibold text-white">Sharing</h2>
      <p className="mt-3">
        We don&apos;t sell your personal data. We share data with the following
        categories of third parties strictly to operate the Service:
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>
          <strong>Fare-data partners</strong> (
          <a
            href={travelpayoutsReferralUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted"
          >
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
          partners (see also our{' '}
          <a href="/about#affiliate-partners" className="underline">About page</a>):
          <ul className="mt-2 ml-6 list-disc space-y-1 text-sm">
            <li>
              <strong>
                <a
                  href={travelpayoutsReferralUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted"
                >
                  Travelpayouts
                </a>
              </strong>{' '}
              — covers Aviasales (flights), Hotellook (hotels), WayAway (cashback flights). Our affiliate marker: <code>727998</code>.
            </li>
            <li>
              <strong>
                <a
                  href="https://www.trip.com/partners/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted"
                >
                  Trip.com Partners
                </a>
              </strong>{' '}
              — flight + hotel bookings, especially competitive on Asia routes. Our Alliance ID: <code>8227801</code>.
            </li>
          </ul>
          <p className="mt-2 text-sm text-neutral-400">
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

      <h2 className="mt-10 font-display text-xl font-semibold text-white">Cookies</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li><code className="text-xs">fareintel_session</code> — your signed-in session (httpOnly, 30 days).</li>
        <li><code className="text-xs">fc_marker</code> — your most recent inbound marketing marker (30 days). Used only for affiliate attribution. No personal info.</li>
      </ul>

      <h2 className="mt-10 font-display text-xl font-semibold text-white">Your rights</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li><strong>Access / delete:</strong> sign in, delete your tracked searches, or close your account from Settings. Account closure removes your email, searches, and alert preferences within 30 days.</li>
        <li><strong>Opt out of marketing emails:</strong> every alert email has a one-click unsubscribe link.</li>
        <li><strong>Contact:</strong> for any privacy question, email <a className="underline" href="mailto:privacy@flycheap.live">privacy@flycheap.live</a>.</li>
      </ul>

      <h2 className="mt-10 font-display text-xl font-semibold text-white">Children</h2>
      <p className="mt-3">
        The Service is not directed at children under 13. We don&apos;t
        knowingly collect data from them. If you believe a child has provided
        us with data, contact us and we&apos;ll delete it.
      </p>

      <h2 className="mt-10 font-display text-xl font-semibold text-white">Changes</h2>
      <p className="mt-3">
        If we make material changes, we&apos;ll update the &quot;Last updated&quot;
        date at the top of this page and, if you have an account, notify you
        by email before the change takes effect.
      </p>

      <p className="mt-12 text-sm text-neutral-500">
        Operated by the FlyCheap team. Questions:{' '}
        <a className="underline" href="mailto:privacy@flycheap.live">privacy@flycheap.live</a>.
      </p>
    </main>
  );
}

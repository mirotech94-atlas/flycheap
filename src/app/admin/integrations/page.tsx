import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

// What ENV-derived API keys/integrations to display health for. Stays in sync
// with the providers we actually call in src/lib/providers.ts and elsewhere.
const INTEGRATIONS = [
  { name: 'Travelpayouts (data API)',  env: 'TRAVELPAYOUTS_TOKEN',     category: 'Flight data' },
  { name: 'Travelpayouts (stats API)', env: 'TRAVELPAYOUTS_API_TOKEN', category: 'Flight data' },
  { name: 'Travelpayouts (marker)',    env: 'TRAVELPAYOUTS_MARKER',    category: 'Flight data' },
  { name: 'Amadeus',                   env: 'AMADEUS_CLIENT_ID',       category: 'Flight data' },
  { name: 'Duffel',                    env: 'DUFFEL_API_KEY',          category: 'Flight data' },
  { name: 'SerpAPI (Google Flights)',  env: 'SERPAPI_KEY',             category: 'Flight data' },
  // Hotellook is part of Travelpayouts — it uses TRAVELPAYOUTS_MARKER for
  // affiliate links and TRAVELPAYOUTS_TOKEN for the data API. No separate key.
  { name: 'Hotellook (uses Travelpayouts marker)', env: 'TRAVELPAYOUTS_MARKER',  category: 'Hotels' },
  // Booking.com Affiliate Partner Programme — sign up at
  // https://partner.booking.com/en-us/affiliate-program. The /go redirect
  // accepts either BOOKING_AID (server-side) or NEXT_PUBLIC_BOOKING_AID
  // (client-readable, used by HotelsGrid chips). Setting either populates
  // ?aid= on outbound booking.com URLs.
  { name: 'Booking.com (affiliate)',  env: 'NEXT_PUBLIC_BOOKING_AID',    category: 'Hotels' },
  // Expedia Group Affiliate — sign up at
  // https://www.expediagroup.com/affiliate-marketing/. Same dual-env pattern.
  { name: 'Expedia (affiliate)',      env: 'NEXT_PUBLIC_EXPEDIA_SITEID', category: 'Hotels' },
  // CJ Affiliate (Commission Junction) — publisher 7957203. CJ is NOT a
  // query-param program: the direct ?aid= / ?siteid= paths above are mutually
  // exclusive with it. After an advertiser approves, paste ONE deep link from
  // its CJ link inventory into CJ_LINK_<ADVERTISER> using {url} and {sid}
  // placeholders; /go wraps outbound clicks in it and skips the direct path.
  { name: 'CJ — Booking.com link',    env: 'CJ_LINK_BOOKING',            category: 'Hotels' },
  { name: 'CJ — Expedia link',        env: 'CJ_LINK_EXPEDIA',            category: 'Hotels' },
  // Travelpayouts attach brands — highest revenue per action available to us
  // (EKTA 20% of premium, Kiwitaxi 50% rev-share) and no new contract needed.
  // promo_id is per-brand and the cNNN host varies, so paste a whole link from
  // the Travelpayouts dashboard using {sub} and {url} placeholders.
  { name: 'EKTA insurance (TP link)', env: 'TP_LINK_EKTA',               category: 'Attach' },
  { name: 'Kiwitaxi transfers (TP link)', env: 'TP_LINK_KIWITAXI',       category: 'Attach' },
  { name: 'Resend',                    env: 'RESEND_API_KEY',        category: 'Email' },
  { name: 'Twilio',                    env: 'TWILIO_ACCOUNT_SID',    category: 'SMS' },
  { name: 'Stripe',                    env: 'STRIPE_SECRET_KEY',     category: 'Billing' },
  { name: 'PayPal',                    env: 'PAYPAL_CLIENT_ID',      category: 'Billing' },
  { name: 'Anthropic (Claude)',        env: 'ANTHROPIC_API_KEY',     category: 'AI concierge' },
  { name: 'Slack',                     env: 'SLACK_BOT_TOKEN',       category: 'Alerts' },
  { name: 'Telegram',                  env: 'TELEGRAM_BOT_TOKEN',    category: 'Alerts' },
  { name: 'Ayrshare',                  env: 'AYRSHARE_API_KEY',      category: 'Auto-poster' },
];

export default async function AdminIntegrationsPage() {
  // Build a status row per integration based on whether the ENV var is set on
  // the server (we never expose the secret value — just configured / missing).
  const rows = INTEGRATIONS.map(it => ({
    ...it,
    configured: Boolean((process.env[it.env] ?? '').trim()),
  }));

  // Tally by category for a quick-glance KPI strip.
  const byCat = new Map<string, { total: number; ok: number }>();
  for (const r of rows) {
    const bucket = byCat.get(r.category) ?? { total: 0, ok: 0 };
    bucket.total += 1;
    if (r.configured) bucket.ok += 1;
    byCat.set(r.category, bucket);
  }
  const cats = Array.from(byCat.entries());

  // Some operational counters from db.ts so this page tells you "are providers
  // healthy" not just "are keys present" — keys-present + zero-calls = broken.
  const callsThisMonth = queries.apiCallsThisMonth?.()?.count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow mb-1">Admin · Integrations</div>
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-display">
          Integrations &amp; API keys
        </h1>
        <p className="text-sm text-white/55 mt-1">
          Per-provider configuration status. Secrets stay in <code>.env.local</code> on the server — only
          presence flags are surfaced here.
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="kpi">
          <div className="kpi-label">Configured</div>
          <div className="kpi-value">{rows.filter(r => r.configured).length}<span className="text-base text-white/45"> / {rows.length}</span></div>
          <div className="kpi-sub">across {cats.length} categories</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Missing</div>
          <div className="kpi-value">{rows.filter(r => !r.configured).length}</div>
          <div className="kpi-sub">unconfigured providers</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">API calls this month</div>
          <div className="kpi-value">{callsThisMonth.toLocaleString()}</div>
          <div className="kpi-sub">aggregate across providers</div>
        </div>
        <div className="kpi kpi-brand">
          <div className="kpi-label">Health</div>
          <div className="kpi-value">{Math.round((rows.filter(r => r.configured).length / rows.length) * 100)}%</div>
          <div className="kpi-sub">keys present coverage</div>
        </div>
      </section>

      {cats.map(([cat, b]) => (
        <section key={cat} className="card">
          <div className="card-head flex items-center justify-between">
            <h2 className="!mb-0">{cat}</h2>
            <span className="text-xs text-white/45">{b.ok} / {b.total} configured</span>
          </div>
          <table className="w-full mt-2 text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-white/45 border-b border-white/8">
                <th className="py-2">Provider</th>
                <th className="py-2">Env var</th>
                <th className="py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.filter(r => r.category === cat).map(r => (
                <tr key={r.env} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5 font-semibold">{r.name}</td>
                  <td className="py-2.5"><code>{r.env}</code></td>
                  <td className="py-2.5 text-right">
                    {r.configured ? (
                      <span className="text-[11px] uppercase tracking-wide font-bold text-emerald-400">● configured</span>
                    ) : (
                      <span className="text-[11px] uppercase tracking-wide font-bold text-amber-400">○ missing</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <div className="text-xs text-white/45">
        To change a key, SSH into prod, edit <code>/opt/egyptair-tracker/.env.local</code>, then
        <code> systemctl restart egyptair.service</code>. Never paste secrets in chat.
      </div>
    </div>
  );
}

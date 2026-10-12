import { queries } from '@/lib/db';
import { Panel, Kpi, Table, Status } from '../_components/ui';

export const dynamic = 'force-dynamic';

// What ENV-derived API keys/integrations to display health for. Stays in sync
// with the providers we actually call in src/lib/providers.ts and elsewhere.
const INTEGRATIONS = [
  { name: 'Travelpayouts (data API)',  env: 'TRAVELPAYOUTS_TOKEN',     category: 'Flight data' },
  { name: 'Travelpayouts (stats API)', env: 'TRAVELPAYOUTS_API_TOKEN', category: 'Flight data' },
  { name: 'Amadeus',                   env: 'AMADEUS_CLIENT_ID',       category: 'Flight data' },
  { name: 'Duffel',                    env: 'DUFFEL_API_KEY',          category: 'Flight data' },
  { name: 'SerpAPI (Google Flights)',  env: 'SERPAPI_KEY',             category: 'Flight data' },
  // Hotellook is part of Travelpayouts and shares TRAVELPAYOUTS_TOKEN for the
  // data API. The marker row that sat here was the affiliate identifier, which
  // no longer exists — hotel links are plain searches.
  { name: 'Hotellook (uses the Travelpayouts token)', env: 'TRAVELPAYOUTS_TOKEN', category: 'Hotels' },
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
        <div className="ad-eyebrow accent mb-1">Admin · Integrations</div>
        <h1 className="ed-h1">
          Integrations &amp; API keys
        </h1>
        <p className="ed-sub">
          Per-provider configuration status. Secrets stay in <code className="ed-code">.env.local</code> on the server — only
          presence flags are surfaced here.
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Configured" value={rows.filter(r => r.configured).length} unit={`/ ${rows.length}`}
          foot={`across ${cats.length} categories`} />
        <Kpi label="Missing" value={rows.filter(r => !r.configured).length} foot="unconfigured providers" />
        <Kpi label="API calls this month" value={callsThisMonth.toLocaleString()} foot="aggregate across providers" />
        <Kpi label="Health" value={`${Math.round((rows.filter(r => r.configured).length / rows.length) * 100)}%`}
          foot="keys present coverage" tone="gold" />
      </section>

      {cats.map(([cat, b]) => (
        <Panel key={cat} title={cat} right={<span className="ad-note">{b.ok} / {b.total} configured</span>}>
          <Table head={['Provider', 'Env var', 'Status']}>
            {rows.filter(r => r.category === cat).map(r => (
              <tr key={r.env}>
                <td className="font-semibold ad-tone-neutral">{r.name}</td>
                <td><code className="ed-code">{r.env}</code></td>
                <td className="text-right">
                  {r.configured ? (
                    <Status tone="good">configured</Status>
                  ) : (
                    <Status tone="warn">missing</Status>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      ))}

      <div className="text-xs ad-note">
        To change a key, SSH into prod, edit <code className="ed-code">/opt/egyptair-tracker/.env.local</code>, then
        <code className="ed-code"> systemctl restart egyptair.service</code>. Never paste secrets in chat.
      </div>
    </div>
  );
}

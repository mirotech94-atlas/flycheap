import { fmtUSD, fmtEGP, fmtRelative } from '@/lib/utils';

type Deal = {
  origin: string;
  per_adult_usd: number;
  party_total_usd: number;
  outbound_date: string;
  return_date: string;
};

export function KpiStrip({
  deals,
  threshold,
  maxDisplay,
  refreshedAt,
  trackedCount,
  usdToEgp,
}: {
  deals: Deal[];
  threshold: number;
  maxDisplay: number;
  refreshedAt: string | null | undefined;
  trackedCount: number;
  usdToEgp?: number;
}) {
  const cheapest = deals[0];
  const underCount = deals.filter(d => d.per_adult_usd < threshold).length;
  const avg = deals.length
    ? Math.round(deals.reduce((s, d) => s + d.per_adult_usd, 0) / deals.length)
    : 0;
  const delta = cheapest ? cheapest.per_adult_usd - threshold : 0;

  return (
    <section className="ed-stats">
      <div className="ed-stat accent">
        <div className="ed-stat-label">Cheapest right now</div>
        <div className="ed-stat-value">
          <span className="ed-fare-text">{cheapest ? fmtUSD(cheapest.per_adult_usd) : '—'}</span>
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}> /adult</span>
        </div>
        <div className="ed-stat-note">
          {cheapest
            ? <>{cheapest.origin} → CAI · party {fmtUSD(cheapest.party_total_usd)}{usdToEgp ? ` · ≈ ${fmtEGP(cheapest.party_total_usd, usdToEgp)}` : ''}</>
            : 'No deals scanned yet'}
        </div>
      </div>

      <div className="ed-stat">
        <div className="ed-stat-label">vs. {fmtUSD(threshold)} target</div>
        <div className={`ed-stat-value ${cheapest ? (delta < 0 ? 'ed-delta-up' : 'ed-delta-down') : ''}`}>
          {cheapest ? (delta < 0 ? `−${fmtUSD(Math.abs(delta))}` : `+${fmtUSD(delta)}`) : '—'}
        </div>
        <div className="ed-stat-note">
          {cheapest && delta < 0 ? 'Below target — consider booking' : 'Above target — keep watching'}
        </div>
      </div>

      <div className="ed-stat">
        <div className="ed-stat-label">Deals under target</div>
        <div className="ed-stat-value">{underCount}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}> / {deals.length}</span></div>
        <div className="ed-stat-note">Avg per-adult shown: {avg ? fmtUSD(avg) : '—'}</div>
      </div>

      <div className="ed-stat">
        <div className="ed-stat-label">Tracked routes</div>
        <div className="ed-stat-value">{trackedCount}</div>
        <div className="ed-stat-note">
          Cap {fmtUSD(maxDisplay)}/adult · refreshed {refreshedAt ? fmtRelative(refreshedAt + 'Z') : '—'}
        </div>
      </div>
    </section>
  );
}

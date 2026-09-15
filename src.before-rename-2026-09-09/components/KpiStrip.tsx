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
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <div className="kpi kpi-brand">
        <div className="kpi-label">Cheapest right now</div>
        <div className="kpi-value">
          {cheapest ? fmtUSD(cheapest.per_adult_usd) : '—'}
          <span className="text-xs font-normal opacity-80"> /adult</span>
        </div>
        <div className="kpi-sub">
          {cheapest
            ? <>{cheapest.origin} → CAI · party {fmtUSD(cheapest.party_total_usd)}{usdToEgp ? ` · ≈ ${fmtEGP(cheapest.party_total_usd, usdToEgp)}` : ''}</>
            : 'No deals scanned yet'}
        </div>
      </div>

      <div className={`kpi ${delta < 0 ? 'kpi-accent' : 'kpi-warn'}`}>
        <div className="kpi-label">vs. {fmtUSD(threshold)} target</div>
        <div className="kpi-value">
          {cheapest ? (delta < 0 ? `−${fmtUSD(Math.abs(delta))}` : `+${fmtUSD(delta)}`) : '—'}
        </div>
        <div className="kpi-sub">
          {cheapest && delta < 0 ? 'Below target — consider booking' : 'Above target — keep watching'}
        </div>
      </div>

      <div className="kpi">
        <div className="kpi-label">Deals under target</div>
        <div className="kpi-value">{underCount}<span className="text-xs font-normal text-slate-400"> / {deals.length}</span></div>
        <div className="kpi-sub">Avg per-adult shown: {avg ? fmtUSD(avg) : '—'}</div>
      </div>

      <div className="kpi">
        <div className="kpi-label">Tracked routes</div>
        <div className="kpi-value">{trackedCount}</div>
        <div className="kpi-sub">
          Cap {fmtUSD(maxDisplay)}/adult · refreshed {refreshedAt ? fmtRelative(refreshedAt + 'Z') : '—'}
        </div>
      </div>
    </section>
  );
}

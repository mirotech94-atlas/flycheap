/* ============================================================
   Funnel — the admin "feature block" (README "Funnel: 5 stages, 44px
   bars on --surface-2, last stage --amber, serif value right").

   Data only: renders exactly the stages `funnelMetrics()` returns, in
   its own order — never a fixed count. funnelMetrics conditionally
   omits 'delivered'/'opened' when the ESP webhook has never fired (an
   unmeasured stage is absent, not a false zero — see funnel/page.tsx's
   own doc comment), so this is sometimes 4 stages and sometimes 6,
   never hardcoded to 5.

   Bar width = stage value / first-stage value, the funnel's own 100%
   baseline; 0 when the first stage is 0 (NaN-safe, no fabricated
   floor). The last row always gets the amber fill: funnelMetrics
   appends 'commission settled' unconditionally as the terminal stage
   — the one conversion event this funnel exists to move — every
   other stage renders on --accent.
   ============================================================ */

export type FunnelStage = { stage: string; n: number; ofPreviousPct: number | null };

export function Funnel({ stages }: { stages: FunnelStage[] }) {
  if (stages.length === 0) {
    return <div className="ad-note py-6 text-center">No data.</div>;
  }

  const base = stages[0]?.n ?? 0;
  const pct = (n: number) => {
    if (!(base > 0)) return 0;
    const p = (n / base) * 100;
    return Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0;
  };

  return (
    <div className="ed-funnel">
      {stages.map((s, i) => {
        const isConversion = i === stages.length - 1;
        return (
          <div key={s.stage} className="ed-funnel-row">
            <div className="ed-funnel-label">{s.stage}</div>
            <div className="ed-funnel-bar">
              <div
                className={`ed-funnel-bar-fill${isConversion ? ' amber' : ''}`}
                style={{ width: `${pct(s.n)}%` }}
              />
            </div>
            <div className="ed-funnel-value">
              <span className="ed-funnel-value-n">{s.n.toLocaleString('en-US')}</span>
              {s.ofPreviousPct != null && (
                <span className="ed-funnel-meta">{s.ofPreviousPct.toFixed(1)}% of previous</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import type { RouteInsight, InsightSummary } from '@/lib/nn/insight';
import { FcMoney } from '@/components/fc/PageKit';

/**
 * One table for both Model pages. The client sees their routes; the admin
 * sees everyone's with a "who" column. Every cell is a number the system
 * produced for that route today — nothing is illustrative.
 *
 * Verdict chips reuse the ticket-status recipes: buy = green (healthy), wait
 * = amber (the one place amber belongs — a fare decision), hold = quiet.
 */

const CHIP: Record<'buy' | 'wait' | 'hold', string> = { buy: 'status-ok', wait: 'status-waiting', hold: 'status-closed' };
const SOURCE_LABEL: Record<RouteInsight['source'], string> = {
  'model-agrees': 'Model agrees',
  'model-override': 'Model overrode',
  'rules': 'Rules (model unsure)',
  'rules-only-thin-history': 'Rules only · thin history',
  'rules-only-no-model': 'Rules only · no model yet',
  'no-fare': 'No fare yet',
  'no-verdict': 'Not enough data',
};

/** Human names for the eleven inputs, for the "why" row. */
const FEATURE_LABEL: Record<string, string> = {
  positionInRange: 'Position in 30-day range',
  percentile: 'Share of days cheaper than today',
  zScore: 'Std devs from the mean',
  trendPct: 'Recent trend',
  slopePctPerDay: 'Slope per day',
  volatilityPct: 'Volatility',
  vsMedianPct: 'vs 30-day median',
  daysSinceMin: 'Days since the low',
  daysToDeparture: 'Days to departure',
  dayOfWeek: 'Day of week',
  sampleDensity: 'Polls per day',
};

function fmtFeature(name: string, v: number): string {
  switch (name) {
    case 'positionInRange': case 'percentile': return `${Math.round(v * 100)}%`;
    case 'trendPct': case 'vsMedianPct': case 'volatilityPct': return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
    case 'slopePctPerDay': return `${v > 0 ? '+' : ''}${v.toFixed(2)}%/day`;
    case 'zScore': return v.toFixed(2);
    case 'daysSinceMin': case 'daysToDeparture': return `${Math.round(v)}d`;
    case 'dayOfWeek': return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][Math.round(v)] ?? String(v);
    case 'sampleDensity': return v.toFixed(1);
    default: return v.toFixed(2);
  }
}

export function ModelSummaryStrip({ s }: { s: InsightSummary }) {
  return (
    <div className="ed-stats" style={{ marginBottom: 24 }}>
      <div className="ed-stat">
        <div className="ed-stat-label">Routes</div>
        <div className="ed-stat-value">{s.routes}</div>
      </div>
      <div className="ed-stat">
        <div className="ed-stat-label">With a model view</div>
        <div className="ed-stat-value">{s.withModelView}<span className="ed-stat-delta ed-delta-flat">of {s.routes}</span></div>
      </div>
      <div className="ed-stat">
        <div className="ed-stat-label">Model agreed with rules</div>
        <div className="ed-stat-value">{s.agreed}</div>
      </div>
      <div className="ed-stat">
        <div className="ed-stat-label">Model overrode rules</div>
        <div className="ed-stat-value">{s.overridden}</div>
      </div>
    </div>
  );
}

export function ModelInsightTable({ rows, showUser = false }: { rows: Array<RouteInsight & { userEmail?: string; userName?: string | null }>; showUser?: boolean }) {
  if (rows.length === 0) {
    return <div className="ed-panel ed-empty"><p style={{ fontSize: 13.5, color: 'var(--muted)' }}>No active routes to show.</p></div>;
  }
  return (
    <table className="ed-table">
      <thead>
        <tr>
          {showUser && <th>Client</th>}
          <th>Route</th>
          <th className="num">Today</th>
          <th>Verdict</th>
          <th className="num">Confidence</th>
          <th className="num">P(wait)</th>
          <th className="num">P(buy)</th>
          <th>Rules said</th>
          <th>How it was decided</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <RowGroup key={r.searchId} r={r} showUser={showUser} />
        ))}
      </tbody>
    </table>
  );
}

function RowGroup({ r, showUser }: { r: RouteInsight & { userEmail?: string; userName?: string | null }; showUser: boolean }) {
  const cols = showUser ? 9 : 8;
  return (
    <>
      <tr>
        {showUser && (
          <td>
            <div style={{ fontSize: 13 }}>{r.userName || r.userEmail}</div>
            {r.userName && <div className="ed-mono" style={{ fontSize: 10, letterSpacing: 0, textTransform: 'none', color: 'var(--muted-2)' }}>{r.userEmail}</div>}
          </td>
        )}
        <td>
          <span className="ed-mono" style={{ letterSpacing: 0, textTransform: 'none', fontSize: 12.5, color: 'var(--ink)' }}>{r.route}</span>
          {r.departDate && <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>{r.departDate} · {r.historyDays}d history</div>}
        </td>
        <td className="num"><FcMoney usd={r.currentPrice} /></td>
        <td>{r.verdict ? <span className={`ed-chip ${CHIP[r.verdict]}`}>{r.verdict}</span> : <span className="ed-chip status-closed">—</span>}</td>
        <td className="num">{r.confidencePct != null ? `${r.confidencePct}%` : '—'}</td>
        <td className={`num${r.probs && r.probs.wait >= 0.7 ? ' ed-fare-text' : ''}`}>{r.probs ? `${Math.round(r.probs.wait * 100)}%` : '—'}</td>
        <td className="num">{r.probs ? `${Math.round(r.probs.buy * 100)}%` : '—'}</td>
        <td>{r.rulesVerdict ? <span className={`ed-chip ${CHIP[r.rulesVerdict]}`} style={{ opacity: r.rulesVerdict === r.verdict ? 0.55 : 1 }}>{r.rulesVerdict}</span> : '—'}</td>
        <td style={{ fontSize: 12, color: r.source === 'model-override' ? 'var(--ink)' : 'var(--muted)' }}>{SOURCE_LABEL[r.source]}</td>
      </tr>
      {r.features && (
        <tr className="ed-model-why">
          <td colSpan={cols} style={{ paddingTop: 0 }}>
            <details>
              <summary className="ed-mono" style={{ cursor: 'pointer', fontSize: 10, color: 'var(--muted-2)' }}>What the network looked at</summary>
              <div className="ed-model-features">
                {r.features.map(f => (
                  <div key={f.name} className="ed-model-feature">
                    <div className="ed-stat-label" style={{ marginBottom: 2 }}>{FEATURE_LABEL[f.name] ?? f.name}</div>
                    <div className="ed-mono" style={{ fontSize: 12, letterSpacing: 0, textTransform: 'none', color: 'var(--ink)' }}>{fmtFeature(f.name, f.value)}</div>
                  </div>
                ))}
              </div>
              {r.reason && <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '10px 0 4px', maxWidth: '72ch' }}>{r.reason}</p>}
            </details>
          </td>
        </tr>
      )}
    </>
  );
}

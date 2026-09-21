import { FcRoute } from './PageKit';

/* ============================================================
   The departure board.

   The most characteristic object in this subject's world, built
   from the customer's OWN routes and real recorded fares — not a
   decorative hero. Editorial skeleton: a ruled table, route code in
   mono, fare in serif ink, meta in muted — no ticket-stub chrome.
   ============================================================ */

export type BoardRow = {
  id: number;
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  perAdultUsd: number | null;
  target: number | null;
  /** Cheapest we have ever recorded for this route, for context. */
  low30: number | null;
};

function statusOf(r: BoardRow): { label: string } {
  if (r.perAdultUsd == null) return { label: 'Watching' };
  if (r.target != null && r.perAdultUsd <= r.target) return { label: 'At your price' };
  if (r.low30 != null && r.perAdultUsd <= r.low30) return { label: 'Lowest seen' };
  return { label: 'Above target' };
}

/** "Sat 3 Nov" — travellers think in days of the week, not ISO dates. */
function day(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function DepartureBoard({ rows }: { rows: BoardRow[] }) {
  if (rows.length === 0) return null;

  return (
    <table className="ed-table" style={{ marginBottom: 28 }}>
      <tbody>
        {rows.map(r => {
          const s = statusOf(r);
          const gap = r.target != null && r.perAdultUsd != null ? r.perAdultUsd - r.target : null;
          return (
            <tr key={r.id}>
              {/* Left: the itinerary */}
              <td>
                <div className="ed-mono" style={{ fontSize: '1.05rem', letterSpacing: 0, textTransform: 'none', fontWeight: 600, color: 'var(--ink)' }}>
                  {r.origin}
                  <span aria-hidden style={{ margin: '0 8px', color: 'var(--muted-2)' }}>→</span>
                  {r.destination}
                </div>
                <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>
                  {day(r.departDate)} — {day(r.returnDate)}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: s.label === 'At your price' ? 'var(--green)' : s.label === 'Lowest seen' ? 'var(--accent)' : 'var(--muted)' }}>
                    {s.label}
                  </span>
                  {gap != null && gap > 0 && (
                    <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · ${Math.round(gap)} above your target</span>
                  )}
                </div>
              </td>

              {/* Right: the fare */}
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div className="ed-mono" style={{ color: 'var(--muted-2)' }}>
                  {r.perAdultUsd != null ? 'per adult' : 'no fare yet'}
                </div>
                <div
                  style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: '1.6rem', letterSpacing: '-0.02em', lineHeight: 1, marginTop: 6, color: 'var(--ink)' }}
                >
                  {r.perAdultUsd != null ? `$${Math.round(r.perAdultUsd).toLocaleString('en-US')}` : '—'}
                </div>
                {r.target != null && (
                  <div style={{ fontSize: 11, marginTop: 6, color: 'var(--muted-2)' }}>
                    target ${Math.round(r.target)}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Compact one-line version for pages where the board is context, not the hero. */
export function BoardStrip({ rows }: { rows: BoardRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6">
      {rows.slice(0, 6).map(r => (
        <span key={r.id} className="inline-flex items-baseline gap-2.5 text-[13px]">
          <FcRoute from={r.origin} to={r.destination} size="sm" />
          <span className="ed-mono" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink)' }}>
            {r.perAdultUsd != null ? `$${Math.round(r.perAdultUsd)}` : '—'}
          </span>
        </span>
      ))}
    </div>
  );
}

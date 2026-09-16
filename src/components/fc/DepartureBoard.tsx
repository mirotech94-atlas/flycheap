import { FcRoute } from './PageKit';

/* ============================================================
   The departure board.

   The most characteristic object in this subject's world, built
   from the customer's OWN routes and real recorded fares — not a
   decorative hero. Each row is a ticket stub: pale stock on the
   dark deck, torn along a perforation, fare on the stub.
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

function statusOf(r: BoardRow): { label: string; color: string } {
  if (r.perAdultUsd == null) return { label: 'Watching', color: 'var(--nc-on-dark-faint)' };
  if (r.target != null && r.perAdultUsd <= r.target) return { label: 'At your price', color: 'var(--nc-mint)' };
  if (r.low30 != null && r.perAdultUsd <= r.low30) return { label: 'Lowest seen', color: 'var(--nc-amber)' };
  return { label: 'Above target', color: 'var(--nc-on-dark-mute)' };
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
    <div className="space-y-2.5 mb-7">
      {rows.map(r => {
        const s = statusOf(r);
        const gap = r.target != null && r.perAdultUsd != null ? r.perAdultUsd - r.target : null;
        return (
          <article key={r.id} className="nc-ticket flex items-stretch overflow-hidden">
            {/* Left: the itinerary */}
            <div className="flex-1 min-w-0 px-5 py-4">
              <div className="nc-code text-[1.35rem]" style={{ color: 'var(--nc-on-dark)' }}>
                {r.origin}
                <span aria-hidden className="mx-2" style={{ color: 'var(--nc-on-dark-faint)' }}>→</span>
                {r.destination}
              </div>
              <div className="mt-1.5 text-[12.5px]" style={{ color: 'var(--nc-on-dark-mute)' }}>
                {day(r.departDate)} — {day(r.returnDate)}
              </div>
              <div className="mt-2 text-[13.5px] font-semibold" style={{ color: s.color === 'var(--nc-on-dark-faint)' ? 'var(--nc-on-dark-faint)' : undefined }}>
                <span style={{ color: s.label === 'At your price' ? 'var(--nc-mint)' : s.label === 'Lowest seen' ? 'var(--nc-teal)' : 'var(--nc-on-dark-faint)' }}>
                  {s.label}
                </span>
                {gap != null && gap > 0 && (
                  <span style={{ color: 'var(--nc-on-dark-mute)' }}> · ${Math.round(gap)} above your target</span>
                )}
              </div>
            </div>

            {/* Right: the stub, torn along the perforation */}
            <div
              className="nc-ticket-stub shrink-0 px-5 py-4 flex flex-col items-end justify-center text-right"
              style={{ minWidth: '9.5rem' }}
            >
              <div className="text-[10.5px] uppercase tracking-wider" style={{ color: 'var(--nc-on-dark-faint)' }}>
                {r.perAdultUsd != null ? 'per adult' : 'no fare yet'}
              </div>
              <div
                className="tabular-nums leading-none mt-1"
                style={{ fontFamily: 'var(--nc-mono)', fontSize: '1.55rem', color: 'var(--nc-amber)' }}
              >
                {r.perAdultUsd != null ? `$${Math.round(r.perAdultUsd).toLocaleString('en-US')}` : '—'}
              </div>
              {r.target != null && (
                <div className="text-[11px] mt-1.5" style={{ color: 'var(--nc-on-dark-faint)' }}>
                  target ${Math.round(r.target)}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
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
          <span className="nc-fare">
            {r.perAdultUsd != null ? `$${Math.round(r.perAdultUsd)}` : '—'}
          </span>
        </span>
      ))}
    </div>
  );
}

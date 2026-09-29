import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { queries } from '@/lib/db';
import { getCachedBestDeals } from '@/lib/bestDeals';
import { fmtUSD, fmtDate, fmtRelative } from '@/lib/utils';
import { verifiedAgeLabel } from '@/lib/fareAge';
import { KpiStrip } from '@/components/KpiStrip';
import { FareCalendar } from '@/components/FareCalendar';
import { Sparkline } from '@/components/Sparkline';
import { BookingActions } from '@/components/BookingActions';
import { resolveBoard, recordView, boardRows } from '@/lib/boardShare';

export const dynamic = 'force-dynamic';

/**
 * A board shows a family's travel plans to whoever holds the link. Search
 * engines indexing that is, in the spec's words, a bad day.
 */
export const metadata = {
  title: 'Shared watch board — FlyCheap',
  robots: { index: false, follow: false, nocache: true },
};

const DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default async function SharedDashboard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Per-group boards, resolved by token HASH. Revocation and expiry are checked
  // inside the query on every request with nothing cached — the whole value of
  // revoke is that it is immediate.
  // The retired global `share_token` is NOT honoured: it was one link for the
  // whole install and showed every user's watches to anyone holding it.
  const board = resolveBoard(token);
  if (!board) notFound();

  const h = await headers();
  recordView(board.id, {
    // Truncated the same way affiliate clicks are: enough to tell views
    // apart, not enough to be a location record of who is watching whom.
    ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim().split('.').slice(0, 3).join('.') || null,
    userAgent: h.get('user-agent'),
  });

  // A board may share the schedule without the budget: "a family organiser may
  // not want everyone to see what they are willing to pay."
  const showPrices = board.show_prices === 1;

  // Only the board creator's watches — never the install-wide list.
  const rows = boardRows(board);
  const threshold = parseFloat(
    (board.created_by && queries.getUserSetting(board.created_by, 'alert_threshold_per_adult_usd'))
    || queries.getSetting('alert_threshold_per_adult_usd') || '900',
  );
  const maxDisplay = parseFloat(queries.getSetting('max_display_per_adult_usd') ?? '1200');
  const usdToEgp = parseFloat(queries.getSetting('usd_to_egp') ?? '49.5');

  const { deals: allDeals, refreshed_at } = getCachedBestDeals(50);

  // Prefer the verification timestamp when the fare has one; fall back to when
  // it was polled. Both are real; neither is invented.
  const ageLabel = (f: { verified_at?: string | null; polled_at?: string | null }) =>
    verifiedAgeLabel(f.verified_at ?? null)
    ?? verifiedAgeLabel(f.polled_at ?? null)?.replace('Verified', 'Priced')
    ?? null;
  const affordable = allDeals.filter(d => d.per_adult_usd <= maxDisplay);
  const top = affordable.slice(0, 30);

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div className="ed-panel">
        <div className="ed-eyebrow">Family share view · read-only</div>
        <h1 className="ed-h2" style={{ fontSize: 26, marginTop: 6 }}>EgyptAir fare tracker</h1>
        <p className="ed-panel-note">
          Live snapshot of the cheapest EgyptAir round-trips JFK/EWR ↔ CAI for 4 adults + 1 infant.
          Updated automatically — bookmark this page; it stays in sync.
        </p>
      </div>

      <KpiStrip
        deals={top}
        threshold={threshold}
        maxDisplay={maxDisplay}
        refreshedAt={refreshed_at}
        trackedCount={rows.length}
        usdToEgp={usdToEgp}
      />

      {top.length > 0 && (
        <div className="ed-panel" style={{ overflowX: 'auto' }}>
          <div className="ed-panel-head">
            <div>
              <div className="ed-eyebrow">
                Best deals — cheapest first
                {refreshed_at && (
                  <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>
                    · {verifiedAgeLabel(refreshed_at)?.replace('Verified', 'Priced') ?? ''}
                  </span>
                )}
              </div>
              <h2 className="ed-panel-title">Top {top.length} EgyptAir nonstops ≤ {fmtUSD(maxDisplay)}/adult</h2>
            </div>
            <span className="ed-chip status-open">Refreshed {refreshed_at ? fmtRelative(refreshed_at + 'Z') : '—'}</span>
          </div>
          <table className="ed-table">
            <thead>
              <tr>
                <th>#</th><th>Origin</th><th>Outbound</th><th>Return</th>
                <th>Trip</th><th className="num">Per adult</th>
                <th className="num">Party total</th><th></th>
              </tr>
            </thead>
            <tbody>
              {top.map((d, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--muted)', fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{d.origin} → CAI</td>
                  <td>{fmtDate(d.outbound_date)} <span style={{ fontSize: 12, color: 'var(--muted)' }}>{DOW_NAMES[d.outbound_dow]}</span></td>
                  <td>{fmtDate(d.return_date)} <span style={{ fontSize: 12, color: 'var(--muted)' }}>{DOW_NAMES[d.return_dow]}</span></td>
                  <td style={{ color: 'var(--muted)' }}>{d.trip_length_days}d</td>
                  <td className="num ed-fare-text" style={{ fontWeight: 700 }}>{fmtUSD(d.per_adult_usd)}</td>
                  <td className="num">{fmtUSD(d.party_total_usd)}</td>
                  <td className="cta">
                    <BookingActions
                      origin={d.origin} destination="CAI"
                      departDate={d.outbound_date} returnDate={d.return_date}
                      adults={4} infants={1}
                      size="sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {allDeals.length > 0 && (
        <FareCalendar deals={allDeals} threshold={threshold} maxDisplay={maxDisplay} />
      )}

      {rows.length > 0 && (
        <div className="ed-panel" style={{ overflowX: 'auto' }}>
          <h2 className="ed-panel-title" style={{ marginBottom: 14 }}>Tracked dates · current cheapest</h2>
          <table className="ed-table">
            <thead>
              <tr>
                <th>Origin</th><th>Depart</th><th>Return</th>
                <th className="num">Per adult</th>
                <th>Trend (30d)</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ search, fare, history }) => (
                <tr key={search.id}>
                  <td style={{ fontWeight: 600 }}>{search.origin} → {search.destination}</td>
                  <td>{fmtDate(search.depart_date)}</td>
                  <td>{fmtDate(search.return_date)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {!showPrices ? '—' : fare ? <span className="ed-fare-text">{fmtUSD(fare.price_per_adult_usd)}</span> : '—'}
                    {/* The age of the number, shown rather than implied. A share
                        board is seen by people who never set the alert and have
                        no idea how fresh this is — a bare price they later find
                        to be hours old is exactly the betrayal the fare-truth
                        rule exists to prevent. */}
                    {fare && ageLabel(fare) && (
                      <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>{ageLabel(fare)}</div>
                    )}
                  </td>
                  <td><Sparkline data={history} threshold={threshold} /></td>
                  <td className="cta">
                    {fare && (
                      <BookingActions
                        origin={search.origin} destination={search.destination}
                        departDate={search.depart_date} returnDate={search.return_date}
                        adults={search.adults} infants={search.infants}
                        size="sm"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="ed-panel-note" style={{ textAlign: 'center', paddingTop: 16 }}>
        Share link · revoke or rotate at any time from Settings.
      </div>
    </div>
  );
}

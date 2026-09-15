import { queries } from '@/lib/db';
import { fmtDate, fmtRelative } from '@/lib/utils';
import { PieCard } from '@/components/charts';
import { SearchForm } from '@/components/SearchForm';
import { SearchActions } from '@/components/SearchActions';

export const dynamic = 'force-dynamic';

export default function SearchesPage() {
  const searches = queries.listSearches();
  const callsBySearch = queries.apiCallsByMonthBySearch();

  const pie = callsBySearch
    .filter(c => c.count > 0)
    .map(c => ({
      name: `#${c.id} ${c.origin} · ${fmtDate(c.depart_date)}`,
      value: c.count,
    }));

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow mb-1">Watchlist</div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Tracked Searches</h1>
        <p className="text-sm text-slate-500 mt-1">Manage which fares the scheduler polls and alerts on.</p>
      </div>

      <SearchForm />

      <div className="card overflow-x-auto">
        <h2>All searches</h2>
        {searches.length === 0 ? (
          <div className="text-sm text-slate-400 py-6 text-center">None yet — add one above.</div>
        ) : (
          <table className="fmt">
            <thead>
              <tr>
                <th>#</th>
                <th>Status</th>
                <th>Origin</th>
                <th>Destination</th>
                <th>Depart</th>
                <th>Return</th>
                <th>Party</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {searches.map(s => {
                const isSnoozed = !!s.snoozed_until && new Date(s.snoozed_until) > new Date();
                return (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>
                    {isSnoozed
                      ? <span className="badge badge-gold" title={`Until ${s.snoozed_until} UTC`}>snoozed 💤</span>
                      : s.active === 1
                        ? <span className="badge badge-ok">active</span>
                        : <span className="badge badge-muted">paused</span>}
                  </td>
                  <td className="font-semibold">{s.origin}</td>
                  <td>{s.destination}</td>
                  <td>{fmtDate(s.depart_date)}</td>
                  <td>{fmtDate(s.return_date)}</td>
                  <td>{s.adults}A + {s.infants}I</td>
                  <td className="text-slate-500">{fmtRelative(s.created_at)}</td>
                  <td><SearchActions id={s.id} active={s.active === 1} snoozedUntil={s.snoozed_until} /></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <PieCard
        title="API calls this month — by search"
        data={pie}
        valueLabel="Calls"
      />
    </div>
  );
}

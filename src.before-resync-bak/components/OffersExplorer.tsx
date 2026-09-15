'use client';

import { useMemo, useState, useTransition } from 'react';

type ProviderStatus = {
  id: string;
  label: string;
  configHint: string;
  isConfigured: boolean;
  isEnabled: boolean;
};

type Offer = {
  origin: string;
  provider: string;
  per_adult_usd: number;
  total_party_usd: number;
  outbound_flight_no: string;
  return_flight_no: string;
  outbound_depart_iso: string | null;
  return_depart_iso: string | null;
  outbound_transfers: number;
  return_transfers: number;
  airline?: string;
};

type StopsFilter = 'all' | 'nonstop' | 'one-stop' | 'two-plus';
type ShowLimit = '25' | '50' | '100' | 'all';

function maxStops(o: Offer): number {
  return Math.max(o.outbound_transfers ?? 0, o.return_transfers ?? 0);
}

function stopLabel(n: number): string {
  if (n <= 0) return 'Nonstop';
  if (n === 1) return '1 stop';
  return `${n} stops`;
}

function money(n: number): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n)}`;
  }
}

export function OffersExplorer(props: {
  initial: {
    enabledProviders: string[];
    providerStatuses: ProviderStatus[];
    form?: {
      origin?: string;         // "JFK,EWR" or "JFK"
      destination?: string;
      departDate?: string;
      returnDate?: string;
      adults?: number;
      infants?: number;
      stops?: StopsFilter;
      show?: ShowLimit;
    };
  };
}) {
  const [pending, start] = useTransition();
  const initialOrigin = (props.initial.form?.origin ?? 'JFK,EWR').toUpperCase();
  const [originJfk, setOriginJfk] = useState(initialOrigin.split(',').includes('JFK'));
  const [originEwr, setOriginEwr] = useState(initialOrigin.split(',').includes('EWR'));
  const [destination, setDestination] = useState((props.initial.form?.destination ?? 'CAI').toUpperCase());
  const [departDate, setDepartDate] = useState(props.initial.form?.departDate ?? '2026-07-12');
  const [returnDate, setReturnDate] = useState(props.initial.form?.returnDate ?? '2026-08-28');
  const [adults, setAdults] = useState(props.initial.form?.adults ?? 4);
  const [infants, setInfants] = useState(props.initial.form?.infants ?? 1);
  const [stops, setStops] = useState<StopsFilter>(props.initial.form?.stops ?? 'one-stop');
  const [limit, setLimit] = useState<ShowLimit>(props.initial.form?.show ?? 'all');
  const [egyptairOnly, setEgyptairOnly] = useState(true);

  const [msg, setMsg] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [echo, setEcho] = useState<Record<string, unknown> | null>(null);
  const [coverage, setCoverage] = useState<Array<{ month: string; totalCached: number; matchingAirline: number; byDay: Record<string, number> }> | null>(null);
  const [coverageBusy, setCoverageBusy] = useState(false);
  const [fallback, setFallback] = useState<{ window: string; offers: Array<Offer & { suggested_depart_shift_days: number | null; suggested_return_shift_days: number | null }> } | null>(null);

  const enabledConfigured = props.initial.providerStatuses.filter(p => p.isEnabled && p.isConfigured);

  const originValue = useMemo(() => {
    const arr: string[] = [];
    if (originJfk) arr.push('JFK');
    if (originEwr) arr.push('EWR');
    return arr.join(',');
  }, [originJfk, originEwr]);

  const shown = useMemo(() => {
    const base = offers.slice();
    base.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
    if (limit === 'all') return base;
    const n = Number(limit);
    return base.slice(0, Number.isFinite(n) ? n : 25);
  }, [offers, limit]);

  async function run() {
    setMsg(null);
    setOffers([]);
    setDiagnostics([]);
    setEcho(null);
    if (!originValue) {
      setMsg('Pick at least one origin (JFK or EWR).');
      return;
    }
    // Client-side date sanity to fail fast and give a clear reason.
    const today = new Date().toISOString().slice(0, 10);
    if (departDate < today) {
      setMsg(`Depart ${departDate} is in the past (today is ${today}).`);
      return;
    }
    if (returnDate <= departDate) {
      setMsg(`Return ${returnDate} must be AFTER depart ${departDate}.`);
      return;
    }
    start(async () => {
      setMsg('Searching…');
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: originValue,
          destination,
          departDate,
          returnDate,
          adults,
          infants,
          stops,
          airline: egyptairOnly ? 'MS' : 'ANY',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setMsg(j.error || res.statusText);
        setDiagnostics(j.summary ?? []);
        return;
      }
      setOffers(j.offers ?? []);
      setDiagnostics(j.summary ?? []);
      setEcho(j.echo ?? null);
      setFallback(j.fallback ?? null);
      const count = j.count ?? (j.offers?.length ?? 0);
      setMsg(count > 0
        ? `Found ${count} offers across ${(j.provider_results?.length ?? 0)} provider call${(j.provider_results?.length ?? 0) === 1 ? '' : 's'}.`
        : `No offers matched. See per-provider diagnostics below — most often the cached APIs simply have no data for those exact dates with that stops filter.`);
    });
  }

  return (
    <div className="card card-feature overflow-x-auto">
      <div className="card-head">
        <div>
          <div className="eyebrow text-emerald-700">One-stop and nonstop</div>
          <h2 className="!mb-0 text-slate-900">Search any route window</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {enabledConfigured.length === 0
            ? <span className="badge badge-warn">No enabled providers configured</span>
            : <span className="badge badge-info">{enabledConfigured.length} providers active</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-800">
        <label className="text-xs text-slate-500 col-span-2">
          <span className="block mb-1">Origins</span>
          <div className="flex items-center gap-3 text-xs text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={originJfk} onChange={e => setOriginJfk(e.target.checked)} />
              JFK
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={originEwr} onChange={e => setOriginEwr(e.target.checked)} />
              EWR
            </label>
          </div>
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1">Destination</span>
          <input value={destination} onChange={e => setDestination(e.target.value.toUpperCase())} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" />
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1">Depart</span>
          <input type="date" value={departDate} onChange={e => setDepartDate(e.target.value)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" />
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1">Return</span>
          <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" />
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1">Stops</span>
          <select value={stops} onChange={e => setStops(e.target.value as StopsFilter)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
            <option value="all">All</option>
            <option value="nonstop">Nonstop</option>
            <option value="one-stop">1 stop</option>
            <option value="two-plus">2+ stops</option>
          </select>
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1">Adults</span>
          <input type="number" min={1} value={adults} onChange={e => setAdults(Number(e.target.value))} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" />
        </label>
        <label className="text-xs text-slate-500">
          <span className="block mb-1">Infants</span>
          <input type="number" min={0} value={infants} onChange={e => setInfants(Number(e.target.value))} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" />
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1">Show</span>
          <select value={limit} onChange={e => setLimit(e.target.value as ShowLimit)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">All</option>
          </select>
        </label>

        <label className="text-xs text-slate-500 col-span-2 md:col-span-2 flex items-center gap-2 mt-4">
          <input type="checkbox" checked={egyptairOnly} onChange={e => setEgyptairOnly(e.target.checked)} />
          <span>EgyptAir only (MS) — uncheck to also see other carriers</span>
        </label>

        <div className="col-span-2 md:col-span-6 flex items-center gap-2">
          <button type="button" className="btn btn-primary text-xs" onClick={run} disabled={pending}>
            {pending ? 'Searching…' : 'Search'}
          </button>
          <button
            type="button"
            className="btn text-xs"
            onClick={async () => {
              setCoverage(null); setCoverageBusy(true);
              const startMonth = (departDate || '2026-01-01').slice(0, 7);
              const r = await fetch('/api/offers/coverage', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  origin: (originValue.split(',')[0] || 'JFK'),
                  destination,
                  startMonth,
                  monthsAhead: 8,
                  airline: egyptairOnly ? 'MS' : 'ANY',
                }),
              });
              const j = await r.json().catch(() => ({}));
              setCoverageBusy(false);
              if (j.ok) setCoverage(j.months);
            }}
            disabled={coverageBusy}
            title="Survey which months actually have flights cached for the first selected origin"
          >
            {coverageBusy ? 'Scanning…' : 'Scan months for cached data'}
          </button>
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
        </div>
      </div>

      {/* Nearest-cached-date fallback — when exact dates have 0 results,
          show the closest pairings so the user can apply them with one click. */}
      {offers.length === 0 && fallback && fallback.offers.length > 0 && (
        <div className="mt-3 p-3 rounded-lg border border-emerald-300 bg-emerald-50/60 dark:bg-emerald-900/10">
          <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-300 mb-2">
            ✨ Closest available pairings ({fallback.window}) {egyptairOnly && fallback.offers.some(o => !((o.airline ?? '').startsWith('MS')))
              ? <span className="font-normal text-amber-700">— note: cache has no EgyptAir for those dates; showing other carriers too</span>
              : ''}:
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {fallback.offers.slice(0, 8).map((o, i) => {
              const dShift = o.suggested_depart_shift_days;
              const rShift = o.suggested_return_shift_days;
              const dStr = dShift == null ? '?' : dShift === 0 ? 'same day' : `${dShift > 0 ? '+' : ''}${dShift}d`;
              const rStr = rShift == null ? '?' : rShift === 0 ? 'same day' : `${rShift > 0 ? '+' : ''}${rShift}d`;
              const newDepart = o.outbound_depart_iso?.slice(0, 10);
              const newReturn = o.return_depart_iso?.slice(0, 10);
              const isMS = (o.airline ?? '').startsWith('MS');
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (newDepart) setDepartDate(newDepart);
                    if (newReturn) setReturnDate(newReturn);
                  }}
                  className={`text-left p-2 rounded-lg border cursor-pointer text-xs ${isMS ? 'border-emerald-300 bg-white hover:bg-emerald-50' : 'border-amber-200 bg-amber-50/30 hover:bg-amber-50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-emerald-700">{money(o.per_adult_usd)}/adult</div>
                    <span className={`badge ${isMS ? 'badge-ok' : 'badge-warn'} text-[10px]`}>{o.airline || '?'}</span>
                    <div className="text-[10px] text-slate-400 ml-auto">depart {dStr}, return {rStr}</div>
                  </div>
                  <div className="text-slate-600 mt-1">
                    {o.outbound_flight_no} {newDepart} → {o.return_flight_no} {newReturn}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {stopLabel(maxStops(o))} · party {money(o.total_party_usd)} · click to apply
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Coverage scan — when 0 results, show user which months actually have data */}
      {coverage && (
        <div className="mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-900/10">
          <div className="text-xs font-semibold text-amber-900 dark:text-amber-300 mb-2">
            Travelpayouts cache coverage · {originValue.split(',')[0]} → {destination} · {egyptairOnly ? 'EgyptAir (MS)' : 'any airline'}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {coverage.map(m => {
              const has = m.matchingAirline > 0;
              const days = Object.entries(m.byDay).sort();
              return (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => {
                    if (!has) return;
                    // Pick the cheapest day automatically
                    const firstDay = days[0]?.[0];
                    if (firstDay) {
                      setDepartDate(firstDay);
                      const after = new Date(firstDay);
                      after.setDate(after.getDate() + 14);
                      setReturnDate(after.toISOString().slice(0, 10));
                    }
                  }}
                  className={`text-left p-2 rounded-lg border text-xs ${has ? 'border-emerald-300 bg-white hover:bg-emerald-50 cursor-pointer' : 'border-slate-200 bg-slate-50 dark:bg-slate-800 opacity-70 cursor-not-allowed'}`}
                >
                  <div className="font-semibold text-slate-700 dark:text-slate-200">{m.month}</div>
                  <div className="text-[11px] mt-0.5">
                    {has
                      ? <span className="text-emerald-700 dark:text-emerald-400">{m.matchingAirline} flights · {Object.keys(m.byDay).length} days</span>
                      : <span className="text-slate-400">none cached ({m.totalCached} other airlines)</span>}
                  </div>
                  {has && days.length > 0 && (
                    <div className="text-[10px] text-slate-500 mt-1 truncate">
                      first: {days[0][0]}{days.length > 1 ? ` … last: ${days[days.length - 1][0]}` : ''}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Click a green cell to auto-fill that month&apos;s first cached date as Depart (Return = +14 days).</p>
        </div>
      )}

      {/* Diagnostics panel — always shows last call's result + per-provider notes */}
      {(diagnostics.length > 0 || echo) && (
        <details className="mt-3 text-xs" open={offers.length === 0 && diagnostics.length > 0}>
          <summary className="cursor-pointer text-slate-600 hover:text-slate-900 font-semibold">
            Provider diagnostics ({diagnostics.length})
          </summary>
          <div className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 space-y-2">
            {echo && (
              <div className="text-slate-500">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Bot received:</span>{' '}
                origin <code>{String(echo.origin)}</code>{' → '}<code>{String(echo.destination)}</code>{' · '}
                depart <code>{String(echo.departDate)}</code>{' / return '}<code>{String(echo.returnDate)}</code>{' · '}
                {String(echo.adults)} ad + {String(echo.infants)} inf · stops <code>{String(echo.stops)}</code>
              </div>
            )}
            <ul className="space-y-1">
              {diagnostics.map((d, i) => (
                <li key={i} className={`font-mono ${d.includes('ERROR') ? 'text-red-600' : 'text-slate-600 dark:text-slate-400'}`}>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {shown.length > 0 && (
        <table className="fmt mt-4">
          <thead>
            <tr>
              <th>#</th>
              <th>Origin</th>
              <th>Stops</th>
              <th>Outbound</th>
              <th>Return</th>
              <th>Per adult</th>
              <th>Party total</th>
              <th>Provider</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o, idx) => (
              <tr key={`${o.provider}-${idx}`}>
                <td className="text-slate-500 text-xs">{idx + 1}</td>
                <td className="font-semibold">{o.origin}</td>
                <td className="text-slate-500 text-xs">{stopLabel(maxStops(o))}</td>
                <td>
                  <div className="font-semibold">{o.outbound_flight_no || '—'}</div>
                  <div className="text-xs text-slate-500">{o.outbound_depart_iso || '—'}</div>
                </td>
                <td>
                  <div className="font-semibold">{o.return_flight_no || '—'}</div>
                  <div className="text-xs text-slate-500">{o.return_depart_iso || '—'}</div>
                </td>
                <td className="font-semibold">{money(o.per_adult_usd)}</td>
                <td>{money(o.total_party_usd)}</td>
                <td className="text-slate-500 text-xs">{o.provider}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

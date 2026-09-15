'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './Toaster';
import { AirportSelect } from './AirportSelect';

// Free-form quick search on the dashboard. Two modes:
//   - "Track" creates a tracked search (polls every 5 min, history, alerts).
//   - "Live search" jumps to /offers with the inputs prefilled.
export function QuickRouteSearch() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const toast = useToast();
  const [origin, setOrigin] = useState('JFK');
  const [destination, setDestination] = useState('CAI');
  const [depart, setDepart] = useState('');
  const [ret, setRet] = useState('');
  const [adults, setAdults] = useState(2);
  const [target, setTarget] = useState('');
  const [anyDates, setAnyDates] = useState(false);
  const [infants, setInfants] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'track' | 'live' | null>(null);

  function validate(): string | null {
    if (anyDates) {
      // No date pair needed — we search every month and alert on the cheapest window.
      if (origin.length !== 3 || !/^[A-Z]{3}$/.test(origin)) return 'Origin must be a 3-letter IATA code.';
      if (destination.length !== 3 || !/^[A-Z]{3}$/.test(destination)) return 'Destination must be a 3-letter IATA code.';
      if (origin === destination) return 'Origin and destination cannot be the same.';
      return null;
    }
    if (origin.length !== 3 || !/^[A-Z]{3}$/.test(origin)) return 'Origin must be a 3-letter IATA code.';
    if (destination.length !== 3 || !/^[A-Z]{3}$/.test(destination)) return 'Destination must be a 3-letter IATA code.';
    if (origin === destination) return 'Origin and destination cannot be the same.';
    if (!depart || !ret) return 'Pick both depart and return dates.';
    if (ret <= depart) return 'Return must be after depart.';
    return null;
  }

  async function track() {
    setErr(null);
    const v = validate();
    if (v) return setErr(v);
    setBusy('track');
    try {
      const res = await fetch('/api/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin, destination,
          depart_date: depart, return_date: ret,
          adults, infants,
          target_per_adult_usd: target.trim() ? Number(target) : null,
          date_mode: anyDates ? 'any' : 'exact',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = typeof j.error === 'string' ? j.error : 'Failed to add search.';
        setErr(msg);
        toast.error('Could not add search', msg);
        return;
      }
      toast.success('Search added', `${origin} → ${destination} · ${depart} → ${ret} now polling.`);
      start(() => router.refresh());
    } finally { setBusy(null); }
  }

  function liveSearch() {
    const v = validate();
    if (v) return setErr(v);
    const url = `/offers?origin=${origin}&destination=${destination}&depart=${depart}&return=${ret}&adults=${adults}&infants=${infants}`;
    router.push(url);
  }

  return (
    <section className="card card-feature">
      <div className="eyebrow">Search any route · worldwide</div>
      <h2 className="!mb-2">Track a fare or check live prices</h2>
      <p className="text-xs text-slate-500 mb-4">
        Any 3-letter airport code, any airline, any party size. <strong>Track</strong> adds it to your watchlist (polled every 30 min, 5 on Pro — alerts the moment it drops below your target). <strong>Live search</strong> jumps to /offers and queries the providers right now.
      </p>

      <div className="flex items-center gap-1 mb-3 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 w-fit">
        <button type="button" onClick={() => setAnyDates(false)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${!anyDates ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
          Exact dates
        </button>
        <button type="button" onClick={() => setAnyDates(true)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${anyDates ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
          Any dates
        </button>
        <span className="text-[11px] text-slate-500 ml-2 pr-2">
          {anyDates ? 'We scan all 12 months and alert on the cheapest window.' : 'Track one specific trip.'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
        <div className="text-xs">
          <span className="block mb-1 text-slate-500">Origin</span>
          <AirportSelect value={origin} onChange={setOrigin} placeholder="JFK, New York, …" />
        </div>
        <div className="text-xs">
          <span className="block mb-1 text-slate-500">Destination</span>
          <AirportSelect value={destination} onChange={setDestination} placeholder="CAI, Cairo, …" />
        </div>
        {!anyDates && (
          <>
            <label className="text-xs">
              <span className="block mb-1 text-slate-500">Depart</span>
              <input type="date" value={depart} onChange={e => setDepart(e.target.value)} className="w-full" />
            </label>
            <label className="text-xs">
              <span className="block mb-1 text-slate-500">Return</span>
              <input type="date" value={ret} onChange={e => setRet(e.target.value)} min={depart || undefined} className="w-full" />
            </label>
          </>
        )}
        <label className="text-xs">
          <span className="block mb-1 text-slate-500">Adults</span>
          <input type="number" min={1} max={9} value={adults} onChange={e => setAdults(Math.max(1, Math.min(9, parseInt(e.target.value, 10) || 1)))} className="w-full" />
        </label>
        <label className="text-xs">
          <span className="block mb-1 text-slate-500">Infants</span>
          <input type="number" min={0} max={4} value={infants} onChange={e => setInfants(Math.max(0, Math.min(4, parseInt(e.target.value, 10) || 0)))} className="w-full" />
        </label>
        <label className="text-xs">
          <span className="block mb-1 text-slate-500">Target $/adult <span className="text-slate-400">(optional)</span></span>
          <input type="number" min={1} step={10} placeholder="e.g. 600" value={target} onChange={e => setTarget(e.target.value.replace(/[^0-9]/g, ''))} className="w-full" />
        </label>
      </div>

      <div className="flex gap-2 mt-4">
        <button type="button" onClick={track} disabled={busy !== null || pending} className="btn btn-primary">
          {busy === 'track' ? 'Adding…' : '➕ Track this route'}
        </button>
        <button type="button" onClick={liveSearch} disabled={busy !== null} className="btn">
          🔎 Live search now →
        </button>
      </div>

      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
    </section>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './Toaster';
import { AirportSelect } from './AirportSelect';

// Free-form quick search on the dashboard. Two modes:
//   - "Track" creates a tracked search (recurring checks, history, alerts).
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
    <section className="ed-panel">
      <div className="ed-eyebrow">Search any route · worldwide</div>
      <h2 className="ed-h2">Track a fare or check live prices</h2>
      <p className="ed-panel-note" style={{ marginBottom: 16 }}>
        Any 3-letter airport code, any airline, any party size. <strong>Track</strong> adds it to your watchlist and we start checking it straight away, alerting you the moment it drops below your target. <strong>Live search</strong> jumps to /offers and queries the providers right now.
      </p>

      <div className="flex items-center gap-3 mb-3">
        <div className="ed-seg" role="tablist" aria-label="Date mode">
          <button type="button" onClick={() => setAnyDates(false)}
            className={`ed-seg-btn${!anyDates ? ' active' : ''}`}>
            Exact dates
          </button>
          <button type="button" onClick={() => setAnyDates(true)}
            className={`ed-seg-btn${anyDates ? ' active' : ''}`}>
            Any dates
          </button>
        </div>
        <span className="ed-panel-note" style={{ margin: 0 }}>
          {anyDates ? 'We scan all 12 months and alert on the cheapest window.' : 'Track one specific trip.'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
        <div>
          <span className="ed-label">Origin</span>
          <AirportSelect value={origin} onChange={setOrigin} placeholder="JFK, New York, …" />
        </div>
        <div>
          <span className="ed-label">Destination</span>
          <AirportSelect value={destination} onChange={setDestination} placeholder="CAI, Cairo, …" />
        </div>
        {!anyDates && (
          <>
            <label>
              <span className="ed-label">Depart</span>
              <input type="date" value={depart} onChange={e => setDepart(e.target.value)} className="ed-input" />
            </label>
            <label>
              <span className="ed-label">Return</span>
              <input type="date" value={ret} onChange={e => setRet(e.target.value)} min={depart || undefined} className="ed-input" />
            </label>
          </>
        )}
        <label>
          <span className="ed-label">Adults</span>
          <input type="number" min={1} max={9} value={adults} onChange={e => setAdults(Math.max(1, Math.min(9, parseInt(e.target.value, 10) || 1)))} className="ed-input" />
        </label>
        <label>
          <span className="ed-label">Infants</span>
          <input type="number" min={0} max={4} value={infants} onChange={e => setInfants(Math.max(0, Math.min(4, parseInt(e.target.value, 10) || 0)))} className="ed-input" />
        </label>
        <label>
          <span className="ed-label">Target $/adult <span style={{ color: 'var(--muted-2)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></span>
          <input type="number" min={1} step={10} placeholder="e.g. 600" value={target} onChange={e => setTarget(e.target.value.replace(/[^0-9]/g, ''))} className="ed-input" />
        </label>
      </div>

      <div className="flex gap-2 mt-4">
        <button type="button" onClick={track} disabled={busy !== null || pending} className="ed-btn ed-btn-primary">
          {busy === 'track' ? 'Adding…' : '➕ Track this route'}
        </button>
        <button type="button" onClick={liveSearch} disabled={busy !== null} className="ed-btn ed-btn-secondary">
          🔎 Live search now →
        </button>
      </div>

      {err && <p className="ed-panel-note" style={{ color: 'var(--red)', marginTop: 8 }}>{err}</p>}
    </section>
  );
}

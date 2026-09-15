'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { airportByCode, searchAirports } from '@/lib/airports';
import { bookingLink } from '@/lib/affiliate';

const CITY_METAROUTES: Record<string, { city: string; country: string }> = {
  NYC: { city: 'New York City (all airports)', country: 'USA' },
  LON: { city: 'London (all airports)', country: 'UK' },
  PAR: { city: 'Paris (all airports)', country: 'France' },
  TYO: { city: 'Tokyo (all airports)', country: 'Japan' },
  MOW: { city: 'Moscow (all airports)', country: 'Russia' },
  ROM: { city: 'Rome (all airports)', country: 'Italy' },
  MIL: { city: 'Milan (all airports)', country: 'Italy' },
  WAS: { city: 'Washington DC (all airports)', country: 'USA' },
  CHI: { city: 'Chicago (all airports)', country: 'USA' },
  BUE: { city: 'Buenos Aires (all airports)', country: 'Argentina' },
  YTO: { city: 'Toronto (all airports)', country: 'Canada' },
  SAO: { city: 'São Paulo (all airports)', country: 'Brazil' },
  RIO: { city: 'Rio de Janeiro (all airports)', country: 'Brazil' },
  BJS: { city: 'Beijing (all airports)', country: 'China' },
  SHA: { city: 'Shanghai (all airports)', country: 'China' },
  SEL: { city: 'Seoul (all airports)', country: 'South Korea' },
  STO: { city: 'Stockholm (all airports)', country: 'Sweden' },
  OSA: { city: 'Osaka (all airports)', country: 'Japan' },
};

type Suggestion = { iata: string; label: string; sub: string };

function suggest(query: string, limit = 10): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return Object.entries(CITY_METAROUTES).slice(0, 6).map(([iata, m]) => ({
      iata, label: m.city, sub: `${iata} · metro`,
    }));
  }
  const out: Suggestion[] = [];
  for (const [iata, m] of Object.entries(CITY_METAROUTES)) {
    if (iata.toLowerCase() === q || m.city.toLowerCase().includes(q))
      out.push({ iata, label: m.city, sub: `${iata} · metro · ${m.country}` });
  }
  for (const a of searchAirports(q, limit))
    out.push({ iata: a.iata, label: a.name, sub: `${a.iata} · ${a.city}, ${a.country}` });
  return out.slice(0, limit);
}

function resolveDisplay(iata: string): string {
  if (CITY_METAROUTES[iata]) return CITY_METAROUTES[iata].city;
  const a = airportByCode(iata);
  return a ? `${iata} — ${a.city}` : iata;
}

type TripType = 'round-trip' | 'one-way';

function SuggList({
  sugg, hl, onPick, onHL,
}: {
  sugg: Suggestion[];
  hl: number;
  onPick: (s: Suggestion) => void;
  onHL: (i: number) => void;
}) {
  return (
    <>
      {sugg.map((s, i) => (
        <button key={`${s.iata}-${i}`} type="button"
          onMouseDown={e => e.preventDefault()} onClick={() => onPick(s)} onMouseEnter={() => onHL(i)}
          className={`w-full text-left px-3 py-2 text-xs border-b border-slate-100 dark:border-slate-800 last:border-b-0 ${i === hl ? 'bg-brand/10 dark:bg-brand-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-brand-700 dark:text-brand-300 w-10 shrink-0">{s.iata}</span>
            <span className="flex-1 min-w-0">
              <span className="text-slate-800 dark:text-slate-100 truncate block">{s.label}</span>
              <span className="text-[10px] text-slate-400 truncate block">{s.sub}</span>
            </span>
          </div>
        </button>
      ))}
    </>
  );
}

export function FlightSearchForm({
  initialOrigin = 'NYC',
  initialMaxPrice = 500,
}: {
  initialOrigin?: string;
  initialMaxPrice?: number;
}) {
  const router = useRouter();
  const [tripType, setTripType] = useState<TripType>('round-trip');

  // Origin
  const [origin, setOrigin] = useState(initialOrigin);
  const [originQ, setOriginQ] = useState(() => resolveDisplay(initialOrigin));
  const [originOpen, setOriginOpen] = useState(false);
  const [originHL, setOriginHL] = useState(0);
  const originRef = useRef<HTMLDivElement>(null);

  // Destination
  const [dest, setDest] = useState('');
  const [destQ, setDestQ] = useState('');
  const [destOpen, setDestOpen] = useState(false);
  const [destHL, setDestHL] = useState(0);
  const destRef = useRef<HTMLDivElement>(null);

  const isAnywhere = !dest;

  // Dates — default 30 days out, 7-night trip
  const [departDate, setDepartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [returnDate, setReturnDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 37);
    return d.toISOString().slice(0, 10);
  });

  // Passengers
  const [adults, setAdults] = useState(1);
  const [paxOpen, setPaxOpen] = useState(false);
  const paxRef = useRef<HTMLDivElement>(null);

  // Budget for "Anywhere" mode
  const [budget, setBudget] = useState(initialMaxPrice);

  const [submitting, setSubmitting] = useState(false);

  const originSugg = useMemo(() => suggest(originQ), [originQ]);
  const destSugg = useMemo(() => suggest(destQ), [destQ]);

  useEffect(() => { setSubmitting(false); }, [initialOrigin, initialMaxPrice]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (originRef.current && !originRef.current.contains(e.target as Node)) setOriginOpen(false);
      if (destRef.current && !destRef.current.contains(e.target as Node)) setDestOpen(false);
      if (paxRef.current && !paxRef.current.contains(e.target as Node)) setPaxOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function pickOrigin(s: Suggestion) {
    setOrigin(s.iata);
    setOriginQ(`${s.iata} — ${s.label}`);
    setOriginOpen(false);
  }

  function pickDest(s: Suggestion) {
    setDest(s.iata);
    setDestQ(`${s.iata} — ${s.label}`);
    setDestOpen(false);
  }

  function go(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // Use stored IATA state first (set by autocomplete or initial prop).
    // Fall back to first-3-chars only when the user typed without selecting a suggestion.
    const typed = originQ.trim().slice(0, 3).toUpperCase();
    const fromCode = origin || (/^[A-Z]{3}$/.test(typed) ? typed : 'NYC');

    if (isAnywhere) {
      router.push(`/explore?from=${fromCode}&maxPrice=${budget}`);
      setTimeout(() => setSubmitting(false), 4000);
    } else {
      const href = bookingLink({
        origin: fromCode,
        destination: dest,
        departDate,
        returnDate: tripType === 'round-trip' ? returnDate : departDate,
        adults,
        infants: 0,
        trackAs: { perAdult: 0, provider: 'aviasales', surface: 'search-form' },
      });
      window.open(href, '_blank');
      setSubmitting(false);
    }
  }

  function makeKeyNav(
    open: boolean, setOpen: (v: boolean) => void,
    sugg: Suggestion[], hl: number, setHL: (fn: (v: number) => number) => void,
    pick: (s: Suggestion) => void,
  ) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHL(h => Math.min(sugg.length - 1, h + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHL(h => Math.max(0, h - 1)); }
      else if (e.key === 'Enter' && open && sugg[hl]) { e.preventDefault(); pick(sugg[hl]); }
      else if (e.key === 'Escape') setOpen(false);
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  // Shared classes
  const field = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white';
  const inp = 'flex-1 border-0 bg-transparent font-semibold focus:outline-none focus:ring-0 px-0 py-0 shadow-none text-white placeholder-white/50 text-sm min-w-0';
  const tag = 'text-[10px] uppercase tracking-wide text-white/50 shrink-0';
  const drop = 'absolute left-0 right-0 mt-1 max-h-60 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lift';

  return (
    <div className="rounded-2xl bg-white/8 backdrop-blur-md border border-white/20">
      {/* Trip type toggle */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2">
        {(['round-trip', 'one-way'] as TripType[]).map(t => (
          <button key={t} type="button" onClick={() => setTripType(t)}
            className={`text-xs px-3 py-1 rounded-full font-semibold transition ${
              tripType === t ? 'bg-[#d4af37] text-[#0a3a6b]' : 'text-white/65 hover:text-white hover:bg-white/10'
            }`}
          >
            {t === 'round-trip' ? 'Round-trip' : 'One-way'}
          </button>
        ))}
      </div>

      <form onSubmit={go} className="px-3 pb-3 flex flex-col sm:flex-row flex-wrap items-stretch gap-2">
        {/* From */}
        <div ref={originRef} className="relative flex-1 min-w-[160px]">
          <div className={field}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-white/60">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <input type="text" value={originQ} placeholder="From city"
              onChange={e => { setOriginQ(e.target.value); setOriginOpen(true); setOriginHL(0); setOrigin(''); }}
              onFocus={() => setOriginOpen(true)}
              onKeyDown={makeKeyNav(originOpen, setOriginOpen, originSugg, originHL, setOriginHL, pickOrigin)}
              className={inp} autoComplete="off" aria-label="Departure airport"
            />
            <span className={tag}>From</span>
          </div>
          {originOpen && originSugg.length > 0 && (
            <div className={drop} style={{ zIndex: 9999 }}>
              <SuggList sugg={originSugg} hl={originHL} onPick={pickOrigin} onHL={i => setOriginHL(i)} />
            </div>
          )}
        </div>

        {/* To */}
        <div ref={destRef} className="relative flex-1 min-w-[160px]">
          <div className={field}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-white/60">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <input type="text" value={destQ} placeholder="Anywhere"
              onChange={e => { setDestQ(e.target.value); setDestOpen(true); setDestHL(0); setDest(''); }}
              onFocus={() => setDestOpen(true)}
              onKeyDown={makeKeyNav(destOpen, setDestOpen, destSugg, destHL, setDestHL, pickDest)}
              className={inp} autoComplete="off" aria-label="Destination airport"
            />
            <span className={tag}>To</span>
          </div>
          {destOpen && (
            <div className={drop} style={{ zIndex: 9999 }}>
              <button type="button" onMouseDown={e => e.preventDefault()}
                onClick={() => { setDest(''); setDestQ(''); setDestOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-brand-700 dark:text-brand-300 w-10 shrink-0">ANY</span>
                  <span className="text-slate-800 dark:text-slate-100">Anywhere — explore all deals</span>
                </div>
              </button>
              <SuggList sugg={destSugg} hl={destHL} onPick={pickDest} onHL={i => setDestHL(i)} />
            </div>
          )}
        </div>

        {/* Budget (anywhere) OR Dates (specific dest) */}
        {isAnywhere ? (
          <div className={field + ' shrink-0'} style={{ minWidth: 130 }}>
            <span className="text-white/60 text-sm">$</span>
            <input type="number" min={50} max={5000} step={50} value={budget}
              onChange={e => setBudget(Number(e.target.value))}
              className={inp} style={{ width: 64 }} aria-label="Max budget USD"
            />
            <span className={tag}>Max</span>
          </div>
        ) : (
          <>
            <div className={field + ' shrink-0'} style={{ minWidth: 130 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-white/60">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <input type="date" value={departDate} min={today}
                onChange={e => setDepartDate(e.target.value)}
                className={inp + ' [color-scheme:dark]'} aria-label="Departure date"
              />
            </div>
            {tripType === 'round-trip' && (
              <div className={field + ' shrink-0'} style={{ minWidth: 130 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-white/60">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <input type="date" value={returnDate} min={departDate}
                  onChange={e => setReturnDate(e.target.value)}
                  className={inp + ' [color-scheme:dark]'} aria-label="Return date"
                />
              </div>
            )}
          </>
        )}

        {/* Passengers */}
        <div ref={paxRef} className="relative shrink-0">
          <button type="button" onClick={() => setPaxOpen(v => !v)}
            className={field + ' cursor-pointer gap-1.5'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span className="text-sm font-semibold">{adults} adult{adults !== 1 ? 's' : ''}</span>
            <span className="text-white/40 text-xs">▾</span>
          </button>
          {paxOpen && (
            <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lift p-3" style={{ zIndex: 9999 }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Adults</div>
                  <div className="text-[10px] text-slate-400">Age 12+</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setAdults(v => Math.max(1, v - 1))}
                    className="w-7 h-7 rounded-full border border-slate-300 dark:border-slate-600 text-sm font-bold flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200">−</button>
                  <span className="w-4 text-center font-semibold text-slate-800 dark:text-slate-100 tabular">{adults}</span>
                  <button type="button" onClick={() => setAdults(v => Math.min(9, v + 1))}
                    className="w-7 h-7 rounded-full border border-slate-300 dark:border-slate-600 text-sm font-bold flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200">+</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <button type="submit" disabled={submitting}
          className="shrink-0 px-5 py-2.5 rounded-xl font-bold text-sm bg-[#d4af37] text-[#0a3a6b] hover:bg-[#f0cc50] disabled:opacity-60 transition shadow-sm"
        >
          {submitting ? 'Loading…' : isAnywhere ? 'Find deals' : 'Search flights'}
        </button>
      </form>
    </div>
  );
}

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
          className={`ed-field-drop-row${i === hl ? ' hl' : ''}`}
        >
          <div className="flex items-center gap-2">
            <span className="ed-mono w-10 shrink-0" style={{ color: 'var(--accent)' }}>{s.iata}</span>
            <span className="flex-1 min-w-0">
              <span className="truncate block" style={{ color: 'var(--ink)' }}>{s.label}</span>
              <span className="text-[10px] truncate block" style={{ color: 'var(--muted-2)' }}>{s.sub}</span>
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

  // Shared classes — layout only; colour/surface live on .ed-field* in editorial.css.
  const field = 'ed-field';
  const inp = 'ed-field-input';
  const tag = 'ed-field-tag';
  const drop = 'ed-field-drop';
  const iconColor = { color: 'color-mix(in srgb, var(--panel-fg) 60%, var(--panel-bg))' } as const;

  return (
    <div style={{ background: 'color-mix(in srgb, var(--panel-fg) 8%, var(--panel-bg))', border: '1px solid color-mix(in srgb, var(--panel-fg) 20%, var(--panel-bg))', borderRadius: 0 }}>
      {/* Trip type toggle */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2">
        {(['round-trip', 'one-way'] as TripType[]).map(t => (
          <button key={t} type="button" onClick={() => setTripType(t)}
            className="text-xs px-3 py-1 font-semibold transition"
            style={{
              borderRadius: 0,
              background: tripType === t ? 'var(--panel-fg)' : 'transparent',
              color: tripType === t ? 'var(--panel-bg)' : 'color-mix(in srgb, var(--panel-fg) 72%, var(--panel-bg))',
            }}
          >
            {t === 'round-trip' ? 'Round-trip' : 'One-way'}
          </button>
        ))}
      </div>

      <form onSubmit={go} className="px-3 pb-3 flex flex-col sm:flex-row flex-wrap items-stretch gap-2">
        {/* From */}
        <div ref={originRef} className="relative flex-1 min-w-[160px]">
          <div className={field}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0" style={iconColor}>
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0" style={iconColor}>
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
                className="ed-field-drop-row"
              >
                <div className="flex items-center gap-2">
                  <span className="ed-mono w-10 shrink-0" style={{ color: 'var(--accent)' }}>ANY</span>
                  <span style={{ color: 'var(--ink)' }}>Anywhere — explore all deals</span>
                </div>
              </button>
              <SuggList sugg={destSugg} hl={destHL} onPick={pickDest} onHL={i => setDestHL(i)} />
            </div>
          )}
        </div>

        {/* Budget (anywhere) OR Dates (specific dest) */}
        {isAnywhere ? (
          <div className={field + ' shrink-0'} style={{ minWidth: 130 }}>
            <span className="text-sm" style={{ color: 'color-mix(in srgb, var(--panel-fg) 72%, var(--panel-bg))' }}>$</span>
            <input type="number" min={50} max={5000} step={50} value={budget}
              onChange={e => setBudget(Number(e.target.value))}
              className={inp} style={{ width: 64 }} aria-label="Max budget USD"
            />
            <span className={tag}>Max</span>
          </div>
        ) : (
          <>
            <div className={field + ' shrink-0'} style={{ minWidth: 130 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" style={iconColor}>
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <input type="date" value={departDate} min={today}
                onChange={e => setDepartDate(e.target.value)}
                className={inp + ' [color-scheme:dark]'} aria-label="Departure date"
              />
            </div>
            {tripType === 'round-trip' && (
              <div className={field + ' shrink-0'} style={{ minWidth: 130 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" style={iconColor}>
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={iconColor}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span className="text-sm font-semibold">{adults} adult{adults !== 1 ? 's' : ''}</span>
            <span className="text-xs" style={{ color: 'color-mix(in srgb, var(--panel-fg) 72%, var(--panel-bg))' }}>▾</span>
          </button>
          {paxOpen && (
            <div className="absolute right-0 mt-1 w-52 p-3" style={{ zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 0 }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Adults</div>
                  <div className="text-[10px]" style={{ color: 'var(--muted-2)' }}>Age 12+</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setAdults(v => Math.max(1, v - 1))}
                    className="w-7 h-7 text-sm font-bold flex items-center justify-center"
                    style={{ borderRadius: 0, border: '1px solid var(--rule-strong)', color: 'var(--ink-soft)' }}>−</button>
                  <span className="w-4 text-center font-semibold tabular" style={{ color: 'var(--ink)' }}>{adults}</span>
                  <button type="button" onClick={() => setAdults(v => Math.min(9, v + 1))}
                    className="w-7 h-7 text-sm font-bold flex items-center justify-center"
                    style={{ borderRadius: 0, border: '1px solid var(--rule-strong)', color: 'var(--ink-soft)' }}>+</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <button type="submit" disabled={submitting}
          className="ed-btn ed-btn-primary shrink-0 px-5 py-2.5 text-sm justify-center"
          style={{ background: 'var(--amber)', color: 'var(--panel-bg)' }}
        >
          {submitting ? 'Loading…' : isAnywhere ? 'Find deals' : 'Search flights'}
        </button>
      </form>
    </div>
  );
}

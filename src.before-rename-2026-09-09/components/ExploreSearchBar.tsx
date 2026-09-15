'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AIRPORTS, airportByCode, searchAirports, type Airport } from '@/lib/airports';

// Multi-airport city codes that aren't in the IATA airport list. Aviasales
// (and our /go) accept them — they expand to "any airport in this metro".
// Used as fallback when typed text doesn't match a single airport.
const CITY_METAROUTES: Record<string, { city: string; country: string }> = {
  NYC: { city: 'New York City (all airports)', country: 'USA' },
  LON: { city: 'London (all airports)', country: 'UK' },
  PAR: { city: 'Paris (all airports)', country: 'France' },
  TYO: { city: 'Tokyo (all airports)', country: 'Japan' },
  MOW: { city: 'Moscow (all airports)', country: 'Russia' },
  ROM: { city: 'Rome (all airports)', country: 'Italy' },
  MIL: { city: 'Milan (all airports)', country: 'Italy' },
  STO: { city: 'Stockholm (all airports)', country: 'Sweden' },
  WAS: { city: 'Washington DC (all airports)', country: 'USA' },
  CHI: { city: 'Chicago (all airports)', country: 'USA' },
  BUE: { city: 'Buenos Aires (all airports)', country: 'Argentina' },
  YTO: { city: 'Toronto (all airports)', country: 'Canada' },
  YMQ: { city: 'Montreal (all airports)', country: 'Canada' },
  SAO: { city: 'São Paulo (all airports)', country: 'Brazil' },
  RIO: { city: 'Rio de Janeiro (all airports)', country: 'Brazil' },
  BJS: { city: 'Beijing (all airports)', country: 'China' },
  SHA: { city: 'Shanghai (all airports)', country: 'China' },
  SEL: { city: 'Seoul (all airports)', country: 'South Korea' },
  OSA: { city: 'Osaka (all airports)', country: 'Japan' },
};

type Suggestion = { iata: string; label: string; sub: string };

function suggestionsFor(query: string, limit = 12): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [
      ...Object.entries(CITY_METAROUTES).slice(0, 6).map(([iata, m]) => ({ iata, label: m.city, sub: `${iata} · metro` })),
    ];
  }
  const out: Suggestion[] = [];
  // City metaroutes — match first since they're typically what users want.
  for (const [iata, m] of Object.entries(CITY_METAROUTES)) {
    if (iata.toLowerCase() === q || m.city.toLowerCase().includes(q)) {
      out.push({ iata, label: m.city, sub: `${iata} · metro · ${m.country}` });
    }
  }
  for (const a of searchAirports(q, limit)) {
    out.push({ iata: a.iata, label: `${a.name}`, sub: `${a.iata} · ${a.city}, ${a.country}` });
  }
  return out.slice(0, limit);
}

export function ExploreSearchBar({
  initialOrigin,
  initialMaxPrice,
}: {
  initialOrigin: string;
  initialMaxPrice: number;
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState(initialOrigin);
  const [query, setQuery] = useState<string>(() => {
    const a = airportByCode(initialOrigin);
    return a ? `${initialOrigin} — ${a.city}` : (CITY_METAROUTES[initialOrigin]?.city ?? initialOrigin);
  });
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [budget, setBudget] = useState(initialMaxPrice);
  const [submitting, setSubmitting] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const sugg = useMemo(() => suggestionsFor(query), [query]);

  // Reset the "Loading…" state once the parent re-renders with new initial
  // props (i.e. router.push to /explore?from=X&maxPrice=Y has landed and the
  // server pushed fresh data). Without this the button stays "Loading…"
  // forever because Next does a soft-nav and the component never unmounts.
  useEffect(() => {
    setSubmitting(false);
  }, [initialOrigin, initialMaxPrice]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(s: Suggestion) {
    setOrigin(s.iata);
    setQuery(`${s.iata} — ${s.label}`);
    setOpen(false);
  }

  function go(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // Prefer what the user actually typed last. If the query starts with a
    // clean 3-letter IATA (e.g. "PAR" or "PAR — Paris (all airports)") use
    // that; otherwise fall back to the last picked IATA, then NYC. Previously
    // the stale `origin` state always won, so typing "PAR" still searched
    // NYC.
    const typedCode = query.trim().slice(0, 3).toUpperCase();
    const looksLikeCode = /^[A-Z]{3}$/.test(typedCode);
    const final = looksLikeCode ? typedCode : (origin || 'NYC');
    router.push(`/explore?from=${final}&maxPrice=${budget}`);
    // Safety fallback: if the props don't change (e.g. user clicked Find
    // deals with the same origin+budget), the useEffect above won't fire
    // and we'd get stuck on Loading. Clear after 4s regardless.
    setTimeout(() => setSubmitting(false), 4000);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(sugg.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      if (open && sugg[highlight]) {
        e.preventDefault();
        pick(sugg[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <form
      onSubmit={go}
      className="bg-white/10 backdrop-blur-md rounded-2xl p-2 flex flex-col sm:flex-row items-stretch gap-2 max-w-2xl border border-white/20"
    >
      <div ref={boxRef} className="flex-1 relative">
        <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-white/10 border border-white/20 text-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80 shrink-0">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlight(0);
              // Clear committed origin if the user is typing fresh so the
              // free-text escape hatch in go() takes over on submit.
              setOrigin('');
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="City or airport"
            className="flex-1 border-0 bg-transparent text-base font-semibold focus:outline-none focus:ring-0 px-0 py-2 shadow-none text-white placeholder-white/60"
            style={{ boxShadow: 'none', borderColor: 'transparent' }}
            aria-label="Home airport or city"
            autoComplete="off"
          />
          <span className="text-[10px] uppercase tracking-wide font-semibold text-white/60">From</span>
        </div>
        {open && sugg.length > 0 && (
          <div
            className="absolute left-0 right-0 mt-1 max-h-80 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lift"
            style={{ zIndex: 9999 }}
          >
            {sugg.map((s, i) => (
              <button
                key={`${s.iata}-${i}`}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-3 py-2 text-xs border-b border-slate-100 dark:border-slate-800 last:border-b-0 ${
                  i === highlight ? 'bg-brand/10 dark:bg-brand-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-brand-700 dark:text-brand-300 w-12 shrink-0">{s.iata}</span>
                  <span className="flex-1 min-w-0">
                    <span className="text-slate-800 dark:text-slate-100 truncate block">{s.label}</span>
                    <span className="text-[10px] text-slate-500 truncate block">{s.sub}</span>
                  </span>
                </div>
              </button>
            ))}
            <div className="px-3 py-1.5 text-[10px] text-slate-500 border-t border-slate-100 dark:border-slate-800">
              Searching {AIRPORTS.length}+ airports. Type a 3-letter IATA to use it verbatim.
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-white/10 border border-white/20 text-white">
        <span className="text-white/70 text-sm">$</span>
        <input
          type="number"
          min={50}
          max={5000}
          step={50}
          value={budget}
          onChange={e => setBudget(Number(e.target.value))}
          className="w-24 border-0 bg-transparent text-base font-semibold focus:outline-none focus:ring-0 px-0 py-2 shadow-none text-white placeholder-white/60"
          style={{ boxShadow: 'none', borderColor: 'transparent' }}
          aria-label="Max budget USD"
        />
        <span className="text-[10px] uppercase tracking-wide font-semibold text-white/60">Max budget</span>
      </div>

      <button type="submit" className="btn btn-primary !rounded-xl !px-5 !text-sm" disabled={submitting}>
        {submitting ? 'Loading…' : 'Find deals'}
      </button>
    </form>
  );
}

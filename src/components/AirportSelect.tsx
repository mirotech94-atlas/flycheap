'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AIRPORTS, airportByCode, airportLabel, searchAirports, type Airport } from '@/lib/airports';

/**
 * Typeahead airport picker. Renders a single text input that opens a dropdown
 * of matching airports as the user types. Backing form value is the IATA
 * code, so consumers don't need to handle the display label.
 *
 * Usage:
 *   <AirportSelect value={origin} onChange={setOrigin} name="origin" required />
 */
export function AirportSelect({
  value,
  onChange,
  name,
  required,
  placeholder = 'IATA, city, or airport name',
  className = '',
  id,
  excludeCodes,
}: {
  value: string;
  onChange: (iata: string) => void;
  name?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  excludeCodes?: string[];
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Whenever the parent value changes, sync the visible input so the user
  // sees "JFK — John F. Kennedy Intl, New York" instead of bare "JFK".
  useEffect(() => {
    const a = airportByCode(value);
    if (!open) setQuery(a ? airportLabel(a) : value);
  }, [value, open]);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const exclude = useMemo(() => new Set((excludeCodes ?? []).map(c => c.toUpperCase())), [excludeCodes]);

  // When typing, derive results from the query; when closed (no typing yet)
  // we still want the dropdown to feel useful — fall back to popular hubs.
  const results = useMemo<Airport[]>(() => {
    const matches = searchAirports(query, 50);
    return matches.filter(a => !exclude.has(a.iata)).slice(0, 25);
  }, [query, exclude]);

  function pick(a: Airport) {
    onChange(a.iata);
    setQuery(airportLabel(a));
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(results.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const a = results[highlight];
      if (a) pick(a);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => { setOpen(true); inputRef.current?.select(); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="ed-input"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {/* Hidden input so vanilla <form> submits the IATA code, not the visible label. */}
      {name && <input type="hidden" name={name} value={value} required={required} />}

      {open && (
        <div className="ed-field-drop" style={{ zIndex: 30 }}>
          {results.length === 0 ? (
            <div className="px-3 py-3" style={{ fontSize: 12, color: 'var(--muted)' }}>
              No airports match &quot;{query}&quot;. Searched across {AIRPORTS.length} commercial airports.
            </div>
          ) : results.map((a, i) => (
            <button
              key={a.iata}
              type="button"
              onMouseDown={e => e.preventDefault() /* keep focus on input */}
              onClick={() => pick(a)}
              onMouseEnter={() => setHighlight(i)}
              className={`ed-field-drop-row${i === highlight ? ' hl' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="ed-mono w-12 shrink-0" style={{ color: 'var(--accent)' }}>{a.iata}</span>
                <span className="flex-1 min-w-0">
                  <span className="truncate block" style={{ color: 'var(--ink)' }}>{a.name}</span>
                  <span className="text-[10px] truncate block" style={{ color: 'var(--muted-2)' }}>{a.city} · {a.country}</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

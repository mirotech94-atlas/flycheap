'use client';

import { useState, useRef, useEffect } from 'react';
import { crossShopLinks } from '@/lib/utils';

type Opts = {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  adults: number;
  infants: number;
  size?: 'sm' | 'md';
  onChecklist?: () => void;
};

export function BookButton(opts: Opts) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const links = crossShopLinks(opts);
  const primary = links[0]; // Aviasales — uses our affiliate token

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sizeClass = opts.size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div ref={ref} className="relative inline-flex">
      <a
        href={primary.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`btn btn-primary ${sizeClass} rounded-r-none border-r border-brand-800/40`}
      >
        Book →
      </a>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen(o => !o); }}
        className={`btn btn-primary ${sizeClass} rounded-l-none px-2 border-l-0`}
        aria-label="More booking options"
        title="Compare on other sites"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-60 bg-white dark:bg-slate-900 rounded-xl shadow-lift border border-slate-200 dark:border-slate-700 overflow-hidden z-30">
          <div className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-800">
            Compare same itinerary on
          </div>
          {links.map(l => (
            <a
              key={l.name}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              onClick={() => setOpen(false)}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: l.color }} />
              <span className="flex-1">{l.name}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
            </a>
          ))}
          {opts.onChecklist && (
            <>
              <div className="border-t border-slate-100 dark:border-slate-800" />
              <button
                onClick={() => { setOpen(false); opts.onChecklist?.(); }}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="flex-1">Pre-flight checklist</span>
                <span className="text-slate-400 text-xs">↗</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

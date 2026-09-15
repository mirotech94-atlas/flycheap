'use client';

import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';

export function DatePopover({
  value,
  onChange,
  label,
  minDate,
}: {
  value: string; // YYYY-MM-DD
  onChange: (next: string) => void;
  label: string;
  minDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const selected = value ? new Date(value + 'T00:00:00') : undefined;
  const min = minDate ? new Date(minDate + 'T00:00:00') : new Date();

  return (
    <div className="relative" ref={ref}>
      <label>{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-1.5 text-left rounded-md border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 hover:border-slate-400"
      >
        {selected
          ? <span className="text-slate-900">{format(selected, 'EEE, MMM d, yyyy')}</span>
          : <span className="text-slate-400">Pick a date…</span>}
        <span className="float-right text-slate-400">📅</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl p-2">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) {
                onChange(format(d, 'yyyy-MM-dd'));
                setOpen(false);
              }
            }}
            disabled={{ before: min }}
            captionLayout="dropdown"
            startMonth={new Date()}
            endMonth={new Date(new Date().getFullYear() + 2, 11)}
            showOutsideDays
          />
        </div>
      )}
    </div>
  );
}

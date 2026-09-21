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
        className="ed-date-trigger"
      >
        {selected
          ? <span style={{ color: 'var(--ink)' }}>{format(selected, 'EEE, MMM d, yyyy')}</span>
          : <span style={{ color: 'var(--muted)' }}>Pick a date…</span>}
        <span className="float-right" style={{ color: 'var(--muted)' }}>📅</span>
      </button>
      {open && (
        <div className="ed-date-panel">
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

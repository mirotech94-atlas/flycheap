'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Branded select replacement — no deps. Behaves like a native <select> for
 * keyboard / ARIA semantics but renders custom chrome that matches the rest
 * of the design system (dark mode aware, focus rings, dropdown overlay).
 *
 * Usage:
 *   <Select value={tier} onChange={setTier} options={[
 *     { value: 'free', label: 'Free' },
 *     { value: 'pro',  label: 'Pro · $9/mo' },
 *   ]} />
 */
export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const current = options.find(o => o.value === value);

  // Close on outside-click / escape, restore focus to trigger.
  useEffect(() => {
    if (!open) return;
    setActiveIdx(options.findIndex(o => o.value === value));
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current && !buttonRef.current.contains(t) && listRef.current && !listRef.current.contains(t)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(options.length - 1, i + 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
      if (e.key === 'Enter' && activeIdx >= 0) {
        const opt = options[activeIdx];
        if (opt && !opt.disabled) { onChange(opt.value); setOpen(false); buttonRef.current?.focus(); }
      }
    }
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value, options.length, activeIdx]);

  return (
    <div className={`relative inline-block ${className ?? ''}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`w-full inline-flex items-center justify-between gap-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-slate-400 dark:hover:border-slate-500'}`}
      >
        <span className={current ? '' : 'text-slate-400 dark:text-slate-500'}>
          {current?.label ?? placeholder}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className="fc-glass absolute z-50 mt-1 min-w-full max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 shadow-lift py-1 motion-slide-up"
          style={{ minWidth: 'max(160px, 100%)' }}
        >
          {options.map((opt, i) => {
            const selected = opt.value === value;
            const active = i === activeIdx;
            return (
              <li key={opt.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => { onChange(opt.value); setOpen(false); buttonRef.current?.focus(); }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full text-left text-xs px-3 py-2 flex items-start gap-2 ${
                    selected ? 'text-brand-700 dark:text-brand-300 font-semibold' : 'text-slate-700 dark:text-slate-200'
                  } ${active ? 'bg-slate-100 dark:bg-slate-700/70' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'} ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <span aria-hidden="true" className="w-3 inline-block">{selected ? '✓' : ''}</span>
                  <span className="flex-1">
                    {opt.label}
                    {opt.description && (
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-normal">{opt.description}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

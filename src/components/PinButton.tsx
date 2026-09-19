'use client';

import { useEffect, useState } from 'react';
import { dealKey, loadPins, togglePin, PIN_EVENT, type PinnedDeal } from '@/lib/pinned';

export function PinButton({ deal }: { deal: PinnedDeal }) {
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const refresh = () => setPinned(loadPins().some(p => p.key === dealKey(deal)));
    refresh();
    window.addEventListener(PIN_EVENT, refresh);
    return () => window.removeEventListener(PIN_EVENT, refresh);
  }, [deal]);

  function onClick() {
    togglePin({ ...deal, key: dealKey(deal) });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={pinned ? 'Unpin from comparison' : 'Pin to compare (up to 3)'}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition-all ${
        pinned
          ? 'bg-[var(--nc-teal)] text-[var(--nc-dark)] shadow ring-2 ring-[var(--nc-teal)]/40'
          : 'text-slate-400 hover:text-brand-700 hover:bg-brand/5'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 17v5" />
        <path d="M9 10.76V6a3 3 0 0 1 6 0v4.76l3 3.24v2H6v-2z" />
      </svg>
    </button>
  );
}

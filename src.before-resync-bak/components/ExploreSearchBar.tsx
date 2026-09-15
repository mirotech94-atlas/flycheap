'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ExploreSearchBar({
  initialOrigin,
  initialMaxPrice,
}: {
  initialOrigin: string;
  initialMaxPrice: number;
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState(initialOrigin);
  const [budget, setBudget] = useState(initialMaxPrice);
  const [submitting, setSubmitting] = useState(false);

  function go(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const o = origin.trim().toUpperCase() || 'NYC';
    router.push(`/explore?from=${o}&maxPrice=${budget}`);
  }

  return (
    <form onSubmit={go} className="bg-white/10 backdrop-blur-md rounded-2xl p-2 flex flex-col sm:flex-row items-stretch gap-2 max-w-2xl border border-white/20">
      <div className="flex-1 flex items-center gap-2 px-3 py-1 rounded-xl bg-white/95 text-slate-900">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-700"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <input
          type="text"
          value={origin}
          maxLength={3}
          onChange={e => setOrigin(e.target.value.toUpperCase())}
          placeholder="NYC"
          className="flex-1 border-0 bg-transparent text-base font-semibold focus:outline-none focus:ring-0 px-0 py-2 shadow-none"
          style={{ boxShadow: 'none', borderColor: 'transparent' }}
          aria-label="Home airport / city IATA code"
        />
        <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">From</span>
      </div>

      <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-white/95 text-slate-900">
        <span className="text-slate-500 text-sm">$</span>
        <input
          type="number"
          min={50}
          max={5000}
          step={50}
          value={budget}
          onChange={e => setBudget(Number(e.target.value))}
          className="w-24 border-0 bg-transparent text-base font-semibold focus:outline-none focus:ring-0 px-0 py-2 shadow-none"
          style={{ boxShadow: 'none', borderColor: 'transparent' }}
          aria-label="Max budget USD"
        />
        <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">Max budget</span>
      </div>

      <button type="submit" className="btn btn-primary !rounded-xl !px-5 !text-sm" disabled={submitting}>
        {submitting ? 'Loading…' : 'Find deals'}
      </button>
    </form>
  );
}

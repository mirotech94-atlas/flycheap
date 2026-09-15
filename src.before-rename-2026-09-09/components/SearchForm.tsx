'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DatePopover } from './DatePopover';

export function SearchForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [origin, setOrigin] = useState<'JFK' | 'EWR'>('JFK');
  const [departDate, setDepartDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!departDate || !returnDate) {
      setErr('Pick both depart and return dates.');
      return;
    }
    if (returnDate <= departDate) {
      setErr('Return date must be after depart date.');
      return;
    }
    const days = (new Date(returnDate).getTime() - new Date(departDate).getTime()) / 86_400_000;
    if (days > 62) {
      setErr(`Trip is ${Math.round(days)} days — max stay is 62 days (2 months).`);
      return;
    }
    const res = await fetch('/api/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin,
        destination: 'CAI',
        depart_date: departDate,
        return_date: returnDate,
        adults: 4,
        infants: 1,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === 'string' ? j.error : 'Failed to add search');
      return;
    }
    setDepartDate('');
    setReturnDate('');
    start(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="card">
      <h2>Add a new search</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label>Origin</label>
          <select value={origin} onChange={(e) => setOrigin(e.target.value as 'JFK' | 'EWR')} className="w-full">
            <option value="JFK">JFK — New York</option>
            <option value="EWR">EWR — Newark (no nonstop on EgyptAir)</option>
          </select>
        </div>
        <DatePopover
          label="Depart date"
          value={departDate}
          onChange={setDepartDate}
        />
        <DatePopover
          label="Return date"
          value={returnDate}
          onChange={setReturnDate}
          minDate={departDate}
        />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Adding…' : 'Add search'}
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-2">Party fixed at 4 adults + 1 infant on lap, EgyptAir nonstop only, destination CAI. Note: EgyptAir does NOT fly nonstop EWR→CAI — only JFK.</p>
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
    </form>
  );
}

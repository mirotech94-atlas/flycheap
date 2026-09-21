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
    <form onSubmit={submit} className="ed-panel">
      <h2 className="ed-h2">Add a new search</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label className="ed-label">Origin</label>
          <select value={origin} onChange={(e) => setOrigin(e.target.value as 'JFK' | 'EWR')} className="ed-input">
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
        <button type="submit" className="ed-btn ed-btn-primary" disabled={pending}>
          {pending ? 'Adding…' : 'Add search'}
        </button>
      </div>
      <p className="ed-panel-note">Party fixed at 4 adults + 1 infant on lap, EgyptAir nonstop only, destination CAI. Note: EgyptAir does NOT fly nonstop EWR→CAI — only JFK.</p>
      {err && <p className="ed-panel-note" style={{ color: 'var(--red)', marginTop: 8 }}>{err}</p>}
    </form>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function PollNowButton({ searchId, label = 'Poll now' }: { searchId?: number; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    setMsg(null);
    const url = searchId ? `/api/poll?search_id=${searchId}` : '/api/poll';
    const res = await fetch(url, { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(`Error: ${j.error ?? res.statusText}`);
      setTimeout(() => setMsg(null), 5_000);
      return;
    }
    // Surface the actual poll result instead of a generic message.
    const results: Array<{ ok: boolean; cheapest_per_adult?: number; error?: string; origin: string }> =
      j.results ?? (j.result ? [j.result] : []);
    const summary = results
      .map(r => r.ok && r.cheapest_per_adult
        ? `${r.origin}: $${Math.round(r.cheapest_per_adult)}/adult`
        : `${r.origin}: ${r.error ?? 'no offers'}`)
      .join(' · ');
    setMsg(`✓ ${summary || 'polled'}`);
    start(() => router.refresh());
    setTimeout(() => setMsg(null), 5_000);
  }

  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-primary" disabled={pending} onClick={go}>
        {pending ? 'Polling…' : label}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function RefreshDealsButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    setMsg('Scan queued — refreshing in the background…');
    const res = await fetch('/api/best-deals', { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(`Error: ${j.error ?? res.statusText}`);
      return;
    }
    setMsg(j.status === 'running' ? 'Scan already running — dashboard will update shortly.' : 'Scan started — dashboard stays usable.');
    window.setTimeout(() => start(() => router.refresh()), 2500);
  }

  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-primary" disabled={pending} onClick={go}>
        {pending ? 'Scanning…' : 'Scan 12 months'}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}

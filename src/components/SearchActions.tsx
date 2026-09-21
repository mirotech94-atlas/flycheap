'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function SearchActions({
  id,
  active,
  snoozedUntil,
}: {
  id: number;
  active: boolean;
  snoozedUntil?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isSnoozed = !!snoozedUntil && new Date(snoozedUntil) > new Date();

  async function patch(body: object) {
    await fetch(`/api/searches/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    start(() => router.refresh());
  }

  async function snooze(days: number) {
    await patch({ snooze_days: days });
  }

  async function toggle()  { await patch({ active: active ? 0 : 1 }); }
  async function del() {
    if (!confirm('Delete this search and all its fare history?')) return;
    await fetch(`/api/searches/${id}`, { method: 'DELETE' });
    start(() => router.refresh());
  }

  return (
    <div className="flex gap-1 flex-wrap">
      <button className="ed-btn ed-btn-secondary" onClick={toggle} disabled={pending}>
        {active ? 'Pause' : 'Resume'}
      </button>
      {isSnoozed ? (
        <button className="ed-btn ed-btn-secondary" onClick={() => snooze(0)} disabled={pending} title={`Snoozed until ${snoozedUntil}`}>
          Wake 💤
        </button>
      ) : (
        <div className="flex gap-1">
          <button className="ed-btn ed-btn-secondary" onClick={() => snooze(7)}  disabled={pending} title="Mute alerts for 7 days">Snooze 7d</button>
          <button className="ed-btn ed-btn-secondary" onClick={() => snooze(30)} disabled={pending} title="Mute alerts for 30 days">30d</button>
        </div>
      )}
      <button className="ed-btn ed-btn-danger" onClick={del} disabled={pending}>
        Delete
      </button>
    </div>
  );
}

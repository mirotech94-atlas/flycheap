'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Session = {
  token: string; user_id: number; created_at: string; expires_at: string;
  email: string; name: string | null; tier: string;
  last_action_at: string | null; last_ip: string | null;
};

function fmtRel(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

import { useToast } from './Toaster';
import { confirm as confirmDialog } from './ConfirmDialog';

export function AdminSessionsTable({ sessions }: { sessions: Session[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  async function revoke(token: string) {
    setErr(null);
    setBusy(token);
    try {
      const r = await fetch(`/api/admin/sessions?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const msg = j.error || `HTTP ${r.status}`;
        setErr(msg);
        toast.error('Revoke failed', msg);
        return;
      }
      toast.success('Session revoked', `Token ${token.slice(0, 8)}… is no longer valid.`);
      start(() => router.refresh());
    } finally { setBusy(null); }
  }

  async function revokeAll(userId: number) {
    const ok = await confirmDialog({
      title: `Revoke ALL sessions for user #${userId}?`,
      description: 'They will be signed out on every device immediately. They can sign back in via magic link.',
      confirmLabel: 'Revoke all',
      destructive: true,
    });
    if (!ok) return;
    setErr(null);
    setBusy(`u:${userId}`);
    try {
      const r = await fetch(`/api/admin/sessions?user_id=${userId}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const msg = j.error || `HTTP ${r.status}`;
        setErr(msg);
        toast.error('Revoke-all failed', msg);
        return;
      }
      toast.success('All sessions revoked', `User #${userId} signed out everywhere.`);
      start(() => router.refresh());
    } finally { setBusy(null); }
  }

  return (
    <div className="card overflow-x-auto">
      <h2 className="!mb-2">Active sessions ({sessions.length})</h2>
      <p className="text-xs text-slate-500 mb-3">
        Every live cookie. Revoke individually or all-at-once per user. Your own current session cannot be revoked from here — use Sign out in the user menu.
      </p>
      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
      {sessions.length === 0 ? (
        <div className="text-sm text-slate-500 py-6 text-center">No active sessions.</div>
      ) : (
        <table className="fmt">
          <thead>
            <tr>
              <th>User</th>
              <th>Tier</th>
              <th>Token</th>
              <th>Started</th>
              <th>Expires</th>
              <th>Last action</th>
              <th>Last IP</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.token}>
                <td>
                  <div className="font-semibold text-xs">{s.email}</div>
                  {s.name && <div className="text-[10px] text-slate-500">{s.name}</div>}
                </td>
                <td><span className="badge badge-muted">{s.tier}</span></td>
                <td className="font-mono text-[10px]">{s.token.slice(0, 12)}…</td>
                <td className="text-xs text-slate-500 whitespace-nowrap">{fmtRel(s.created_at)}</td>
                <td className="text-xs text-slate-500 whitespace-nowrap">{s.expires_at.slice(0, 10)}</td>
                <td className="text-xs text-slate-500 whitespace-nowrap">{fmtRel(s.last_action_at)}</td>
                <td className="font-mono text-[10px] text-slate-500">{s.last_ip ?? '—'}</td>
                <td className="space-x-1 whitespace-nowrap">
                  <button onClick={() => revoke(s.token)} disabled={busy === s.token} className="btn btn-sm btn-danger">
                    Revoke
                  </button>
                  <button onClick={() => revokeAll(s.user_id)} disabled={busy === `u:${s.user_id}`} className="btn btn-sm" title="Revoke every session for this user">
                    Revoke all
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

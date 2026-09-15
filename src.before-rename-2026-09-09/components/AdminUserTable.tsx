'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './Toaster';
import { confirm as confirmDialog } from './ConfirmDialog';
import { Select } from './Select';

type UserRow = {
  id: number; email: string; name: string | null; tier: string;
  subscription_status: string | null; subscription_renews_at: string | null;
  created_at: string; custom_domain: string | null;
  total_searches: number; active_searches: number;
  last_action_at: string | null; live_sessions: number;
};

const TIERS = ['free', 'pro', 'enterprise'] as const;

function fmtRel(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

export function AdminUserTable({ users, currentUserId }: { users: UserRow[]; currentUserId: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [, start] = useTransition();

  const filtered = filter
    ? users.filter(u =>
        u.email.toLowerCase().includes(filter.toLowerCase()) ||
        (u.name && u.name.toLowerCase().includes(filter.toLowerCase())) ||
        u.tier.includes(filter.toLowerCase()))
    : users;

  async function setTier(id: number, tier: string) {
    setErr(null);
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const msg = j.error || `HTTP ${r.status}`;
        setErr(msg);
        toast.error('Tier change failed', msg);
        return;
      }
      toast.success('Tier updated', `User #${id} is now ${tier}`);
      start(() => router.refresh());
    } finally { setBusy(null); }
  }

  async function del(id: number, email: string) {
    const ok = await confirmDialog({
      title: `Delete ${email}?`,
      description: 'This cascades to their searches, sessions, fare snapshots, and alerts. Cannot be undone.',
      confirmLabel: 'Delete user',
      destructive: true,
      requireText: 'DELETE',
    });
    if (!ok) return;
    setErr(null);
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const msg = j.error || `HTTP ${r.status}`;
        setErr(msg);
        toast.error('Delete failed', msg);
        return;
      }
      toast.success('User deleted', `${email} and all their data have been removed.`);
      start(() => router.refresh());
    } finally { setBusy(null); }
  }

  return (
    <div className="card overflow-x-auto">
      <div className="card-head flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="!mb-0">All accounts ({users.length})</h2>
          <p className="text-xs text-slate-500 mt-1">Change tier inline. Delete cascades to searches/sessions/snapshots (irreversible).</p>
        </div>
        <input
          type="search"
          placeholder="Filter by email, name, tier…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="text-xs w-64"
        />
      </div>
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}

      <table className="fmt mt-3">
        <thead>
          <tr>
            <th>#</th>
            <th>Email</th>
            <th>Tier</th>
            <th>Sub status</th>
            <th className="text-right">Searches</th>
            <th>Live sessions</th>
            <th>Joined</th>
            <th>Last action</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(u => (
            <tr key={u.id} className={u.id === currentUserId ? 'row-hot' : ''}>
              <td className="text-slate-400 font-mono">{u.id}</td>
              <td>
                <div className="font-semibold">{u.email}</div>
                {u.name && <div className="text-[10px] text-slate-500">{u.name}</div>}
                {u.custom_domain && <div className="text-[10px] text-slate-500">↳ {u.custom_domain}</div>}
              </td>
              <td>
                <Select
                  value={u.tier}
                  onChange={(v) => setTier(u.id, v)}
                  disabled={busy === u.id}
                  ariaLabel={`Tier for ${u.email}`}
                  options={[
                    { value: 'free',       label: 'Free',       description: 'No commit, no charge' },
                    { value: 'pro',        label: 'Pro',        description: '$9 / month' },
                    { value: 'enterprise', label: 'Enterprise', description: '$49 / month' },
                  ]}
                />
              </td>
              <td>
                <span className={`badge ${
                  u.subscription_status === 'active' || u.subscription_status === 'trialing' ? 'badge-success' :
                  u.subscription_status === 'past_due' || u.subscription_status === 'unpaid' ? 'badge-warn' :
                  u.subscription_status === 'canceled' ? 'badge-muted' : 'badge-muted'
                }`}>{u.subscription_status ?? '—'}</span>
                {u.subscription_renews_at && (
                  <div className="text-[10px] text-slate-500 mt-0.5">renews {u.subscription_renews_at.slice(0, 10)}</div>
                )}
              </td>
              <td className="text-right tabular">
                {u.active_searches}/{u.total_searches}
              </td>
              <td className="tabular">{u.live_sessions}</td>
              <td className="text-xs text-slate-500 whitespace-nowrap">{fmtRel(u.created_at)}</td>
              <td className="text-xs text-slate-500 whitespace-nowrap">{fmtRel(u.last_action_at)}</td>
              <td>
                <button
                  onClick={() => del(u.id, u.email)}
                  disabled={busy === u.id || u.id === currentUserId}
                  className="btn btn-sm btn-danger"
                  title={u.id === currentUserId ? 'Cannot delete yourself' : 'Delete user + all data'}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filtered.length === 0 && (
        <div className="text-sm text-slate-500 py-6 text-center">No users match that filter.</div>
      )}
    </div>
  );
}

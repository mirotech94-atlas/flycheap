'use client';

import { useState } from 'react';

export function DangerZone({ email }: { email: string }) {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function deleteAccount() {
    if (confirm.trim().toLowerCase() !== email.trim().toLowerCase()) {
      setErr(`Type your email exactly to confirm: ${email}`);
      return;
    }
    if (!window.confirm('Last warning — this permanently deletes your account, all your routes, fare history, and alerts. Continue?')) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/me', { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (j.ok) {
        window.location.href = '/welcome?deleted=1';
      } else {
        setErr(j.error || 'Could not delete account.');
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="card border-red-200 bg-red-50/40 dark:bg-red-900/10 dark:border-red-800/40">
      <div className="eyebrow text-red-700 dark:text-red-400">Danger zone</div>
      <h2 className="!mb-2 text-red-900 dark:text-red-300">Delete account</h2>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
        This permanently deletes your account, all tracked routes, fare history, and alert log.
        Cannot be undone. To confirm, type your email below.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder={email}
          className="flex-1 font-mono text-sm"
        />
        <button
          onClick={deleteAccount}
          disabled={busy || confirm.trim().toLowerCase() !== email.trim().toLowerCase()}
          className="btn btn-danger"
        >
          {busy ? 'Deleting…' : 'Delete forever'}
        </button>
      </div>
      {err && <div className="mt-2 text-xs text-red-700 bg-red-100 border border-red-200 rounded px-2 py-1.5">{err}</div>}
    </div>
  );
}

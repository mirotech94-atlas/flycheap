'use client';

import { useState } from 'react';
import { PUBLIC_MARKETING_HOST } from '@/lib/hosts';

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
        window.location.href = `https://${PUBLIC_MARKETING_HOST}/`;
      } else {
        setErr(j.error || 'Could not delete account.');
      }
    } finally { setBusy(false); }
  }

  return (
    <section className="ed-panel" style={{ borderColor: 'var(--red)' }}>
      <div className="ed-eyebrow" style={{ color: 'var(--red)' }}>Danger zone</div>
      <h2 className="ed-h2" style={{ marginBottom: 8, color: 'var(--red)' }}>Delete account</h2>
      <p className="ed-panel-note" style={{ marginBottom: 14 }}>
        This permanently deletes your account, all tracked routes, fare history, and alert log.
        Cannot be undone. To confirm, type your email below.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder={email}
          className="ed-input flex-1"
          style={{ fontFamily: 'var(--font-mono-ed)', fontSize: 13 }}
        />
        <button
          onClick={deleteAccount}
          disabled={busy || confirm.trim().toLowerCase() !== email.trim().toLowerCase()}
          className="ed-btn ed-btn-danger"
        >
          {busy ? 'Deleting…' : 'Delete forever'}
        </button>
      </div>
      {err && <div className="mt-2 text-xs" style={{ color: 'var(--red)', border: '1px solid var(--red)', padding: '6px 8px' }}>{err}</div>}
    </section>
  );
}

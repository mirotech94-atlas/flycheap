'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export function LoginForm() {
  const params = useSearchParams();
  const initialError = params?.get('error');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(
    initialError === 'invalid' ? 'That sign-in link expired or was already used. Get a new one below.' :
    initialError === 'missing' ? 'Sign-in link missing token.' : null
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name:  name.trim()  || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        setErr(j.error || 'Could not send the link.');
      } else {
        setSent(true);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center py-3 motion-fade-in">
        <div className="text-4xl mb-2">📬</div>
        <div className="font-semibold text-slate-900 dark:text-white">Check your inbox</div>
        <p className="text-sm text-slate-500 mt-1">
          We sent a one-click sign-in link to <strong>{email}</strong>. The link is valid for 15 minutes.
        </p>
        <button onClick={() => { setSent(false); setEmail(''); }} className="text-xs text-brand-700 mt-4 underline">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Email</label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full mt-1"
        />
      </div>
      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
      <button type="submit" className="btn btn-primary w-full justify-center" disabled={busy || email.trim().length < 3}>
        {busy ? 'Sending magic link…' : 'Send magic link →'}
      </button>
    </form>
  );
}

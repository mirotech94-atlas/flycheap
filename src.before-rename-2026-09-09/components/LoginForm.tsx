'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Tab = 'login' | 'signup';
type Stage = 'enter' | 'code';

const LS_USER = 'fc_last_username';
const LS_EMAIL = 'fc_last_email';

export function LoginForm() {
  const params = useSearchParams();
  const next = params?.get('next') || '/';
  const initialError = params?.get('error');

  const [tab, setTab] = useState<Tab>('login');
  const [stage, setStage] = useState<Stage>('enter');

  const [identifier, setIdentifier] = useState(''); // login: username OR email
  const [email, setEmail] = useState('');           // signup
  const [username, setUsername] = useState('');      // signup
  const [code, setCode] = useState('');
  const [masked, setMasked] = useState('');
  const [remembered, setRemembered] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(
    initialError === 'invalid' ? 'That sign-in link expired or was already used. Sign in with a code below.'
      : initialError === 'missing' ? 'Sign-in link was missing its token. Use a code instead.'
        : null,
  );

  // Remember the returning user → prefill username, default to Log in.
  useEffect(() => {
    try {
      const u = localStorage.getItem(LS_USER) || localStorage.getItem(LS_EMAIL);
      if (u) { setIdentifier(u); setRemembered(u); setTab('login'); }
    } catch { /* ignore */ }
  }, []);

  // Trusted-device auto-login: if this browser has a valid device token cookie
  // (set after a prior successful OTP), skip the 6-digit code and log in directly.
  useEffect(() => {
    try {
      const hasRemembered = !!(localStorage.getItem(LS_USER) || localStorage.getItem(LS_EMAIL));
      if (!hasRemembered) return; // New browser — no trusted device, go through OTP
    } catch { return; }

    fetch('/api/auth/device-login', { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.ok) window.location.href = next; })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchTab(t: Tab) {
    setTab(t); setStage('enter'); setErr(null); setCode('');
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const payload = tab === 'signup'
        ? { mode: 'signup', identifier: email.trim().toLowerCase(), username: username.trim() }
        : { mode: 'login', identifier: identifier.trim() };
      const r = await fetch('/api/auth/otp/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.error || 'Could not send the code.'); return; }
      setMasked(j.masked || '');
      setStage('code');
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const payload = tab === 'signup'
        ? { mode: 'signup', identifier: email.trim().toLowerCase(), username: username.trim(), code: code.trim() }
        : { mode: 'login', identifier: identifier.trim(), code: code.trim() };
      const r = await fetch('/api/auth/otp/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.error || 'Could not verify the code.'); return; }
      try {
        if (j.username) localStorage.setItem(LS_USER, j.username);
        const em = tab === 'signup'
          ? email.trim().toLowerCase()
          : (identifier.includes('@') ? identifier.trim().toLowerCase() : '');
        if (em) localStorage.setItem(LS_EMAIL, em);
        if (j.isNew) localStorage.setItem('fc_show_tour', '1'); // first-run product tour
      } catch { /* ignore */ }
      window.location.href = next;
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  const input = 'w-full mt-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-5">
        <button type="button" onClick={() => switchTab('login')}
          className={`py-2 rounded-lg text-sm font-semibold transition ${tab === 'login' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
          Log in
        </button>
        <button type="button" onClick={() => switchTab('signup')}
          className={`py-2 rounded-lg text-sm font-semibold transition ${tab === 'signup' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
          Sign up
        </button>
      </div>

      {stage === 'enter' && tab === 'login' && (
        <form onSubmit={sendCode} className="space-y-3 motion-fade-in">
          {remembered && (
            <div className="text-xs text-slate-500">
              Welcome back, <strong className="text-slate-700 dark:text-slate-200">{remembered}</strong>.{' '}
              <button type="button" className="text-brand-700 underline" onClick={() => { setRemembered(null); setIdentifier(''); }}>Not you?</button>
            </div>
          )}
          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Username or email</label>
            <input className={input} value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="mirotech94 or you@email.com" autoFocus required />
          </div>
          <button type="submit" disabled={busy || identifier.trim().length < 3} className="btn btn-primary w-full justify-center">
            {busy ? 'Sending…' : 'Send sign-in code →'}
          </button>
          <p className="text-[11px] text-slate-400 text-center">We email you a 6-digit code — no password to remember.</p>
        </form>
      )}

      {stage === 'enter' && tab === 'signup' && (
        <form onSubmit={sendCode} className="space-y-3 motion-fade-in">
          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Email</label>
            <input className={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" autoFocus required />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Choose a username</label>
            <input className={input} value={username} onChange={e => setUsername(e.target.value)} placeholder="mirotech94" required />
            <span className="text-[11px] text-slate-400">3–30 chars · letters, numbers, . _ - · you&apos;ll log in with this next time</span>
          </div>
          <button type="submit" disabled={busy || !email.includes('@') || username.trim().length < 3} className="btn btn-primary w-full justify-center">
            {busy ? 'Sending…' : 'Create account →'}
          </button>
        </form>
      )}

      {stage === 'code' && (
        <form onSubmit={verify} className="space-y-3 motion-fade-in">
          <div className="text-center">
            <div className="text-3xl mb-1">📬</div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              We sent a 6-digit code{masked ? <> to <strong>{masked}</strong></> : ''}. Enter it below.
            </p>
          </div>
          <input
            className={`${input} text-center text-2xl tracking-[0.5em] font-mono`}
            inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000" autoFocus required
          />
          <button type="submit" disabled={busy || code.length !== 6} className="btn btn-primary w-full justify-center">
            {busy ? 'Verifying…' : 'Verify & continue →'}
          </button>
          <div className="flex items-center justify-between text-[11px]">
            <button type="button" className="text-slate-400 underline" onClick={() => { setStage('enter'); setCode(''); setErr(null); }}>← Back</button>
            <button type="button" className="text-brand-700 underline" onClick={(e) => sendCode(e as unknown as React.FormEvent)}>Resend code</button>
          </div>
        </form>
      )}

      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3" role="alert">{err}</div>}
    </div>
  );
}

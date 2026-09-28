'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { safeNextPath } from '@/lib/safeNext';
import { en, type LoginFormDict } from '@/lib/i18n/app.en';

type Tab = 'login' | 'signup';
type Stage = 'enter' | 'code';

const LS_USER = 'fc_last_username';
const LS_EMAIL = 'fc_last_email';

export function LoginForm({ t = en.login.form, adminOnly = false }: { t?: LoginFormDict; adminOnly?: boolean }) {
  const params = useSearchParams();
  // Assigned to window.location.href below, so an unchecked value is both an
  // open redirect and (with `javascript:`) script execution on our origin.
  const next = safeNextPath(params?.get('next')) || '/';
  const initialError = params?.get('error');

  const [tab, setTab] = useState<Tab>('login');
  const [stage, setStage] = useState<Stage>('enter');

  const [identifier, setIdentifier] = useState(''); // login: username OR email
  const [email, setEmail] = useState('');           // signup
  const [username, setUsername] = useState('');      // signup
  const [fullName, setFullName] = useState('');      // signup — required
  const [phone, setPhone] = useState('');            // signup — OPTIONAL
  const [code, setCode] = useState('');
  const [masked, setMasked] = useState('');
  const [remembered, setRemembered] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(
    initialError === 'invalid' ? t.errExpired
      : initialError === 'missing' ? t.errMissing
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

  function switchTab(tb: Tab) {
    setTab(tb); setStage('enter'); setErr(null); setCode('');
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const payload = tab === 'signup'
        ? { mode: 'signup', identifier: email.trim().toLowerCase(), username: username.trim(), name: fullName.trim(), phone: phone.trim() }
        : { mode: 'login', identifier: identifier.trim() };
      const r = await fetch('/api/auth/otp/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.error || t.errSend); return; }
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
        ? { mode: 'signup', identifier: email.trim().toLowerCase(), username: username.trim(), name: fullName.trim(), phone: phone.trim(), code: code.trim() }
        : { mode: 'login', identifier: identifier.trim(), code: code.trim() };
      const r = await fetch('/api/auth/otp/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.error || t.errVerify); return; }
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

  return (
    <div style={{ marginTop: 14 }}>
      {!adminOnly && (
        <div className="ed-seg" style={{ width: '100%', marginBottom: 18 }}>
          <button type="button" onClick={() => switchTab('login')}
            className={`ed-seg-btn${tab === 'login' ? ' active' : ''}`} style={{ flex: 1, textAlign: 'center' }}>
            {t.tabLogin}
          </button>
          <button type="button" onClick={() => switchTab('signup')}
            className={`ed-seg-btn${tab === 'signup' ? ' active' : ''}`} style={{ flex: 1, textAlign: 'center' }}>
            {t.tabSignup}
          </button>
        </div>
      )}

      {stage === 'enter' && tab === 'login' && (
        <form onSubmit={sendCode} className="motion-fade-in" style={{ display: 'grid', gap: 12 }}>
          {remembered && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {t.rememberedA}<strong style={{ color: 'var(--ink-soft)' }}>{remembered}</strong>{t.rememberedB}{' '}
              <button type="button" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', font: 'inherit' }} onClick={() => { setRemembered(null); setIdentifier(''); }}>{t.notYou}</button>
            </div>
          )}
          <label className="ed-field-block" style={{ margin: 0 }}>
            <span className="ed-label">{t.labelIdentifier}</span>
            <input className="ed-input" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={t.phIdentifier} autoFocus required />
          </label>
          <button type="submit" disabled={busy || identifier.trim().length < 3} className="ed-btn ed-btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? t.sending : t.sendCode}
          </button>
          <p className="ed-field-hint" style={{ textAlign: 'center', margin: 0 }}>{t.noPassword}</p>
        </form>
      )}

      {stage === 'enter' && tab === 'signup' && (
        <form onSubmit={sendCode} className="motion-fade-in" style={{ display: 'grid', gap: 12 }}>
          <label className="ed-field-block" style={{ margin: 0 }}>
            <span className="ed-label">{t.labelEmail}</span>
            <input className="ed-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" autoFocus required />
          </label>
          <label className="ed-field-block" style={{ margin: 0 }}>
            <span className="ed-label">{t.labelUsername}</span>
            <input className="ed-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="mirotech94" required />
            <span className="ed-field-hint">{t.usernameHint}</span>
          </label>
          <label className="ed-field-block" style={{ margin: 0 }}>
            <span className="ed-label">Full name</span>
            <input className="ed-input" value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Jane Traveller" autoComplete="name" required />
          </label>
          <label className="ed-field-block" style={{ margin: 0 }}>
            <span className="ed-label">
              Phone <span style={{ textTransform: 'none', letterSpacing: 'normal', color: 'var(--muted-2)', fontWeight: 400 }}>· optional</span>
            </span>
            <input className="ed-input" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+1 555 123 4567" type="tel" autoComplete="tel" />
            <span className="ed-field-hint">Only used for fare alerts by SMS or WhatsApp. Leave blank to skip.</span>
          </label>
          <button type="submit" disabled={busy || !email.includes('@') || username.trim().length < 3 || fullName.trim().length < 2} className="ed-btn ed-btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? t.sending : t.createAccount}
          </button>
        </form>
      )}

      {stage === 'code' && (
        <form onSubmit={verify} className="motion-fade-in" style={{ display: 'grid', gap: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 4 }}>📬</div>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: 0 }}>
              {t.sentA}{masked ? <>{t.sentTo}<strong style={{ color: 'var(--ink-soft)' }}>{masked}</strong></> : ''}{t.sentB}
            </p>
          </div>
          <input
            className="ed-input"
            style={{ textAlign: 'center', fontSize: 22, letterSpacing: '0.5em', fontFamily: 'var(--font-mono-ed)', paddingLeft: 4, paddingRight: 4 }}
            inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000" autoFocus required
          />
          <button type="submit" disabled={busy || code.length !== 6} className="ed-btn ed-btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? t.verifying : t.verify}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5 }}>
            <button type="button" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--muted-2)', textDecoration: 'underline', font: 'inherit' }} onClick={() => { setStage('enter'); setCode(''); setErr(null); }}>{t.back}</button>
            <button type="button" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', font: 'inherit' }} onClick={(e) => sendCode(e as unknown as React.FormEvent)}>{t.resend}</button>
          </div>
        </form>
      )}

      {err && <div className="ed-chat-error" style={{ marginTop: 12, maxWidth: 'none' }} role="alert">{err}</div>}
    </div>
  );
}

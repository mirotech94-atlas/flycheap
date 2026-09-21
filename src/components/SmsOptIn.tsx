'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  phone: string;
  optIn: boolean;
  verified: boolean;
};

const E164 = /^\+[1-9]\d{7,14}$/;

export function SmsOptIn({ phone, optIn, verified }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<'idle' | 'code-sent'>('idle');
  const [phoneInput, setPhoneInput] = useState(phone || '+1');
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const isActive = verified && optIn;

  async function sendCode() {
    setErr(null); setMsg(null);
    if (!E164.test(phoneInput)) {
      setErr('Enter a valid phone in E.164 format (e.g. +15551234567).');
      return;
    }
    if (!consent) {
      setErr('You must agree to the SMS terms to continue.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/settings/sms/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j.ok) { setErr(j.error || 'Failed to send code.'); return; }
      setStage('code-sent');
      setMsg('Verification code sent. Check your phone.');
    } finally { setBusy(false); }
  }

  async function verify() {
    setErr(null); setMsg(null);
    if (!/^\d{6}$/.test(code)) { setErr('Enter the 6-digit code.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/settings/sms/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j.ok) { setErr(j.error || 'Invalid or expired code.'); return; }
      setMsg('Phone verified. SMS alerts enabled.');
      router.refresh();
    } finally { setBusy(false); }
  }

  async function optOut() {
    setErr(null); setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/settings/sms/opt-out', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!j.ok) { setErr(j.error || 'Failed to disable.'); return; }
      setMsg('SMS alerts disabled.');
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <section className="ed-panel">
      <div className="ed-eyebrow" style={{ marginBottom: 4 }}>Notifications</div>
      <h2 className="ed-h2" style={{ marginBottom: 6 }}>SMS fare alerts</h2>
      <p className="ed-panel-note" style={{ marginBottom: 18 }}>
        Get price-drop notifications by text. US/Canada toll-free number from FlyCheap.
      </p>

      {isActive ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>
              <span className="ed-dot" aria-hidden />✓ Active
            </span>
            <span className="ed-mono" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>{phone}</span>
          </div>
          <p className="ed-panel-note" style={{ margin: 0 }}>
            You can also reply STOP from your phone to cancel anytime.
          </p>
          <button onClick={optOut} disabled={busy} className="ed-btn ed-btn-secondary">
            {busy ? 'Disabling…' : 'Disable SMS alerts'}
          </button>
        </div>
      ) : stage === 'idle' ? (
        <div className="space-y-3">
          <label className="block">
            <span className="ed-label">
              Mobile number (E.164)
            </span>
            <input
              type="tel"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value.trim())}
              placeholder="+15551234567"
              className="ed-input"
              style={{ fontFamily: 'var(--font-mono-ed)' }}
              autoComplete="tel"
            />
          </label>
          <label className="flex items-start gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I agree to receive transactional SMS from FlyCheap (price-drop alerts, weekly digests, sign-in codes).
              Up to 5 messages per week. Msg &amp; data rates may apply. Reply STOP to cancel, HELP for help.
            </span>
          </label>
          <button onClick={sendCode} disabled={busy} className="ed-btn ed-btn-primary">
            {busy ? 'Sending…' : 'Send verification code'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="ed-panel-note" style={{ margin: 0 }}>
            We sent a 6-digit code to <span className="ed-mono" style={{ textTransform: 'none', letterSpacing: 0 }}>{phoneInput}</span>.
          </p>
          <label className="block">
            <span className="ed-label">
              Verification code
            </span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="ed-input"
              style={{ fontFamily: 'var(--font-mono-ed)', letterSpacing: '0.1em' }}
              autoComplete="one-time-code"
            />
          </label>
          <div className="flex gap-2">
            <button onClick={verify} disabled={busy} className="ed-btn ed-btn-primary">
              {busy ? 'Verifying…' : 'Verify'}
            </button>
            <button onClick={() => { setStage('idle'); setCode(''); }} disabled={busy} className="ed-btn ed-btn-secondary">
              Change number
            </button>
          </div>
        </div>
      )}

      {err && <div className="text-sm mt-3" style={{ color: 'var(--red)' }}>{err}</div>}
      {msg && <div className="text-sm mt-3" style={{ color: 'var(--green)' }}>{msg}</div>}
    </section>
  );
}

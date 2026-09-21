'use client';

import { useEffect, useState } from 'react';

type Result = { position: number; effectivePosition: number; refCode: string; referrals: number; shareUrl: string; total: number; existing: boolean };
export type FormLabels = {
  placeholder: string; airport: string; button: string; busy: string; fine: string; invited: string; err: string; netErr: string;
  doneA: string; doneExisting: string; doneOf: string; share: string; joined: string; copy: string; copied: string;
  shareX: string; shareWa: string; shareMail: string; shareText: string; notYou: string;
  fromAirport: string; toAirport: string; watchReady: string;
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`));

export function EarlyAccessForm({ initialRef = '', labels: t }: { initialRef?: string; labels: FormLabels }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // The watch comes first. The route is the thing they came for; the email is
  // what we need to reach them about it.
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [ref, setRef] = useState(initialRef);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const r = new URL(window.location.href).searchParams.get('ref');
      if (r) { setRef(r); localStorage.setItem('fc_ea_ref', r); }
      else { const s = localStorage.getItem('fc_ea_ref'); if (s) setRef(s); }
      const saved = localStorage.getItem('fc_ea_result');
      if (saved) setRes(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) { setErr('Please accept the Terms & Conditions to continue.'); return; }
    setErr(null); setBusy(true);
    try {
      const r = await fetch('/api/early-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, phone, ref, origin, destination, acceptedTerms: true, website: '' }) });
      const j = await r.json();
      if (!j.ok) { setErr(j.error || t.err); return; }
      setRes(j);
      try { localStorage.setItem('fc_ea_result', JSON.stringify(j)); } catch { /* ignore */ }
    } catch { setErr(t.netErr); } finally { setBusy(false); }
  }
  async function copy() { if (!res) return; try { await navigator.clipboard.writeText(res.shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } }

  if (res) {
    const text = encodeURIComponent(`${t.shareText} ${res.shareUrl}`);
    return (
      <div className="mk-done" role="status">
        <div className="mk-done-k">{res.existing ? t.doneExisting : t.doneA}</div>
        <div className="mk-done-v">#{res.effectivePosition}</div>
        <div className="mk-done-s">{fill(t.doneOf, { total: res.total })}</div>
        <div className="mk-done-share">
          <div className="mk-done-share-h">{t.share}{res.referrals > 0 ? ` · ${fill(t.joined, { n: res.referrals })}` : ''}</div>
          <div className="mk-done-row"><input readOnly value={res.shareUrl} onFocus={e => e.currentTarget.select()} /><button type="button" onClick={copy} className="ed-btn ed-btn-primary">{copied ? t.copied : t.copy}</button></div>
          <div className="mk-done-links">
            <a href={`https://twitter.com/intent/tweet?text=${text}`} target="_blank" rel="noopener">{t.shareX}</a>
            <a href={`https://wa.me/?text=${text}`} target="_blank" rel="noopener">{t.shareWa}</a>
            <a href={`mailto:?subject=FlyCheap&body=${text}`}>{t.shareMail}</a>
          </div>
        </div>
        <button type="button" className="mk-link-muted" onClick={() => { try { localStorage.removeItem('fc_ea_result'); } catch { /* ignore */ } setRes(null); setName(''); setEmail(''); setPhone(''); }}>{t.notYou}</button>
      </div>
    );
  }

  return (
    <form className="mk-form" onSubmit={submit}>
      <div className="mk-form-row">
        <input type="text" placeholder={t.fromAirport} value={origin} onChange={e => setOrigin(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} aria-label={t.fromAirport} maxLength={3} autoCapitalize="characters" spellCheck={false} />
        <input type="text" placeholder={t.toAirport} value={destination} onChange={e => setDestination(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} aria-label={t.toAirport} maxLength={3} autoCapitalize="characters" spellCheck={false} />
      </div>
      <div className="mk-form-row">
        <input type="text" required autoComplete="name" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} aria-label="Full name" />
      </div>
      <div className="mk-form-row">
        <input type="email" required autoComplete="email" inputMode="email" placeholder={t.placeholder} value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
      </div>
      <div className="mk-form-row">
        <input type="tel" autoComplete="tel" inputMode="tel" placeholder="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)} aria-label="Phone (optional)" />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: -9999, opacity: 0 }} aria-hidden="true" />
        <button type="submit" className="ed-btn ed-btn-primary" disabled={busy || !email.includes('@') || name.trim().length < 2 || !agreed}>{busy ? t.busy : t.button}</button>
      </div>
      <label className="mk-form-terms" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5, marginTop: 4, cursor: 'pointer' }}>
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} aria-label="Accept terms and conditions" />
        <span>I agree to FlyCheap&rsquo;s <a href="/terms" target="_blank" rel="noopener">Terms &amp; Conditions</a>, <a href="/trial-terms" target="_blank" rel="noopener">Trial Terms</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>. The 3-month trial unlocks every feature, free, with no card.</span>
      </label>
      <div className="mk-form-fine">{t.fine}{origin && destination ? ` ${t.watchReady}` : ''}{ref && <span> · {t.invited}</span>}</div>
      {err && <div className="mk-form-err" role="alert">{err}</div>}
    </form>
  );
}

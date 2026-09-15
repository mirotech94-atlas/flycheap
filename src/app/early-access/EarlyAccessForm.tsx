'use client';

import { useEffect, useState } from 'react';

type Result = { position: number; effectivePosition: number; refCode: string; referrals: number; shareUrl: string; total: number; existing: boolean };
export type FormLabels = {
  placeholder: string; airport: string; button: string; busy: string; fine: string; invited: string; err: string; netErr: string;
  doneA: string; doneExisting: string; doneOf: string; share: string; joined: string; copy: string; copied: string;
  shareX: string; shareWa: string; shareMail: string; shareText: string; notYou: string;
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`));

export function EarlyAccessForm({ initialRef = '', labels: t }: { initialRef?: string; labels: FormLabels }) {
  const [email, setEmail] = useState('');
  const [ref, setRef] = useState(initialRef);
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
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = await fetch('/api/early-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, ref, website: '' }) });
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
      <div className="dc-done" role="status">
        <div className="dc-done-k">{res.existing ? t.doneExisting : t.doneA}</div>
        <div className="dc-done-v">#{res.effectivePosition}</div>
        <div className="dc-done-s">{fill(t.doneOf, { total: res.total })}</div>
        <div className="dc-done-share">
          <div className="h">{t.share}{res.referrals > 0 ? ` · ${fill(t.joined, { n: res.referrals })}` : ''}</div>
          <div className="row"><input readOnly value={res.shareUrl} onFocus={e => e.currentTarget.select()} /><button type="button" onClick={copy} className="dc-btn dc-btn-primary">{copied ? t.copied : t.copy}</button></div>
          <div className="links">
            <a href={`https://twitter.com/intent/tweet?text=${text}`} target="_blank" rel="noopener">{t.shareX}</a>
            <a href={`https://wa.me/?text=${text}`} target="_blank" rel="noopener">{t.shareWa}</a>
            <a href={`mailto:?subject=FlyCheap&body=${text}`}>{t.shareMail}</a>
          </div>
        </div>
        <button type="button" className="dc-notyou" onClick={() => { try { localStorage.removeItem('fc_ea_result'); } catch { /* ignore */ } setRes(null); setEmail(''); }}>{t.notYou}</button>
      </div>
    );
  }

  return (
    <form className="dc-form" onSubmit={submit}>
      <div className="dc-form-row">
        <input type="email" required autoComplete="email" inputMode="email" placeholder={t.placeholder} value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: -9999, opacity: 0 }} aria-hidden="true" />
        <button type="submit" className="dc-btn dc-btn-primary" disabled={busy || !email.includes('@')}>{busy ? t.busy : t.button}</button>
      </div>
      <div className="dc-form-fine">{t.fine}{ref && <span className="dc-accent"> · {t.invited}</span>}</div>
      {err && <div className="dc-form-err" role="alert">{err}</div>}
    </form>
  );
}

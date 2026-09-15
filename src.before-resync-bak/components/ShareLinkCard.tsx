'use client';

import { useEffect, useState } from 'react';

export function ShareLinkCard() {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
    fetch('/api/share').then(r => r.json()).then(j => setToken(j.token || null));
  }, []);

  const url = token ? `${origin}/share/${token}` : '';

  async function rotate() {
    setBusy(true);
    const r = await fetch('/api/share', { method: 'POST' });
    const j = await r.json();
    setToken(j.token || null);
    setBusy(false);
  }
  async function revoke() {
    if (!confirm('Revoke the share link? Anyone with the URL will lose access immediately. You can generate a new one any time.')) return;
    setBusy(true);
    await fetch('/api/share', { method: 'DELETE' });
    setToken('');
    setBusy(false);
  }
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow">Family share</div>
          <h2 className="!mb-0">Public read-only link</h2>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Send this link to family members. They get a live, read-only view of the dashboard with the best deals,
        fare heatmap, and tracked-date prices. They cannot change settings or trigger polls.
        Anyone with the URL has access — rotate or revoke if it leaks.
      </p>

      {token ? (
        <div className="space-y-3">
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              readOnly
              value={url}
              onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
              className="flex-1 font-mono text-xs"
            />
            <button onClick={copy} className="btn btn-primary btn-sm whitespace-nowrap" disabled={busy}>
              {copied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
              Open in new tab ↗
            </a>
            <button onClick={rotate} className="btn btn-sm" disabled={busy}>
              Rotate token
            </button>
            <button onClick={revoke} className="btn btn-sm btn-danger" disabled={busy}>
              Revoke
            </button>
          </div>
        </div>
      ) : (
        <button onClick={rotate} className="btn btn-primary" disabled={busy}>
          {busy ? 'Generating…' : 'Generate share link'}
        </button>
      )}
    </div>
  );
}

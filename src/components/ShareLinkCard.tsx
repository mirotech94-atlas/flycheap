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
    <section className="ed-panel">
      <div className="ed-panel-head">
        <div>
          <div className="ed-eyebrow">Family share</div>
          <h2 className="ed-panel-title">Public read-only link</h2>
        </div>
      </div>
      <p className="ed-panel-note" style={{ marginBottom: 16 }}>
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
              className="ed-input flex-1"
              style={{ fontFamily: 'var(--font-mono-ed)', fontSize: 12 }}
            />
            <button onClick={copy} className="ed-btn ed-btn-primary whitespace-nowrap" disabled={busy}>
              {copied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a href={url} target="_blank" rel="noopener noreferrer" className="ed-btn ed-btn-secondary">
              Open in new tab ↗
            </a>
            <button onClick={rotate} className="ed-btn ed-btn-secondary" disabled={busy}>
              Rotate token
            </button>
            <button onClick={revoke} className="ed-btn ed-btn-danger" disabled={busy}>
              Revoke
            </button>
          </div>
        </div>
      ) : (
        <button onClick={rotate} className="ed-btn ed-btn-primary" disabled={busy}>
          {busy ? 'Generating…' : 'Generate share link'}
        </button>
      )}
    </section>
  );
}

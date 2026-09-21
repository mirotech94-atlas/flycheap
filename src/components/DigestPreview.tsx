'use client';

import { useState } from 'react';

export function DigestPreview() {
  const [kind, setKind] = useState<'daily' | 'weekly'>('daily');
  const [show, setShow] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [compacting, setCompacting] = useState(false);
  const [compactStats, setCompactStats] = useState<string | null>(null);

  const src = `/api/digest/preview?kind=${kind}&cb=${show ? Date.now() : ''}`;

  async function sendNow() {
    setSending(true); setMsg(null);
    const path = kind === 'weekly' ? '/api/digest/weekly' : '/api/digest/send';
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const j = await res.json().catch(() => ({}));
    setSending(false);
    setMsg(j.ok ? `Sent to ${j.sentTo} (id ${j.id || '—'})` : `Failed: ${j.error || res.statusText}`);
  }

  async function compactNow() {
    if (!confirm('Compact the database now? This collapses snapshots older than 30 days into one daily-min row each, then VACUUMs. Safe but I/O-heavy.')) return;
    setCompacting(true); setCompactStats(null);
    const res = await fetch('/api/db/compact', { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setCompacting(false);
    setCompactStats(j.ok ? `Compacted: deleted ${j.deleted}, kept ${j.kept}, reclaimed ~${j.vacuumedKb}KB.` : `Failed: ${j.error}`);
  }

  return (
    <div className="ed-panel">
      <div className="ed-panel-head">
        <div>
          <div className="ed-eyebrow">Email digests &amp; database</div>
          <h2 className="ed-panel-title">Digest preview &amp; admin</h2>
        </div>
      </div>
      <p className="ed-panel-note" style={{ marginBottom: 12 }}>
        Preview tomorrow&apos;s scheduled digest before it sends. Daily digest fires 9am ET; weekly anomaly summary
        (biggest fallers/risers vs 7 days ago) fires Sundays 8pm ET.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="ed-seg">
          <button
            onClick={() => setKind('daily')}
            className={`ed-seg-btn ${kind === 'daily' ? 'active' : ''}`}
          >Daily 9am ET</button>
          <button
            onClick={() => setKind('weekly')}
            className={`ed-seg-btn ${kind === 'weekly' ? 'active' : ''}`}
          >Weekly Sunday 8pm</button>
        </div>
        <button onClick={() => setShow(s => !s)} className="ed-btn ed-btn-secondary">
          {show ? 'Hide preview' : 'Show preview'}
        </button>
        <a href={src} target="_blank" rel="noopener noreferrer" className="ed-btn ed-btn-secondary">Open in new tab ↗</a>
        <button onClick={sendNow} className="ed-btn ed-btn-primary" disabled={sending}>
          {sending ? 'Sending…' : `Send ${kind} now`}
        </button>
        {msg && <span className="ed-panel-note" style={{ margin: 0 }}>{msg}</span>}
      </div>

      {show && (
        <div style={{ border: '1px solid var(--rule)', borderRadius: 0 }}>
          <iframe
            src={src}
            className="w-full h-[680px]"
            style={{ border: 0, borderRadius: 0 }}
            title="Digest preview"
          />
          {/* The digest EMAIL is not themed — it stays light paper/dark ink
              regardless of the portal's theme, same as every other template
              in the email design system. This caption is the only editorial
              chrome around it. */}
          <div className="ed-mono" style={{ padding: '8px 12px', borderTop: '1px solid var(--rule)', color: 'var(--muted)' }}>
            Rendered as recipients will see it — the email stays on its own light template regardless of portal theme
          </div>
        </div>
      )}

      <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--rule)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>Database compaction</div>
            <p className="ed-panel-note" style={{ margin: '2px 0 0' }}>
              Auto-runs nightly 3:30am ET. Click to run now — keeps last 30 days of detail, collapses older snapshots to one daily-min row.
            </p>
          </div>
          <button onClick={compactNow} className="ed-btn ed-btn-secondary" disabled={compacting}>
            {compacting ? 'Compacting…' : 'Compact now'}
          </button>
        </div>
        {compactStats && <div className="ed-panel-note" style={{ marginTop: 8 }}>{compactStats}</div>}
      </div>
    </div>
  );
}

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
    <div className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow">Email digests &amp; database</div>
          <h2 className="!mb-0">Digest preview &amp; admin</h2>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Preview tomorrow&apos;s scheduled digest before it sends. Daily digest fires 9am ET; weekly anomaly summary
        (biggest fallers/risers vs 7 days ago) fires Sundays 8pm ET.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setKind('daily')}
            className={`px-3 py-1.5 text-xs font-semibold ${kind === 'daily' ? 'bg-brand text-white' : 'bg-transparent text-slate-600 dark:text-slate-300'}`}
          >Daily 9am ET</button>
          <button
            onClick={() => setKind('weekly')}
            className={`px-3 py-1.5 text-xs font-semibold border-l border-slate-200 dark:border-slate-700 ${kind === 'weekly' ? 'bg-brand text-white' : 'bg-transparent text-slate-600 dark:text-slate-300'}`}
          >Weekly Sunday 8pm</button>
        </div>
        <button onClick={() => setShow(s => !s)} className="btn btn-sm">
          {show ? 'Hide preview' : 'Show preview'}
        </button>
        <a href={src} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Open in new tab ↗</a>
        <button onClick={sendNow} className="btn btn-sm btn-primary" disabled={sending}>
          {sending ? 'Sending…' : `Send ${kind} now`}
        </button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>

      {show && (
        <iframe
          src={src}
          className="w-full h-[680px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white"
          title="Digest preview"
        />
      )}

      <div className="mt-6 pt-4 border-t border-slate-200/60 dark:border-slate-700">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">Database compaction</div>
            <p className="text-xs text-slate-500 mt-0.5">
              Auto-runs nightly 3:30am ET. Click to run now — keeps last 30 days of detail, collapses older snapshots to one daily-min row.
            </p>
          </div>
          <button onClick={compactNow} className="btn btn-sm" disabled={compacting}>
            {compacting ? 'Compacting…' : 'Compact now'}
          </button>
        </div>
        {compactStats && <div className="mt-2 text-xs text-slate-500">{compactStats}</div>}
      </div>
    </div>
  );
}

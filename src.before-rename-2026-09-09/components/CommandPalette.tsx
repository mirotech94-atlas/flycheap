'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Action = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string;
  run: () => void | Promise<void>;
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Toggle on ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else setQ('');
  }, [open]);

  async function api(path: string, method = 'POST') {
    const r = await fetch(path, { method });
    return r.json().catch(() => ({}));
  }

  const actions: Action[] = useMemo(() => [
    { id: 'go-dash',  group: 'Navigate', label: 'Go to Dashboard',           hint: '/',         run: () => router.push('/') },
    { id: 'go-srch',  group: 'Navigate', label: 'Go to Searches',            hint: '/searches', run: () => router.push('/searches') },
    { id: 'go-set',   group: 'Navigate', label: 'Go to Settings',            hint: '/settings', run: () => router.push('/settings') },

    { id: 'refresh-deals', group: 'Actions', label: 'Refresh 12-month best deals', keywords: 'scan rescan',
      run: async () => { setBusy('refresh-deals'); await api('/api/best-deals', 'POST'); router.refresh(); setBusy(null); setOpen(false); } },
    { id: 'poll-all', group: 'Actions', label: 'Poll all tracked searches now',  keywords: 'fetch fares',
      run: async () => { setBusy('poll-all'); await api('/api/poll', 'POST'); router.refresh(); setBusy(null); setOpen(false); } },
    { id: 'send-digest', group: 'Actions', label: 'Send today\'s digest email now', keywords: 'report mail summary',
      run: async () => { setBusy('send-digest'); await api('/api/digest/send', 'POST'); setBusy(null); setOpen(false); } },
    { id: 'test-email', group: 'Actions', label: 'Send test alert email',
      run: async () => { setBusy('test-email'); const j = await api('/api/settings/test-email', 'POST'); alert(j.ok ? 'Test sent ✓' : `Failed: ${j.error}`); setBusy(null); setOpen(false); } },
    { id: 'export-csv', group: 'Actions', label: 'Export deals as CSV',  keywords: 'download spreadsheet excel',
      run: () => { window.location.href = '/api/best-deals/export'; setOpen(false); } },
    { id: 'export-alerts', group: 'Actions', label: 'Export alert history as CSV',
      run: () => { window.location.href = '/api/alerts/export'; setOpen(false); } },
    { id: 'theme', group: 'View', label: 'Toggle dark / light theme', keywords: 'mode color',
      run: () => {
        const dark = document.documentElement.classList.toggle('dark');
        try { localStorage.setItem('egyptair-theme', dark ? 'dark' : 'light'); } catch {}
      } },
    { id: 'print', group: 'View', label: 'Print / save dashboard as PDF',
      run: () => { setOpen(false); setTimeout(() => window.print(), 100); } },
    { id: 'jump-deals', group: 'Filters', label: 'Filter: Sweet-spot (Tue/Sat 1–5 AM) sort',
      run: () => { router.push('/?sort=sweetspot'); setOpen(false); } },
    { id: 'reset-filters', group: 'Filters', label: 'Reset all filters',
      run: () => { router.push('/'); setOpen(false); } },
  ], [router]);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? actions.filter(a =>
        (a.label + ' ' + (a.keywords ?? '') + ' ' + a.group + ' ' + (a.hint ?? ''))
          .toLowerCase()
          .includes(needle))
    : actions;

  // Group results
  const grouped = filtered.reduce<Record<string, Action[]>>((acc, a) => {
    (acc[a.group] ??= []).push(a);
    return acc;
  }, {});

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs text-white/70 hover:text-white hover:bg-white/10 transition no-print"
        title="Command palette (⌘K)"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <span>Search</span>
        <kbd className="px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-mono">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 no-print" role="dialog">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-lift border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent outline-none text-sm placeholder-slate-400 border-0 focus:ring-0 focus:border-0 px-0 py-0 shadow-none"
            style={{ boxShadow: 'none', borderColor: 'transparent' }}
          />
          <kbd className="text-[10px] font-mono text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-auto py-1">
          {Object.entries(grouped).length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400 text-center">No matches.</div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-[0.14em] text-slate-400 font-semibold">{group}</div>
                {items.map(a => (
                  <button
                    key={a.id}
                    onClick={() => a.run()}
                    disabled={busy === a.id}
                    className="w-full flex items-center justify-between gap-4 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-brand/5 dark:hover:bg-brand/10 disabled:opacity-50"
                  >
                    <span className="text-left">
                      {a.label}
                      {busy === a.id && <span className="ml-2 text-xs text-slate-400">running…</span>}
                    </span>
                    {a.hint && <span className="text-[11px] font-mono text-slate-400">{a.hint}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Tip: open anywhere with <kbd className="font-mono">⌘K</kbd></span>
          <span>{filtered.length} action{filtered.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}

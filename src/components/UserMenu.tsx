'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Me = {
  email: string;
  name: string | null;
  tier: string;
  brand_color: string | null;
};

export function UserMenu() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(j => setMe(j?.user ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  if (!me) {
    return (
      <Link href="/login" className="text-sm text-white/80 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/10">
        Log in
      </Link>
    );
  }

  const initial = (me.name?.[0] || me.email[0]).toUpperCase();
  const tierColor = { free: 'badge-muted', pro: 'badge-info', enterprise: 'badge-gold' }[me.tier] || 'badge-muted';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-white/10 transition"
        aria-label="Account menu"
      >
        <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-[var(--on-accent)] grid place-items-center font-bold text-sm">
          {initial}
        </div>
        <span className="text-xs text-white/80 hidden lg:inline">{me.email}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/60"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 shadow-lift border border-slate-200 dark:border-slate-700 overflow-hidden z-50 motion-fade-in">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
            <div className="text-xs text-slate-500">Signed in as</div>
            <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">{me.email}</div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={`badge ${tierColor}`}>{me.tier}</span>
              {me.tier === 'free' && (
                <a href="/api/billing/checkout" className="text-[10px] text-brand-700 underline">Upgrade to Pro →</a>
              )}
            </div>
          </div>
          <Link href="/settings" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60">Settings</Link>
          <Link href="/searches" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60">My searches</Link>
          <button onClick={logout} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-slate-100 dark:border-slate-800">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

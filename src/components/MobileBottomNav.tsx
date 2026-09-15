'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppI18n } from '@/lib/i18n/client';
import type { AppNavDict } from '@/lib/i18n/app.en';

const TABS: Array<{ href: string; match: (p: string) => boolean; key: keyof AppNavDict; icon: React.ReactNode }> = [
  { href: '/', match: (p: string) => p === '/', key: 'home', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12 12 3l9 9"/><path d="M5 10v10h14V10"/></svg>
    ) },
  { href: '/searches', match: (p: string) => p.startsWith('/searches') || p.startsWith('/explore') || p.startsWith('/routes'), key: 'flights', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2 16 11l3.5-3.4a2 2 0 1 0-2.9-2.9L13.2 8 5 6.2a.6.6 0 0 0-.6 1l5 3-2.4 2.4-2.3-.5-1 1 3 1.7 1.7 3 1-1-.5-2.3L13.6 13l3 5a.6.6 0 0 0 1-.6Z"/></svg>
    ) },
  { href: '/hotels', match: (p: string) => p.startsWith('/hotels'), key: 'hotels', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20v-7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v7"/><path d="M2 16h20"/><path d="M6 11V8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3"/><path d="M2 20h20"/></svg>
    ) },
  { href: '/offers', match: (p: string) => p.startsWith('/offers') || p.startsWith('/compare'), key: 'offers', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.8 12V4.8A2 2 0 0 1 4.8 2.8H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
    ) },
  { href: '/settings', match: (p: string) => p.startsWith('/settings') || p.startsWith('/pricing') || p.startsWith('/contact') || p.startsWith('/help') || p.startsWith('/onboarding'), key: 'profile', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/></svg>
    ) },
];

export function MobileBottomNav() {
  const pathname = usePathname() || '/';
  const { nav } = useAppI18n();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 no-print"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`relative flex flex-col items-center justify-center gap-1 pt-2.5 pb-2 text-[11px] font-semibold transition ${
                active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-400'
              }`}
            >
              <span className={active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-400'}>{t.icon}</span>
              {nav[t.key]}
              {active && <span className="absolute top-0 h-0.5 w-10 bg-brand-gold rounded-full" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

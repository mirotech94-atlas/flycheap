'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppI18n } from '@/lib/i18n/client';
import type { AppNavDict } from '@/lib/i18n/app.en';
import { NavIcon } from '@/components/NavIcons';

const TABS: Array<{ href: string; match: (p: string) => boolean; key: keyof AppNavDict }> = [
  { href: '/', match: (p: string) => p === '/', key: 'home' },
  { href: '/searches', match: (p: string) => p.startsWith('/searches') || p.startsWith('/explore') || p.startsWith('/routes'), key: 'flights' },
  { href: '/hotels', match: (p: string) => p.startsWith('/hotels'), key: 'hotels' },
  { href: '/offers', match: (p: string) => p.startsWith('/offers') || p.startsWith('/compare'), key: 'offers' },
  { href: '/settings', match: (p: string) => p.startsWith('/settings') || p.startsWith('/pricing') || p.startsWith('/contact') || p.startsWith('/help') || p.startsWith('/onboarding'), key: 'profile' },
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
              className={`relative flex flex-col items-center justify-center gap-0.5 pt-1.5 pb-1.5 text-[10px] font-semibold transition ${
                active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-400'
              }`}
            >
              <span
                className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
                  active
                    ? 'bg-brand/10 dark:bg-brand-300/15 text-brand-700 dark:text-brand-300'
                    : 'text-slate-400'
                }`}
              >
                <NavIcon name={t.key} size={21} />
              </span>
              {nav[t.key]}
              {active && <span className="absolute top-0 h-0.5 w-10 bg-[var(--nc-teal)] rounded-full" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

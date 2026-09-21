'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppI18n } from '@/lib/i18n/client';
import type { AppNavDict } from '@/lib/i18n/app.en';
import { NavIcon } from '@/components/NavIcons';

const TABS: Array<{ href: string; match: (p: string) => boolean; key: keyof AppNavDict }> = [
  // The thumb tab goes to the board, not the chart wall: "the user's most
  // pressing decision should be the first thing under their thumb". The old
  // dashboard is still lit as home so it never reads as un-navigated.
  { href: '/board', match: (p: string) => p === '/' || p.startsWith('/board'), key: 'home' },
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
      className="ed-bottomnav fixed bottom-0 inset-x-0 z-30 md:hidden no-print"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="ed-bottomnav-grid">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`ed-bottomnav-tab ${active ? 'active' : ''}`}
            >
              <span className="ed-bottomnav-tab-icon">
                <NavIcon name={t.key} size={21} />
              </span>
              {nav[t.key]}
              {active && <span className="ed-bottomnav-tab-bar" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

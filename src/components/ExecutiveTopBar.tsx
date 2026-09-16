'use client';

import { LogoMark } from '@/components/Logo';
import Link from 'next/link';
import { APP_VERSION_SHORT } from '@/lib/version';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HeaderControls } from './HeaderControls';
import { PUBLIC_ADMIN_HOST } from '@/lib/hosts';

// Public-facing nav. Routes that require auth are tagged so we can hide them
// from anonymous visitors — otherwise crawlers (and affiliate-program review
// bots like Skyscanner's) follow the links into /searches or /settings,
// hit the auth wall, and log "broken URL / redirect chain" against the site.
const NAV: Array<{ href: string; label: string; authOnly?: boolean }> = [
  { href: '/',             label: 'Dashboard' },
  { href: '/explore',      label: 'Explore'   },
  { href: '/offers',       label: 'Offers'    },
  { href: '/hotels',       label: 'Hotels'    },
  { href: '/routes',       label: 'Routes'    },
  { href: '/guides',       label: 'Guides'    },
  { href: '/pricing',      label: 'Pricing'   },
  { href: '/searches',     label: 'Searches',     authOnly: true },
  { href: '/integrations', label: 'Integrations', authOnly: true },
  { href: '/settings',     label: 'Settings',     authOnly: true },
];

export function ExecutiveTopBar({
  user,
  isAdmin = false,
}: {
  user: { email: string; name: string | null } | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname() || '/';
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const initials = (() => {
    const src = (user?.name || user?.email || '').trim();
    if (!src) return 'OM';
    const parts = src.split(/\s+|@/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  })();
  const displayName = user?.name || user?.email?.split('@')[0] || 'Log in';

  return (
    <header className="topbar">
      <Link href="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="brand-mark">
          <LogoMark size={22} />
        </div>
        <div>
          <div className="brand-name">FlyCheap</div>
          <div className="brand-meta">Fare Intelligence · {APP_VERSION_SHORT}</div>
        </div>
      </Link>
      <nav>
        {NAV.filter(l => !l.authOnly || !!user).map(l => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className={active ? 'active' : ''}>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="topbar-right">
        <div className="market-clock" suppressHydrationWarning>
          <span className="dot" />
          POLLING · {now ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'} UTC
        </div>
        <HeaderControls />
        {isAdmin && (
          <a
            href={`https://${PUBLIC_ADMIN_HOST}/`}
            className="user-chip"
            style={{ textDecoration: 'none', color: 'inherit', borderColor: '#d4af37', background: 'rgba(212,175,55,0.08)' }}
            title="Open the admin portal"
          >
            <div className="avatar" style={{ background: '#d4af37', color: '#0a3a6b' }}>A</div>
            Admin
          </a>
        )}
        {user ? (
          <Link href="/settings" className="user-chip" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="avatar">{initials}</div>
            {displayName}
          </Link>
        ) : (
          <Link href="/login" className="user-chip" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="avatar">→</div>
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}

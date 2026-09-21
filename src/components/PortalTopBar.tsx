'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAppI18n } from '@/lib/i18n/client';
import type { AppNavDict } from '@/lib/i18n/app.en';
import { Logo } from '@/components/Logo';
import { LanguageMenu } from '@/components/LanguageMenu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PUBLIC_ADMIN_HOST, PUBLIC_MARKETING_HOST } from '@/lib/hosts';

// Mirrors ClientSidebar.tsx's buildNav()/isItemActive() exactly — this is the
// same 13-destination signed-in inventory (plus the 3 group separators),
// reshaped from a collapsible left rail into a single scannable tab row. The
// literal labels ("Your board", "Support") are the same deliberate choices
// ClientSidebar documents: a new i18n key would have to land in every
// dictionary at once, so these stay hardcoded like their sidebar originals.
type Entry =
  | { kind: 'tab'; href: string; label: string }
  | { kind: 'group'; label: string };

function buildEntries(nav: AppNavDict): Entry[] {
  return [
    { kind: 'tab', href: '/board', label: 'Your board' },
    { kind: 'tab', href: '/', label: nav.dashboard },
    { kind: 'group', label: nav.groupFlights },
    { kind: 'tab', href: '/explore', label: nav.explore },
    { kind: 'tab', href: '/hotels', label: nav.hotels },
    { kind: 'tab', href: '/airbnbs', label: nav.rentals },
    { kind: 'tab', href: '/offers', label: nav.offers },
    { kind: 'group', label: nav.groupServices },
    { kind: 'tab', href: '/integrations', label: nav.integrations },
    { kind: 'tab', href: '/pricing', label: nav.pricing },
    { kind: 'group', label: nav.groupHelp },
    { kind: 'tab', href: '/guides', label: nav.guides },
    { kind: 'tab', href: '/routes', label: nav.routes },
    { kind: 'tab', href: '/searches', label: nav.searches },
    { kind: 'tab', href: '/support', label: 'Support' },
    { kind: 'tab', href: '/settings', label: nav.settings },
  ];
}

// Same semantics as ClientSidebar.tsx's isItemActive(): '/' only matches
// exactly, everything else matches on prefix so a sub-route (e.g. /settings/
// billing) still lights up its parent tab.
function isItemActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function PortalTopBar({
  user,
  isAdmin = false,
  language = 'Language',
}: {
  user: { email: string; name: string | null; tier?: string | null } | null;
  isAdmin?: boolean;
  /** Localized label for the language switcher (a11y title). */
  language?: string;
}) {
  const pathname = usePathname() || '/';
  const { locale, nav } = useAppI18n();
  const entries = useMemo(() => buildEntries(nav), [nav]);
  const [open, setOpen] = useState(false);

  return (
    <header className="pt-bar">
      <Link href="/" className="pt-brand" onClick={() => setOpen(false)}>
        <Logo size={24} />
        <span>
          <span className="pt-brand-name">FlyCheap</span>
          <span className="pt-brand-meta">{nav.tagline}</span>
        </span>
      </Link>

      <button
        type="button"
        className="pt-menu ed-btn ed-btn-secondary"
        aria-label={nav.toggle}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        ☰
      </button>

      {user ? (
        <nav className={`pt-tabs${open ? ' open' : ''}`}>
          {entries.map(e =>
            e.kind === 'group' ? (
              <span key={`group-${e.label}`} className="pt-group">{e.label}</span>
            ) : (
              <Link
                key={e.href}
                href={e.href}
                className={`pt-tab${isItemActive(pathname, e.href) ? ' active' : ''}`}
                onClick={() => setOpen(false)}
              >
                {e.label}
              </Link>
            )
          )}
        </nav>
      ) : (
        // Guest shell — mirrors ClientSidebar's guest nav (marketing mini-shell
        // instead of the operational tabs): the "what is this" blurb, the four
        // marketing links, and the primary sign-in CTA.
        <div className={`pt-tabs${open ? ' open' : ''}`}>
          <p className="pt-guest">
            {nav.guestA}<strong>{nav.guestStrong}</strong>{nav.guestB}
          </p>
          {/* Absolute, not '/': on the client host '/' is the DASHBOARD, so a
              relative link here would send "What is FlyCheap?" to the app. */}
          <a href={`https://${PUBLIC_MARKETING_HOST}/`} className="pt-tab">{nav.whatIs}</a>
          <Link href="/explore" className="pt-tab" onClick={() => setOpen(false)}>{nav.exploreDeals}</Link>
          <Link href="/guides" className="pt-tab" onClick={() => setOpen(false)}>{nav.guides}</Link>
          <Link href="/pricing" className="pt-tab" onClick={() => setOpen(false)}>{nav.pricing}</Link>
          <Link href="/login" className="ed-btn ed-btn-primary" onClick={() => setOpen(false)}>{nav.signInArrow}</Link>
        </div>
      )}

      <div className="pt-right">
        {user && <span className="pt-tier ed-mono">{user.tier || 'free'}</span>}
        <ThemeToggle />
        <LanguageMenu locale={locale} variant="sidebar" label={language} />
        {user && isAdmin && (
          <a href={`https://${PUBLIC_ADMIN_HOST}/`} className="ed-btn ed-btn-secondary ed-mono">{nav.adminPortal}</a>
        )}
        {user && (
          <button
            type="button"
            className="ed-btn ed-btn-secondary ed-mono"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.href = '/login';
            }}
          >
            {nav.signOut}
          </button>
        )}
        {!user && (
          <Link href="/login" className="ed-btn ed-btn-secondary ed-mono">{nav.signIn}</Link>
        )}
      </div>
    </header>
  );
}

'use client';

import Link from 'next/link';
import { APP_VERSION_SHORT } from '@/lib/version';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Logo } from '@/components/Logo';
import { LanguageMenu } from '@/components/LanguageMenu';
import { useAppI18n } from '@/lib/i18n/client';
import type { AppNavDict } from '@/lib/i18n/app.en';

type Item = { href: string; label: string; icon: string };
type Group = { id: string; label: string; icon: string; items: Item[] };

function buildNav(nav: AppNavDict): { top: Item; groups: Group[]; guest: Item[] } {
  return {
    top: { href: '/', label: nav.dashboard, icon: '◇' },
    groups: [
      {
        id: 'flights',
        label: nav.groupFlights,
        icon: '✈',
        items: [
          { href: '/explore', label: nav.explore, icon: '◷' },
          { href: '/hotels',  label: nav.hotels,  icon: '◈' },
          { href: '/offers',  label: nav.offers,  icon: '※' },
        ],
      },
      {
        id: 'services',
        label: nav.groupServices,
        icon: '⚙',
        items: [
          { href: '/integrations', label: nav.integrations, icon: '⇄' },
          { href: '/pricing',      label: nav.pricing,      icon: '◯' },
        ],
      },
      {
        id: 'help',
        label: nav.groupHelp,
        icon: '?',
        items: [
          { href: '/guides',   label: nav.guides,   icon: '☐' },
          { href: '/routes',   label: nav.routes,   icon: '↝' },
          { href: '/searches', label: nav.searches, icon: '⌕' },
          { href: '/settings', label: nav.settings, icon: '◉' },
        ],
      },
    ],
    guest: [
      { href: '/welcome', label: nav.whatIs,       icon: '✈' },
      { href: '/explore', label: nav.exploreDeals, icon: '◷' },
      { href: '/guides',  label: nav.guides,       icon: '☐' },
      { href: '/pricing', label: nav.pricing,      icon: '◯' },
    ],
  };
}

function isItemActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

function isGroupActive(pathname: string, g: Group): boolean {
  return g.items.some(i => isItemActive(pathname, i.href));
}

export function ClientSidebar({
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
  const { top: TOP, groups: GROUPS, guest: GUEST } = useMemo(() => buildNav(nav), [nav]);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Groups are expanded by default so every destination — Searches, Settings,
  // Integrations, etc. — is always one click away (previously they were hidden
  // inside collapsed groups, so on the dashboard you couldn't reach Settings or
  // Searches without first expanding "Help"). Users can still collapse manually.
  const initialOpen = useMemo(() => {
    const o: Record<string, boolean> = {};
    for (const g of GROUPS) o[g.id] = true;
    return o;
  }, [GROUPS]);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(initialOpen);

  // Re-sync when navigation happens so the relevant group pops open.
  useEffect(() => {
    setGroupOpen(prev => {
      const next = { ...prev };
      for (const g of GROUPS) if (isGroupActive(pathname, g)) next[g.id] = true;
      return next;
    });
    setMobileOpen(false);
  }, [pathname, GROUPS]);

  const initials = (() => {
    const src = (user?.name || user?.email || '').trim();
    if (!src) return '·';
    const parts = src.split(/\s+|@/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  })();
  const displayName = user?.name || user?.email?.split('@')[0] || null;

  return (
    <>
      {/* Mobile burger */}
      <button
        aria-label={nav.toggle}
        onClick={() => setMobileOpen(v => !v)}
        className="client-burger md:hidden fixed top-3 left-3 z-50 w-9 h-9 rounded-md bg-[var(--nc-deck)] border border-[var(--nc-rule-2)] text-white flex items-center justify-center no-print"
      >
        <span className="block w-4 h-[2px] bg-white relative before:content-[''] before:absolute before:left-0 before:-top-1.5 before:w-4 before:h-[2px] before:bg-white after:content-[''] after:absolute after:left-0 after:top-1.5 after:w-4 after:h-[2px] after:bg-white" />
      </button>

      <aside
        className={`
          client-sidebar no-print
          fixed top-0 left-0 z-40 h-screen w-[220px]
          flex flex-col
          border-r border-[var(--nc-rule)]
          bg-[var(--nc-dark)]
          transition-transform duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}
      >
        {/* Brand */}
        <div className="px-5 pt-5 pb-4 border-b border-white/5">
          <Link href="/" className="flex items-center gap-2 group" onClick={() => setMobileOpen(false)}>
            <div className="relative">
              <div className="absolute inset-0 rounded-md bg-[var(--nc-amber)] blur-md opacity-30 group-hover:opacity-50 transition" />
              <Logo size={32} className="relative" />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-white text-[13px]">FlyCheap</div>
              <div className="text-[10px] tracking-[0.18em] uppercase text-[var(--nc-amber)]">{nav.tagline}</div>
            </div>
          </Link>
        </div>

        {/* User card */}
        {user ? (
          <div className="px-5 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[var(--nc-amber)] text-[#241703] text-[11px] font-bold flex items-center justify-center">{initials}</div>
              <div className="min-w-0 leading-tight">
                <div className="text-[11px] text-white/85 truncate" title={user.email}>{displayName}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/45">{user.tier || 'free'}</div>
              </div>
            </div>
            {isAdmin && (
              <a
                href="https://admin.flycheap.18dn.com/"
                className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--nc-amber)]/15 text-[var(--nc-amber)] border border-[var(--nc-amber)]/30 hover:bg-[var(--nc-amber)]/25 transition"
              >
                {nav.adminPortal}
              </a>
            )}
          </div>
        ) : (
          <div className="px-5 py-3 border-b border-white/5">
            <Link href="/login" className="text-[11px] text-white/85 hover:text-white transition flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-white/8 text-white text-[12px] flex items-center justify-center">→</span>
              {nav.signIn}
            </Link>
          </div>
        )}

        {/* Nav — guests get a marketing mini-shell, not the operational tabs */}
        {!user ? (
          <nav className="flex-1 overflow-y-auto py-4 px-4 text-sm">
            <p className="text-white/70 text-xs leading-relaxed">
              {nav.guestA}<strong className="text-white">{nav.guestStrong}</strong>{nav.guestB}
            </p>
            <div className="mt-4 space-y-0.5">
              {GUEST.map(i => (
                <NavItem
                  key={i.href}
                  item={i}
                  active={isItemActive(pathname, i.href)}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </div>
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="mt-5 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold bg-[var(--nc-amber)] text-[#241703] hover:bg-[#f0cc50] transition"
            >
              {nav.signInArrow}
            </Link>
          </nav>
        ) : (
        <nav className="flex-1 overflow-y-auto py-3 px-2 text-sm">
          {/* Dashboard (top, always visible, no group) */}
          <NavItem
            item={TOP}
            active={isItemActive(pathname, TOP.href)}
            onClick={() => setMobileOpen(false)}
          />

          {GROUPS.map(g => {
            const groupActive = isGroupActive(pathname, g);
            const open = !!groupOpen[g.id];
            return (
              <div key={g.id} className="mt-2">
                <button
                  type="button"
                  onClick={() => setGroupOpen(p => ({ ...p, [g.id]: !p[g.id] }))}
                  className={`
                    w-full flex items-center justify-between px-3 py-2 rounded-md
                    transition
                    ${groupActive ? 'text-white' : 'text-white/65 hover:text-white hover:bg-white/5'}
                  `}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-[var(--nc-amber)]/80 w-4 text-center text-xs">{g.icon}</span>
                    <span className="uppercase text-[11px] tracking-[0.14em] font-semibold">{g.label}</span>
                  </span>
                  <span className={`text-white/40 text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
                </button>

                {open && (
                  <div className="client-nav-sub mt-1 ml-3 pl-3 border-l border-white/8 space-y-0.5">
                    {g.items.map(i => (
                      <NavItem
                        key={i.href}
                        item={i}
                        active={isItemActive(pathname, i.href)}
                        onClick={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {user && (
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login';
              }}
              className="mt-3 w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/65 hover:text-white hover:bg-white/5 transition"
            >
              <span className="text-[var(--nc-amber)]/80 w-4 text-center text-xs">⤴</span>
              <span>{nav.signOut}</span>
            </button>
          )}
        </nav>
        )}

        <div className="px-5 py-3 border-t border-white/5 text-[10px] text-white/40 tracking-wide uppercase flex items-center justify-between gap-2">
          <span>FlyCheap · {APP_VERSION_SHORT}</span>
          <LanguageMenu locale={locale} variant="sidebar" label={language} />
        </div>
      </aside>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-30"
        />
      )}
    </>
  );
}

function NavItem({ item, active, onClick }: { item: Item; active: boolean; onClick: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`
        relative flex items-center gap-3 px-3 py-2 rounded-md text-sm
        transition
        ${active ? 'bg-white/8 text-white font-semibold' : 'text-white/65 hover:text-white hover:bg-white/5'}
      `}
    >
      {active && (
        <span className="client-nav-bar absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[var(--nc-amber)]" />
      )}
      <span className="text-[var(--nc-amber)]/80 w-4 text-center text-xs">{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}

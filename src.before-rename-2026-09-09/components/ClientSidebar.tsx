'use client';

import Link from 'next/link';
import { APP_VERSION_SHORT } from '@/lib/version';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Logo } from '@/components/Logo';

type Item = { href: string; label: string; icon: string };
type Group = { id: string; label: string; icon: string; items: Item[] };

const TOP: Item = { href: '/', label: 'Dashboard', icon: '◇' };

const GROUPS: Group[] = [
  {
    id: 'flights',
    label: 'Flights',
    icon: '✈',
    items: [
      { href: '/explore', label: 'Explore', icon: '◷' },
      { href: '/hotels',  label: 'Hotels',  icon: '◈' },
      { href: '/offers',  label: 'Offers',  icon: '※' },
    ],
  },
  {
    id: 'services',
    label: 'Services',
    icon: '⚙',
    items: [
      { href: '/integrations', label: 'Integrations', icon: '⇄' },
      { href: '/pricing',      label: 'Pricing',      icon: '◯' },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    icon: '?',
    items: [
      { href: '/guides',   label: 'Guides',   icon: '☐' },
      { href: '/routes',   label: 'Routes',   icon: '↝' },
      { href: '/searches', label: 'Searches', icon: '⌕' },
      { href: '/settings', label: 'Settings', icon: '◉' },
    ],
  },
];

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
}: {
  user: { email: string; name: string | null; tier?: string | null } | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname() || '/';
  const [mobileOpen, setMobileOpen] = useState(false);

  // Groups are expanded by default so every destination — Searches, Settings,
  // Integrations, etc. — is always one click away (previously they were hidden
  // inside collapsed groups, so on the dashboard you couldn't reach Settings or
  // Searches without first expanding "Help"). Users can still collapse manually.
  const initialOpen = useMemo(() => {
    const o: Record<string, boolean> = {};
    for (const g of GROUPS) o[g.id] = true;
    return o;
  }, []);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(initialOpen);

  // Re-sync when navigation happens so the relevant group pops open.
  useEffect(() => {
    setGroupOpen(prev => {
      const next = { ...prev };
      for (const g of GROUPS) if (isGroupActive(pathname, g)) next[g.id] = true;
      return next;
    });
    setMobileOpen(false);
  }, [pathname]);

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
        aria-label="Toggle navigation"
        onClick={() => setMobileOpen(v => !v)}
        className="md:hidden fixed top-3 left-3 z-50 w-9 h-9 rounded-md bg-[#0f1f3a] border border-white/10 text-white flex items-center justify-center no-print"
      >
        <span className="block w-4 h-[2px] bg-white relative before:content-[''] before:absolute before:left-0 before:-top-1.5 before:w-4 before:h-[2px] before:bg-white after:content-[''] after:absolute after:left-0 after:top-1.5 after:w-4 after:h-[2px] after:bg-white" />
      </button>

      <aside
        className={`
          client-sidebar no-print
          fixed top-0 left-0 z-40 h-screen w-[220px]
          flex flex-col
          border-r border-white/5
          bg-gradient-to-b from-[#0a3a6b] via-[#061a35] to-[#04101f]
          transition-transform duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}
      >
        {/* Brand */}
        <div className="px-5 pt-5 pb-4 border-b border-white/5">
          <Link href="/" className="flex items-center gap-2 group" onClick={() => setMobileOpen(false)}>
            <div className="relative">
              <div className="absolute inset-0 rounded-md bg-[#d4af37] blur-md opacity-30 group-hover:opacity-50 transition" />
              <Logo size={32} className="relative" />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-white text-[13px]">FlyCheap</div>
              <div className="text-[10px] tracking-[0.18em] uppercase text-[#d4af37]">Tracker</div>
            </div>
          </Link>
        </div>

        {/* User card */}
        {user ? (
          <div className="px-5 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#d4af37] text-[#0a3a6b] text-[11px] font-bold flex items-center justify-center">{initials}</div>
              <div className="min-w-0 leading-tight">
                <div className="text-[11px] text-white/85 truncate" title={user.email}>{displayName}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/45">{user.tier || 'free'}</div>
              </div>
            </div>
            {isAdmin && (
              <a
                href="https://admin.flycheap.18dn.com/"
                className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#d4af37]/15 text-[#f0d674] border border-[#d4af37]/30 hover:bg-[#d4af37]/25 transition"
              >
                Admin portal →
              </a>
            )}
          </div>
        ) : (
          <div className="px-5 py-3 border-b border-white/5">
            <Link href="/login" className="text-[11px] text-white/85 hover:text-white transition flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-white/8 text-white text-[12px] flex items-center justify-center">→</span>
              Sign in
            </Link>
          </div>
        )}

        {/* Nav — guests get a marketing mini-shell, not the operational tabs */}
        {!user ? (
          <nav className="flex-1 overflow-y-auto py-4 px-4 text-sm">
            <p className="text-white/70 text-xs leading-relaxed">
              FlyCheap watches <strong className="text-white">1,000+ airlines</strong> around
              the clock and alerts you the moment a fare drops below your threshold.
            </p>
            <div className="mt-4 space-y-0.5">
              {[
                { href: '/welcome', label: 'What is FlyCheap?', icon: '✈' },
                { href: '/explore', label: 'Explore deals', icon: '◷' },
                { href: '/guides',  label: 'Guides',        icon: '☐' },
                { href: '/pricing', label: 'Pricing',       icon: '◯' },
              ].map(i => (
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
              className="mt-5 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold bg-[#d4af37] text-[#0a3a6b] hover:bg-[#f0cc50] transition"
            >
              Sign in →
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
                    <span className="text-[#d4af37]/80 w-4 text-center text-xs">{g.icon}</span>
                    <span className="uppercase text-[11px] tracking-[0.14em] font-semibold">{g.label}</span>
                  </span>
                  <span className={`text-white/40 text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
                </button>

                {open && (
                  <div className="mt-1 ml-3 pl-3 border-l border-white/8 space-y-0.5">
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
              <span className="text-[#d4af37]/80 w-4 text-center text-xs">⤴</span>
              <span>Sign out</span>
            </button>
          )}
        </nav>
        )}

        <div className="px-5 py-3 border-t border-white/5 text-[10px] text-white/40 tracking-wide uppercase">
          FlyCheap · {APP_VERSION_SHORT}
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
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[#d4af37]" />
      )}
      <span className="text-[#d4af37]/80 w-4 text-center text-xs">{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}

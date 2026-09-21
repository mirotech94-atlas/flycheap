'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAppI18n } from '@/lib/i18n/client';
import type { AppNavDict } from '@/lib/i18n/app.en';

/**
 * The signed-in portal's left rail — the same shape as the admin console's
 * `.ad-rail`, because the owner asked for one navigation idea across both
 * portals rather than tabs here and a rail there.
 *
 * The inventory is unchanged from the tab row it replaces: the same thirteen
 * destinations, the same labels, the same three group headings. What the rail
 * adds is that those three groups collapse — they were dropdowns in the old
 * bar, so they stay openable here rather than becoming a flat list. The two
 * entry points (board, dashboard) and Settings sit outside any group, exactly
 * as they did in the bar, so no new group name had to be invented for them
 * (a new name would need a key in all eight dictionaries at once).
 */

type Item = { href: string; label: string; icon: IconKey };
type Section = { group: string | null; items: Item[] };

function buildSections(nav: AppNavDict): Section[] {
  return [
    { group: null, items: [
      { href: '/board', label: 'Your board', icon: 'board' },
      { href: '/', label: nav.dashboard, icon: 'dashboard' },
    ] },
    { group: nav.groupFlights, items: [
      { href: '/explore', label: nav.explore, icon: 'explore' },
      { href: '/hotels', label: nav.hotels, icon: 'hotels' },
      { href: '/airbnbs', label: nav.rentals, icon: 'rentals' },
      { href: '/offers', label: nav.offers, icon: 'offers' },
    ] },
    { group: nav.groupServices, items: [
      { href: '/integrations', label: nav.integrations, icon: 'integrations' },
      { href: '/pricing', label: nav.pricing, icon: 'pricing' },
    ] },
    { group: nav.groupHelp, items: [
      { href: '/guides', label: nav.guides, icon: 'guides' },
      { href: '/routes', label: nav.routes, icon: 'routes' },
      { href: '/searches', label: nav.searches, icon: 'searches' },
      { href: '/support', label: 'Support', icon: 'support' },
    ] },
    { group: null, items: [
      { href: '/settings', label: nav.settings, icon: 'settings' },
    ] },
  ];
}

/** '/' matches exactly; everything else also matches its sub-routes. */
function isItemActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

type IconKey =
  | 'board' | 'dashboard' | 'explore' | 'hotels' | 'rentals' | 'offers'
  | 'integrations' | 'pricing' | 'guides' | 'routes' | 'searches' | 'support'
  | 'settings';

function Icon({ kind }: { kind: IconKey }) {
  const p = {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.7,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'board':        return <svg {...p}><rect x="3" y="4" width="7" height="16" /><rect x="14" y="4" width="7" height="9" /></svg>;
    case 'dashboard':    return <svg {...p}><rect x="3" y="3" width="7.5" height="7.5" /><rect x="13.5" y="3" width="7.5" height="7.5" /><rect x="3" y="13.5" width="7.5" height="7.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" /></svg>;
    case 'explore':      return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></svg>;
    case 'hotels':       return <svg {...p}><path d="M3 20V7l9-4 9 4v13" /><path d="M3 20h18" /><path d="M9 20v-5h6v5" /></svg>;
    case 'rentals':      return <svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>;
    case 'offers':       return <svg {...p}><path d="M20.5 12.5l-8 8-9-9V4h7.5l9.5 8.5z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg>;
    case 'integrations': return <svg {...p}><path d="M14 7l3-3a3 3 0 014 4l-3 3M10 17l-3 3a3 3 0 01-4-4l3-3" /><path d="M9 15l6-6" /></svg>;
    case 'pricing':      return <svg {...p}><path d="M12 2v20" /><path d="M17 6.5a3.5 3.5 0 00-3.5-3H10a3 3 0 000 6h4a3 3 0 010 6H9.7a3.5 3.5 0 01-3.4-3" /></svg>;
    case 'guides':       return <svg {...p}><path d="M4 4h7a3 3 0 013 3v13a2.5 2.5 0 00-2.5-2.5H4V4z" /><path d="M20 4h-4a3 3 0 00-3 3v13a2.5 2.5 0 012.5-2.5H20V4z" /></svg>;
    case 'routes':       return <svg {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 17C13 16 16 13 17 8.5" /></svg>;
    case 'searches':     return <svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>;
    case 'support':      return <svg {...p}><path d="M21 12a9 9 0 10-3.2 6.9L21 21l-1-4.2A8.9 8.9 0 0021 12z" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-.8.6-1.5 1-1.5 2" /><path d="M12 17h.01" /></svg>;
    case 'settings':     return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.13-1.3l2-1.5-2-3.4-2.3 1a7 7 0 00-2.2-1.3l-.35-2.5h-3.9l-.35 2.5a7 7 0 00-2.2 1.3l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .44.05.87.13 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 002.2 1.3l.35 2.5h3.9l.35-2.5a7 7 0 002.2-1.3l2.3 1 2-3.4-2-1.5c.08-.43.13-.86.13-1.3z" /></svg>;
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      className={`pt-rail-chev${open ? ' open' : ''}`} aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

const STORE_KEY = 'fc_rail_closed';

export function PortalSidebar({ open = false, onNavigate }: { open?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname() || '/';
  const { nav } = useAppI18n();
  const sections = useMemo(() => buildSections(nav), [nav]);

  // Which named groups the reader has collapsed. Open is the default, so an
  // empty set is the first-visit state and nothing is ever hidden by surprise.
  // Per-viewer convenience only: a failed read must not break the nav.
  const [closed, setClosed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setClosed(JSON.parse(raw) as string[]);
    } catch { /* private mode, blocked storage — stay open */ }
  }, []);

  const toggle = (group: string) => {
    setClosed(prev => {
      const next = prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group];
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <aside className={`pt-rail${open ? ' open' : ''}`} aria-label={nav.toggle}>
      <nav>
        {sections.map((section, si) => {
          // A group holding the current page always renders open, however it
          // was last left — the reader should never lose sight of where they are.
          const holdsActive = section.items.some(i => isItemActive(pathname, i.href));
          const collapsed = !!section.group && closed.includes(section.group) && !holdsActive;

          return (
            <div key={section.group ?? `plain-${si}`} className="pt-rail-section">
              {section.group && (
                <button
                  type="button"
                  className="pt-rail-group"
                  aria-expanded={!collapsed}
                  onClick={() => toggle(section.group as string)}
                >
                  <span>{section.group}</span>
                  <Chevron open={!collapsed} />
                </button>
              )}

              {!collapsed && section.items.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`pt-rail-item${isItemActive(pathname, item.href) ? ' active' : ''}`}
                  onClick={onNavigate}
                >
                  <span className="pt-rail-item-inner">
                    <Icon kind={item.icon} />
                    <span>{item.label}</span>
                  </span>
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

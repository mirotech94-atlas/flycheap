'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string; icon: IconKey; hint?: string };
type NavGroup = { group: string; items: NavItem[] };

/** Grouped by business function so the portal reads like an operating company. */
const NAV: NavGroup[] = [
  { group: 'Overview', items: [
    { href: '/admin', label: 'Command centre', icon: 'overview', hint: 'Daily founder briefing' },
  ] },
  // The question the portal has to answer is whether the engine is honest.
  // Economics, Funnel, Revenue and Click stream went with the commercial layer
  // — poll cost against commission earned, and alert-to-click-to-booking
  // attribution, are questions a business asks. There is no business.
  { group: 'Analytics', items: [
    { href: '/admin/trust',     label: 'Fare truth', icon: 'trust',   hint: 'Alert-to-click delta, dead fares, verdict accuracy' },
    { href: '/admin/model',     label: 'Fare model', icon: 'model',   hint: 'The neural network\'s verdict on every tracked route' },
  ] },
  { group: 'Accounts', items: [
    { href: '/admin/signups', label: 'Sign-ups',  icon: 'signups' },
    { href: '/admin/users',   label: 'Accounts',  icon: 'users' },
  ] },
  { group: 'Operations', items: [
    { href: '/admin/health',       label: 'Fare engine',  icon: 'health' },
    { href: '/admin/tickets',      label: 'Support tickets', icon: 'tickets', hint: 'Customer messages awaiting a reply' },
    { href: '/admin/queue',        label: 'Content queue', icon: 'queue', hint: 'AI-drafted posts awaiting your approval' },
    { href: '/admin/errors',       label: 'Errors',       icon: 'errors' },
    { href: '/admin/integrations', label: 'Integrations', icon: 'integrations' },
  ] },
  { group: 'Platform', items: [
    { href: '/admin/settings', label: 'Settings', icon: 'settings' },
  ] },
];

type IconKey =
  | 'overview' | 'revenue' | 'affiliate' | 'signups' | 'users' | 'clicks' | 'integrations'
  | 'queue' | 'health' | 'errors' | 'settings' | 'logout' | 'back' | 'tickets'
  | 'trust' | 'economics' | 'funnel' | 'model';

function Icon({ kind }: { kind: IconKey }) {
  const p = {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.7,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'overview':     return <svg {...p}><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>;
    // A shield: the fare-truth page is the one that says whether we can be trusted.
    case 'trust':        return <svg {...p}><path d="M12 3l7 3v5.5c0 4.3-2.9 8-7 9.5-4.1-1.5-7-5.2-7-9.5V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>;
    // A scale: cost on one side, revenue on the other.
    case 'economics':    return <svg {...p}><path d="M12 4v16" /><path d="M5 8h14" /><path d="M5 8l-2.5 5a3 3 0 005 0L5 8z" /><path d="M19 8l-2.5 5a3 3 0 005 0L19 8z" /></svg>;
    // A narrowing funnel.
    case 'funnel':       return <svg {...p}><path d="M3 4h18l-7 8v7l-4 2v-9L3 4z" /></svg>;
    // Three nodes feeding one: the shape of a small network.
    case 'model':        return <svg {...p}><circle cx="5" cy="6" r="2" /><circle cx="5" cy="12" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="12" r="2.5" /><path d="M7 6l10 5M7 12h9.5M7 18l10-5" /></svg>;
    case 'affiliate':    return <svg {...p}><path d="M12 3v18" /><path d="M16.5 7.5a3.5 3.5 0 00-3.5-3H10a3 3 0 000 6h4a3 3 0 010 6h-3.2a3.5 3.5 0 01-3.4-3" /></svg>;
    case 'errors':       return <svg {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>;
    case 'revenue':      return <svg {...p}><path d="M4 19V5M4 19h16" /><path d="M8 16v-4M12 16V8M16 16v-6M20 16v-9" /></svg>;
    case 'signups':      return <svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M18 8v6M15 11h6" /></svg>;
    case 'users':        return <svg {...p}><circle cx="8.5" cy="8" r="3" /><circle cx="17" cy="9.5" r="2.4" /><path d="M3 19c0-3 2.4-5 5.5-5s5.5 2 5.5 5M14.5 19c0-2 1.4-3.6 3.5-3.6s3.5 1.6 3.5 3.6" /></svg>;
    case 'clicks':       return <svg {...p}><path d="M5 3l4 16 2.5-6.5L18 10 5 3z" /></svg>;
    case 'integrations': return <svg {...p}><path d="M14 7l3-3a3 3 0 014 4l-3 3M10 17l-3 3a3 3 0 01-4-4l3-3" /><path d="M9 15l6-6" /></svg>;
    case 'queue':        return <svg {...p}><path d="M12 3l8 4-8 4-8-4 8-4z" /><path d="M4 12l8 4 8-4M4 17l8 4 8-4" /></svg>;
    case 'tickets':      return <svg {...p}><path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4V8z" /><path d="M13 6v2M13 11v2M13 16v2" /></svg>;
    case 'health':       return <svg {...p}><path d="M3 12h4l2-5 3 10 2-7 2 2h5" /></svg>;
    case 'settings':     return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.13-1.3l2-1.5-2-3.4-2.3 1a7 7 0 00-2.2-1.3l-.35-2.5h-3.9l-.35 2.5a7 7 0 00-2.2 1.3l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .44.05.87.13 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 002.2 1.3l.35 2.5h3.9l.35-2.5a7 7 0 002.2-1.3l2.3 1 2-3.4-2-1.5c.08-.43.13-.86.13-1.3z" /></svg>;
    case 'logout':       return <svg {...p}><path d="M15 17l5-5-5-5M20 12H9M11 21H6a2 2 0 01-2-2V5a2 2 0 012-2h5" /></svg>;
    case 'back':         return <svg {...p}><path d="M15 18l-6-6 6-6" /></svg>;
  }
}

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : !!pathname?.startsWith(href);

  return (
    <aside className="ad-rail">
      <div className="ad-rail-operator ed-mono" title={email}>{email}</div>

      <nav>
        {NAV.map(section => (
          <div key={section.group}>
            <div className="ad-rail-group">{section.group}</div>
            {section.items.map(item => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.hint}
                  className={`ad-rail-item${active ? ' active' : ''}`}
                >
                  <span className="ad-rail-item-inner">
                    <Icon kind={item.icon} />
                    <span>{item.label}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        ))}

        <hr className="ed-rule" style={{ margin: '10px 24px' }} />

        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="ad-rail-item ad-rail-logout">
            <span className="ad-rail-item-inner">
              <Icon kind="logout" />
              <span>Logout</span>
            </span>
          </button>
        </form>
      </nav>

      <Link href="/" className="ad-rail-foot">
        <Icon kind="back" />
        Back to client app
      </Link>
    </aside>
  );
}

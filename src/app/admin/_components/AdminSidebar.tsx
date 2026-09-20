'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/Logo';

type NavItem = { href: string; label: string; icon: IconKey; hint?: string };
type NavGroup = { group: string; items: NavItem[] };

/** Grouped by business function so the portal reads like an operating company. */
const NAV: NavGroup[] = [
  { group: 'Overview', items: [
    { href: '/admin', label: 'Command centre', icon: 'overview', hint: 'Daily founder briefing' },
  ] },
  { group: 'Commercial', items: [
    { href: '/admin/revenue', label: 'Revenue',      icon: 'revenue', hint: 'Earnings, balance and forecast' },
    { href: '/admin/clicks',  label: 'Click stream',  icon: 'clicks',  hint: 'Traffic sources and attribution' },
  ] },
  { group: 'Customers', items: [
    { href: '/admin/signups', label: 'Acquisition', icon: 'signups' },
    { href: '/admin/users',   label: 'Accounts',    icon: 'users' },
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
  | 'queue' | 'health' | 'errors' | 'settings' | 'logout' | 'back' | 'tickets';

function Icon({ kind }: { kind: IconKey }) {
  const p = {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.7,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'overview':     return <svg {...p}><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>;
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
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : !!pathname?.startsWith(href);

  return (
    <>
      <button
        aria-label="Toggle admin nav"
        onClick={() => setOpen(v => !v)}
        className="md:hidden fixed top-3 left-3 z-50 w-9 h-9 rounded-md bg-[#1B2740] border border-white/10 text-white flex items-center justify-center"
      >
        <span className="block w-4 h-[2px] bg-white relative before:content-[''] before:absolute before:left-0 before:-top-1.5 before:w-4 before:h-[2px] before:bg-white after:content-[''] after:absolute after:left-0 after:top-1.5 after:w-4 after:h-[2px] after:bg-white" />
      </button>

      <aside
        className={`
          fixed top-0 left-0 z-40 h-screen w-[220px]
          flex flex-col
          border-r border-white/[0.06]
          bg-gradient-to-b from-[#1B2740] via-[#0B1220] to-[#080D16]
          transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}
        style={{ boxShadow: 'inset -1px 0 0 rgba(232,163,61,0.07)' }}
      >
        {/* Brand */}
        <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <Link href="/admin" className="flex items-center gap-2.5 group">
            <div className="relative">
              <div className="absolute inset-0 rounded-md bg-[#E8A33D] blur-md opacity-30 group-hover:opacity-50 transition" />
              <Logo size={30} className="relative" />
            </div>
            <div className="leading-tight">
              <div
                className="text-white text-[16px]"
                style={{ fontFamily: 'var(--fc-font-display, Fraunces, serif)', letterSpacing: '-0.01em' }}
              >
                FlyCheap
              </div>
              <div className="text-[9px] tracking-[0.24em] uppercase text-[#6FB3C9] font-mono">
                Command Center
              </div>
            </div>
          </Link>
        </div>

        {/* Operator */}
        <div className="px-5 py-3 border-b border-white/[0.06]">
          <div className="text-[11px] text-white/55 truncate" title={email}>{email}</div>
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-[#6FB3C9]/15 text-[#9ACBDB] border border-[#6FB3C9]/30 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7BC49A] shadow-[0_0_6px_#7BC49A]" />
            Admin · Live
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5">
          {NAV.map(section => (
            <div key={section.group} className="mb-3">
              <div className="px-3 pb-1.5 pt-1 text-[9.5px] font-mono uppercase tracking-[0.2em] text-white/28">
                {section.group}
              </div>
              {section.items.map(item => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    title={item.hint}
                    className={`
                      relative flex items-center gap-3 px-3 py-[7px] rounded-lg text-[13px] mb-0.5
                      transition
                      ${active
                        ? 'bg-white/[0.07] text-white font-semibold'
                        : 'text-white/60 hover:text-white hover:bg-white/[0.04]'}
                    `}
                  >
                    {active && (
                      <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#E8A33D] shadow-[0_0_8px_rgba(232,163,61,0.6)]" />
                    )}
                    <span className={active ? 'text-[#6FB3C9]' : 'text-white/45'}>
                      <Icon kind={item.icon} />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}

          <div className="my-2 mx-3 border-t border-white/[0.06]" />

          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] transition"
            >
              <span className="text-white/45"><Icon kind="logout" /></span>
              <span>Logout</span>
            </button>
          </form>
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <Link
            href="/"
            className="flex items-center gap-2 text-[11px] text-white/55 hover:text-white transition"
          >
            <Icon kind="back" />
            Back to client app
          </Link>
        </div>
      </aside>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-30"
        />
      )}
    </>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAppI18n } from '@/lib/i18n/client';
import { Logo } from '@/components/Logo';
import { LanguageMenu } from '@/components/LanguageMenu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PUBLIC_MARKETING_HOST } from '@/lib/hosts';
import { PortalSidebar } from '@/components/PortalSidebar';

// The signed-in inventory moved to the left rail (PortalSidebar), which
// mirrors the admin console's. What is left here is the guest shell: the
// marketing mini-nav a signed-out visitor sees in place of the rail.
// The client portal offers no route into the admin console — not even for the
// owner. The console is reached by going to the admin host directly.
export function PortalTopBar({
  user,
  language = 'Language',
}: {
  user: { email: string; name: string | null; tier?: string | null } | null;
  /** Localized label for the language switcher (a11y title). */
  language?: string;
}) {
  const { locale, nav } = useAppI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
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

      {!user && (
        // Guest shell — a marketing mini-shell (instead of the rail): the
        // "what is this" blurb, the four marketing links, and the sign-in CTA.
        <div className={`pt-tabs pt-guest-nav${open ? ' open' : ''}`}>
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
        {user && (
          <span className="pt-user ed-mono" title={user.email}>{user.name || user.email}</span>
        )}
        {user && <span className="pt-tier ed-mono">{user.tier || 'free'}</span>}
        <ThemeToggle />
        <LanguageMenu locale={locale} variant="editorial" label={language} />
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

      {user && <PortalSidebar open={open} onNavigate={() => setOpen(false)} />}
    </>
  );
}

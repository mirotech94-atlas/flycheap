import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Shared chrome for the six standalone public routes that are not part of
 * the signed-in portal shell (about, demo, terms, trial-terms, checkout,
 * credits) — the "fc-landing" + "fc-l-topbar"/"fc-l-footer" group Task 3.7a
 * moves onto the editorial marketing primitives (.mk-nav / .mk-footer).
 *
 * None of the six original pages carried a language switcher — only
 * /early-access and /login resolve a locale (from cookies/headers) to drive
 * one, and /demo is `force-static`, which a cookie-reading LanguageMenu
 * would break. So this chrome intentionally omits LanguageMenu and adds
 * only ThemeToggle (a pure client component, no server dependency) — every
 * link label and href a page passes through `right`/`footerRight` stays
 * exactly what the page had before.
 */
export function PublicTopbar({ right }: { right: React.ReactNode }) {
  return (
    <header className="mk-nav">
      <div className="mk-wrap">
        <Link href="/" className="mk-brand">
          <Logo size={22} />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="mk-brand-name">FlyCheap</span>
            <span className="mk-brand-meta">Fare Intelligence Platform</span>
          </span>
        </Link>
        <div className="mk-nav-right">
          <ThemeToggle />
          {right}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <footer className="mk-footer">
      <div className="mk-wrap mk-footer-legal">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </footer>
  );
}

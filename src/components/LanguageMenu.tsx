'use client';

import { usePathname } from 'next/navigation';
import { LOCALES, type Locale } from '@/lib/i18n/locales';

/**
 * Flag + code trigger that opens a list of every supported locale. Each item is
 * a plain <a> to /api/lang?set=xx&next=<current path>, which sets the fc_lang
 * cookie server-side and 303s back — so switching works without JS and the
 * whole tree (html lang/dir, dictionaries) re-renders with the new locale.
 *
 * `variant`:
 *  - 'sidebar'   — dark chrome of the app sidebar footer (Tailwind, fc-* palette)
 *  - 'topbar'    — light marketing topbar on /welcome (fc-l-* classes)
 *  - 'editorial' — editorial design system (ed-lang-* classes, tokens only —
 *                  used by PortalTopBar; ClientSidebar stays on 'sidebar'
 *                  until Phase 3 retires it)
 */
export function LanguageMenu({
  locale,
  variant = 'sidebar',
  label = 'Language',
}: {
  locale: Locale;
  variant?: 'sidebar' | 'topbar' | 'editorial';
  label?: string;
}) {
  const pathname = usePathname() || '/';
  const nextPath = encodeURIComponent(pathname);
  const L = LOCALES[locale];
  const codes = Object.keys(LOCALES) as Locale[];

  if (variant === 'editorial') {
    return (
      <details className="ed-lang">
        <summary aria-label={label} title={label}>
          <span aria-hidden>{L.flag}</span> {locale.toUpperCase()} <span aria-hidden>▾</span>
        </summary>
        <div className="ed-lang-menu" role="menu">
          {codes.map(code => (
            <a key={code} role="menuitem" href={`/api/lang?set=${code}&next=${nextPath}`} className={code === locale ? 'on' : ''}>
              <span aria-hidden>{LOCALES[code].flag}</span>{LOCALES[code].label}
            </a>
          ))}
        </div>
      </details>
    );
  }

  if (variant === 'topbar') {
    return (
      <details className="fc-l-lang">
        <summary aria-label={label} title={label}>
          <span aria-hidden>{L.flag}</span> {locale.toUpperCase()} <span className="chev">▾</span>
        </summary>
        <div className="fc-l-lang-menu" role="menu">
          {codes.map(code => (
            <a key={code} role="menuitem" href={`/api/lang?set=${code}&next=${nextPath}`} className={code === locale ? 'on' : ''}>
              <span aria-hidden>{LOCALES[code].flag}</span>{LOCALES[code].label}
            </a>
          ))}
        </div>
      </details>
    );
  }

  return (
    <details className="client-lang relative">
      <summary
        aria-label={label}
        title={label}
        className="list-none cursor-pointer inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-white/10 bg-white/5 text-[11px] font-semibold text-white/70 hover:text-white hover:bg-white/10 transition select-none [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden>{L.flag}</span>
        <span className="tracking-wider">{locale.toUpperCase()}</span>
        <span className="text-[9px] opacity-60">▾</span>
      </summary>
      <div
        role="menu"
        className="absolute bottom-full mb-1 start-0 min-w-[170px] rounded-lg border border-white/10 bg-[#0f1f3a] p-1 shadow-xl shadow-black/40 z-50"
      >
        {codes.map(code => (
          <a
            key={code}
            role="menuitem"
            href={`/api/lang?set=${code}&next=${nextPath}`}
            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[12px] normal-case tracking-normal transition ${
              code === locale ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span aria-hidden>{LOCALES[code].flag}</span>
            <span>{LOCALES[code].label}</span>
          </a>
        ))}
      </div>
    </details>
  );
}

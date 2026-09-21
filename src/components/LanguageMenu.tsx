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
 *  - 'topbar'    — light marketing topbar on /welcome (fc-l-* classes)
 *  - 'editorial' — editorial design system (ed-lang-* classes, tokens only —
 *                  used by PortalTopBar)
 */
export function LanguageMenu({
  locale,
  variant = 'editorial',
  label = 'Language',
}: {
  locale: Locale;
  variant?: 'topbar' | 'editorial';
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

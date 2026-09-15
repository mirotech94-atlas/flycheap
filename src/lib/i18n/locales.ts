/** Supported UI locales. `dir` drives <html dir>; `font` adds a Google font for scripts Manrope lacks. */
export const LOCALES = {
  en: { label: 'English',  flag: '🇺🇸', dir: 'ltr', font: null },
  ar: { label: 'العربية',  flag: '🇸🇦', dir: 'rtl', font: 'Noto+Sans+Arabic:wght@400;600;800' },
  es: { label: 'Español',  flag: '🇪🇸', dir: 'ltr', font: null },
  fr: { label: 'Français', flag: '🇫🇷', dir: 'ltr', font: null },
  de: { label: 'Deutsch',  flag: '🇩🇪', dir: 'ltr', font: null },
  it: { label: 'Italiano', flag: '🇮🇹', dir: 'ltr', font: null },
  zh: { label: '中文',      flag: '🇨🇳', dir: 'ltr', font: 'Noto+Sans+SC:wght@400;600;800' },
  hi: { label: 'हिन्दी',    flag: '🇮🇳', dir: 'ltr', font: 'Noto+Sans+Devanagari:wght@400;600;800' },
} as const;
export type Locale = keyof typeof LOCALES;
export const LOCALE_COOKIE = 'fc_lang';
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && x in LOCALES;
}

/** cookie → ?lang → Accept-Language → en */
export function resolveLocale(opts: { cookie?: string | null; query?: string | null; acceptLanguage?: string | null }): Locale {
  if (isLocale(opts.query)) return opts.query;
  if (isLocale(opts.cookie)) return opts.cookie;
  const al = (opts.acceptLanguage || '').toLowerCase();
  for (const part of al.split(',')) {
    const code = part.trim().split(';')[0].split('-')[0];
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

import { cookies, headers } from 'next/headers';
import { LOCALES, LOCALE_COOKIE, resolveLocale, type Locale } from './locales';

/**
 * Locale for the current request, for server components:
 * `fc_lang` cookie → Accept-Language → 'en'. (The `?lang=` query override is
 * only honoured by pages that read searchParams themselves, e.g. /early-access.)
 */
export async function getRequestLocale(): Promise<Locale> {
  const [ck, hd] = await Promise.all([cookies(), headers()]);
  return resolveLocale({ cookie: ck.get(LOCALE_COOKIE)?.value, acceptLanguage: hd.get('accept-language') });
}

/** Locale + its <html dir> + optional Google font family for scripts Manrope lacks. */
export async function getRequestLocaleInfo(): Promise<{ locale: Locale; dir: 'ltr' | 'rtl'; font: string | null }> {
  const locale = await getRequestLocale();
  const L = LOCALES[locale];
  return { locale, dir: L.dir, font: L.font };
}

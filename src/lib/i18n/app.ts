import { en, type AppDict, type AppNavDict, type LoginFormDict, type Rich } from './app.en';
import { ar } from './app.ar';
import { es } from './app.es';
import { fr } from './app.fr';
import { de } from './app.de';
import { it } from './app.it';
import { zh } from './app.zh';
import { hi } from './app.hi';
import type { Locale } from './locales';

const DICTS: Record<Locale, AppDict> = { en, ar, es, fr, de, it, zh, hi };

/** Core-app dictionary (nav, login, welcome, settings, dashboard) for a locale. */
export function getAppDict(locale: Locale): AppDict {
  return DICTS[locale] ?? en;
}

export { fill } from './early-access';
export type { AppDict, AppNavDict, LoginFormDict, Rich };

import { en, type EarlyAccessDict } from './early-access.en';
import { ar } from './early-access.ar';
import { es } from './early-access.es';
import { fr } from './early-access.fr';
import { de } from './early-access.de';
import { it } from './early-access.it';
import { zh } from './early-access.zh';
import { hi } from './early-access.hi';
import type { Locale } from './locales';

const DICTS: Record<Locale, EarlyAccessDict> = { en, ar, es, fr, de, it, zh, hi };

export function getEarlyAccessDict(locale: Locale): EarlyAccessDict {
  return DICTS[locale] ?? en;
}

/** Tiny interpolation: fill("{n} joined", { n: 3 }) → "3 joined" */
export function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
export type { EarlyAccessDict };

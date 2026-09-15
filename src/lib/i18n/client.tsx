'use client';

import { createContext, useContext } from 'react';
import type { Locale } from './locales';
import { en, type AppNavDict } from './app.en';

/**
 * Minimal client-side locale context. The root layout (a server component)
 * resolves the request locale and passes it + the nav dictionary down here so
 * deep client components (sidebar, bottom nav, language menu) can read them
 * without a second round-trip. Page-level dictionaries are passed as props.
 */
export type AppI18n = { locale: Locale; dir: 'ltr' | 'rtl'; nav: AppNavDict };

const Ctx = createContext<AppI18n>({ locale: 'en', dir: 'ltr', nav: en.nav });

export function AppI18nProvider({ value, children }: { value: AppI18n; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppI18n(): AppI18n {
  return useContext(Ctx);
}

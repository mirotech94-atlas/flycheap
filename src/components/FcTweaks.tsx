'use client';

/**
 * Neutralised. This used to be a root theme enforcer that rewrote
 * [data-fc-theme] on every render, which fought the SSR-correct
 * `data-theme` mechanism now owned by `src/lib/theme.ts` and
 * `<ThemeToggle />` (theme read from the `fc-theme` cookie server-side,
 * applied before paint by the `themeBoot` inline script in layout.tsx).
 *
 * Kept as a no-op — not deleted — so the existing `<FcTweaks />` import in
 * layout.tsx keeps compiling. Task 3.9 removes both the import and this file.
 */
export function FcTweaks() {
  return null;
}

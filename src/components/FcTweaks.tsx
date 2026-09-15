'use client';
import { useEffect } from 'react';

/**
 * Theme enforcer. The product is dark-only (coal canvas + gold accent):
 * this applies the theme to the document root on every route and renders
 * no toggle. Kept as a component so the layout wiring stays unchanged.
 */
export function FcTweaks() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-fc-theme', 'coal');
    root.setAttribute('data-fc-accent', 'gold');
    root.classList.add('dark');
    document.body?.setAttribute('data-fc-theme', 'coal');
    document.body?.setAttribute('data-fc-accent', 'gold');
    document.querySelectorAll<HTMLElement>('[data-fc-theme]').forEach(el => {
      el.setAttribute('data-fc-theme', 'coal');
      el.setAttribute('data-fc-accent', 'gold');
    });
    try { localStorage.setItem('fc-theme', 'coal'); localStorage.setItem('fc-mode', 'dark'); localStorage.setItem('theme', 'dark'); } catch { /* ignore */ }
  }, []);
  return null;
}

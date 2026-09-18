'use client';
import { useEffect } from 'react';

/**
 * Root theme enforcer. The product is dark-only, so this pins the DOCUMENT
 * ROOT (and body) and renders no toggle.
 *
 * Further down the tree it only NORMALISES STALE LIGHT THEMES. It used to
 * rewrite every [data-fc-theme] element to 'coal', which silently undid the
 * night-cabin conversion: /welcome and the dashboard render
 * data-fc-theme="cabin" on the server, and this stomped them back to 'coal'
 * on hydration. Both themes are dark, so it looked plausible while every
 * [data-fc-theme="cabin"] token remap quietly stopped applying — which is why
 * --fc-gold was still resolving to the old Bloomberg #d4af37.
 *
 * A surface that declares a DARK theme owns it. The sweep survives only to
 * catch pages still declaring the pre-cabin light themes (/about, /terms,
 * /checkout, /demo, /trial-terms), which would otherwise render as white
 * pages inside a dark product. Those are the real fix — convert them to
 * 'cabin' and this list shrinks to nothing.
 */
export function FcTweaks() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-fc-theme', 'coal');
    root.setAttribute('data-fc-accent', 'gold');
    root.classList.add('dark');
    document.body?.setAttribute('data-fc-theme', 'coal');
    document.body?.setAttribute('data-fc-accent', 'gold');
    // Light themes only — never touch a surface that already declares a dark one.
    const LIGHT = new Set(['ivory', 'paper']);
    document.querySelectorAll<HTMLElement>('[data-fc-theme]').forEach(el => {
      if (el === root || el === document.body) return;
      if (LIGHT.has(el.getAttribute('data-fc-theme') ?? '')) {
        el.setAttribute('data-fc-theme', 'coal');
        el.setAttribute('data-fc-accent', 'gold');
      }
    });
    try { localStorage.setItem('fc-theme', 'coal'); localStorage.setItem('fc-mode', 'dark'); localStorage.setItem('theme', 'dark'); } catch { /* ignore */ }
  }, []);
  return null;
}

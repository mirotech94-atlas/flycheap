'use client';
import { useEffect } from 'react';

/**
 * Root theme enforcer. The product is dark-only, so this pins the DOCUMENT
 * ROOT (and body) and renders no toggle.
 *
 * It does NOT touch elements below the root. It used to rewrite every
 * [data-fc-theme] element to 'coal', which silently undid the night-cabin
 * conversion: /welcome and the dashboard render data-fc-theme="cabin" on the
 * server, and this stomped them back to 'coal' on hydration. Both themes are
 * dark, so it looked plausible while every [data-fc-theme="cabin"] token remap
 * quietly stopped applying — which is why --fc-gold was still resolving to the
 * old Bloomberg #d4af37 instead of the cabin amber #e8a33d.
 *
 * The sweep survived one round longer because five pages still declared the
 * pre-cabin 'ivory' theme and would have rendered as white pages inside a dark
 * product. Those are now on 'cabin', so the sweep is gone for good.
 *
 * A surface that declares its own theme owns it. Don't reintroduce the sweep —
 * if a page looks wrong, fix the theme that page declares.
 */
export function FcTweaks() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-fc-theme', 'coal');
    root.setAttribute('data-fc-accent', 'gold');
    root.classList.add('dark');
    document.body?.setAttribute('data-fc-theme', 'coal');
    document.body?.setAttribute('data-fc-accent', 'gold');
    try { localStorage.setItem('fc-theme', 'coal'); localStorage.setItem('fc-mode', 'dark'); localStorage.setItem('theme', 'dark'); } catch { /* ignore */ }
  }, []);
  return null;
}

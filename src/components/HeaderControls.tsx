'use client';
import { useEffect } from 'react';

/** Dark-only product: the light/dark switch is retired. Enforces dark and renders nothing. */
export function HeaderControls() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    try { localStorage.setItem('theme', 'dark'); } catch { /* ignore */ }
  }, []);
  return null;
}

'use client';
import { useEffect, useState } from 'react';
import { THEME_COOKIE, type Theme } from '@/lib/theme';

function apply(t: Theme) {
  const root = document.documentElement;
  root.dataset.theme = t;
  // Tailwind utilities on legacy screens key off .dark; keep it in lockstep
  // until the last dark:-prefixed utility is gone.
  root.classList.toggle('dark', t === 'dark');
  document.cookie = `${THEME_COOKIE}=${t}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try { localStorage.setItem(THEME_COOKIE, t); } catch { /* private mode */ }
}

/** The LIGHT / DARK button in both top bars. Label shows the theme you will switch TO. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => { setTheme((document.documentElement.dataset.theme as Theme) || 'dark'); }, []);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className={`ed-btn ed-btn-secondary ed-mono ${className}`} onClick={() => { apply(next); setTheme(next); }} aria-label={`Switch to ${next} theme`}>
      {next.toUpperCase()}
    </button>
  );
}

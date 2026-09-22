'use client';
import { useEffect, useState } from 'react';
import { applyTheme, type Theme } from '@/lib/theme';

/** The LIGHT / DARK button in both top bars. Label shows the theme you will switch TO. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => { setTheme((document.documentElement.dataset.theme as Theme) || 'dark'); }, []);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className={`ed-btn ed-btn-secondary ed-mono fc-theme-toggle ${className}`} onClick={() => { applyTheme(next); setTheme(next); }} aria-label={`Switch to ${next} theme`}>
      {next.toUpperCase()}
    </button>
  );
}

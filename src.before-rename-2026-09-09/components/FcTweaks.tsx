'use client';
import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark';

const LS_THEME = 'fc-theme';
const LS_ACCENT = 'fc-accent';

/**
 * Light/Dark toggle (top-right). The brand is locked to coal + gold:
 * light mode renders the ivory canvas, dark mode renders coal — the gold
 * accent is fixed in both. Persisted to localStorage and applied to the
 * document root (`<html data-fc-theme=…>`) so every page re-themes.
 */
export function FcTweaks() {
  const [mode, setMode] = useState<Mode>('light');
  const [ready, setReady] = useState(false);

  // Hydrate from storage on mount. Legacy values ('paper', non-gold accents)
  // collapse into the two supported modes.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_THEME);
      setMode(stored === 'coal' || stored === 'dark' ? 'dark' : 'light');
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const theme = mode === 'dark' ? 'coal' : 'ivory';
    const root = document.documentElement;
    root.setAttribute('data-fc-theme', theme);
    root.setAttribute('data-fc-accent', 'gold');
    document.body.setAttribute('data-fc-theme', theme);
    document.body.setAttribute('data-fc-accent', 'gold');
    document.querySelectorAll('.fc-shell, .fc-landing').forEach(el => {
      el.setAttribute('data-fc-theme', theme);
      el.setAttribute('data-fc-accent', 'gold');
    });
    if (mode === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem(LS_THEME, theme);
      localStorage.setItem(LS_ACCENT, 'gold');
    } catch {}
  }, [mode, ready]);

  return (
    <div className="fc-tweaks" role="group" aria-label="Theme">
      <button
        type="button"
        className="fc-tweak-trigger"
        onClick={() => setMode(m => (m === 'dark' ? 'light' : 'dark'))}
        title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <span className="fc-tweak-swatch" style={{ background: mode === 'dark' ? '#14181f' : '#f6f0e1' }} />
        <span className="fc-tweak-swatch" style={{ background: '#d4af37', marginLeft: -4 }} />
        <span className="fc-tweak-label">{mode === 'dark' ? 'Dark' : 'Light'}</span>
      </button>
    </div>
  );
}

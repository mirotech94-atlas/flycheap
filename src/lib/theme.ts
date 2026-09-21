export type Theme = 'light' | 'dark';
export const THEME_COOKIE = 'fc-theme';

/** Parse the theme from a raw Cookie header. Anything but 'light' is dark. */
export function readThemeCookie(cookieHeader: string | null): Theme {
  if (!cookieHeader) return 'dark';
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`));
  return m && m[1] === 'light' ? 'light' : 'dark';
}

/** Apply a theme on the client: <html data-theme>, Tailwind .dark in lockstep, cookie + localStorage. */
export function applyTheme(t: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = t;
  root.classList.toggle('dark', t === 'dark');
  document.cookie = `${THEME_COOKIE}=${t}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try { localStorage.setItem(THEME_COOKIE, t); } catch { /* private mode */ }
}

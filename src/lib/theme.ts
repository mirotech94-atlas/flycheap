export type Theme = 'light' | 'dark';
export const THEME_COOKIE = 'fc-theme';

/** Parse the theme from a raw Cookie header. Anything but 'light' is dark. */
export function readThemeCookie(cookieHeader: string | null): Theme {
  if (!cookieHeader) return 'dark';
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`));
  return m && m[1] === 'light' ? 'light' : 'dark';
}

import { describe, it, expect } from 'vitest';
import { readThemeCookie, THEME_COOKIE } from '../src/lib/theme';

describe('readThemeCookie', () => {
  it('defaults to dark when there is no cookie (the pre-conversion safe default)', () => {
    expect(readThemeCookie(null)).toBe('dark');
    expect(readThemeCookie('')).toBe('dark');
  });
  it('reads light / dark from the fc-theme cookie among others', () => {
    expect(readThemeCookie(`a=1; ${THEME_COOKIE}=light; b=2`)).toBe('light');
    expect(readThemeCookie(`${THEME_COOKIE}=dark`)).toBe('dark');
  });
  it('clamps any other value to dark — a stale client value must never pick a theme the app does not ship', () => {
    expect(readThemeCookie(`${THEME_COOKIE}=ivory`)).toBe('dark');
    expect(readThemeCookie(`${THEME_COOKIE}=coal`)).toBe('dark');
  });
});

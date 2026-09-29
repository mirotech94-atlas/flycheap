import { describe, it, expect } from 'vitest';
import { safeNextPath } from '@/lib/safeNext';

describe('safeNextPath', () => {
  it('keeps same-origin relative paths', () => {
    for (const ok of ['/', '/admin', '/routes?x=1#y', '/share/abc', '/login?next=%2Forg']) expect(safeNextPath(ok), ok).toBe(ok);
  });
  it('rejects anything a browser could send off-site', () => {
    for (const bad of [
      '//evil.com', '/\\evil.com', '\\\\evil.com', '/\\/evil.com', '\\/evil.com',
      'https://evil.com', 'http:evil.com', 'javascript:alert(1)', 'evil.com', '',
      '/\t/evil.com', '/\n/evil.com', ' //evil.com', '/%0a/evil.com'.replace('%0a', '\n'),
      '/\u0000/evil.com',
    ]) expect(safeNextPath(bad), JSON.stringify(bad)).toBe('');
  });
  it('handles null and non-strings', () => {
    expect(safeNextPath(null)).toBe('');
    expect(safeNextPath(undefined)).toBe('');
  });
});

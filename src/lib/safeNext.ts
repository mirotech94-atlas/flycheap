/**
 * The one check for a post-login `next` target. Returns the path if it is a
 * same-origin relative path, else '' (callers fall back to their default).
 *
 * Browsers treat `\` as `/` in URLs, so `/\evil.com` is the protocol-relative
 * `//evil.com`; they also strip tabs and newlines, so `/\t/evil.com` becomes
 * `//evil.com` too. And a `next` fed to `window.location.href` must never be
 * a `javascript:` URL. Hence: must start with a single `/`, no backslashes or
 * control characters anywhere, and resolving it against a throwaway origin
 * must stay on that origin.
 *
 * No server-only imports: the login form (a client component) uses it too.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  const n = raw;
  if (!n.startsWith('/') || n.startsWith('//')) return '';
  if (/[\\\u0000-\u001f\u007f]/.test(n)) return '';
  try {
    const base = 'https://next-check.invalid';
    if (new URL(n, base).origin !== base) return '';
  } catch {
    return '';
  }
  return n;
}

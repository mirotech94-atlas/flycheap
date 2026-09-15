import 'server-only';
import type { NextRequest } from 'next/server';

/**
 * Build an absolute URL for the public-facing site, even when the request was
 * proxied to localhost:3000. Reads X-Forwarded-* headers (Caddy/nginx), falls
 * back to APP_URL env var, then to the canonical hostname. Never returns a
 * localhost URL — that was breaking magic-link emails.
 */
export function publicUrl(req: NextRequest, path: string = '/'): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const rawHost = req.headers.get('x-forwarded-host')
              ?? req.headers.get('host')
              ?? '';
  const looksLocal = !rawHost || /^(localhost|127\.|0\.0\.0\.0|::1)/.test(rawHost);
  const host = looksLocal
    ? (process.env.APP_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? 'flycheap.18dn.com')
    : rawHost;
  return `${proto}://${host}${path.startsWith('/') ? path : `/${path}`}`;
}

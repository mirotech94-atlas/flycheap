import { NextResponse } from 'next/server';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Caddy on-demand-TLS verifier.
 *
 * In Caddyfile:
 *   tls {
 *     on_demand
 *   }
 *   tls {
 *     ask https://my.flycheap.live/api/caddy/ask
 *   }
 *
 * Caddy hits this with `?domain=user.example.com`. Return 200 if the host is
 * either (a) one of our owned subdomains, or (b) a verified user custom domain.
 * Anything else → 404 (Caddy will refuse to issue a cert).
 */
const OWNED = new Set(['flycheap.live', 'www.flycheap.live', 'my.flycheap.live', 'admin.flycheap.live']);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = (url.searchParams.get('domain') ?? '').toLowerCase().trim();
  if (!domain) return new NextResponse('no domain', { status: 400 });

  if (OWNED.has(domain)) return new NextResponse('ok', { status: 200 });

  // Multi-domain table (preferred) + legacy users.custom_domain column.
  const fromTable = queries.findUserByDomain(domain);
  if (fromTable?.verified_at) return new NextResponse('ok', { status: 200 });
  const fromUser = queries.getUserByCustomDomain(domain);
  if (fromUser) return new NextResponse('ok', { status: 200 });

  return new NextResponse('not allowed', { status: 404 });
}

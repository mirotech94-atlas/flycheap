import 'server-only';
import { headers } from 'next/headers';
import { queries, type UserRow } from './db';
import { getCurrentUser } from './auth';
import { isOurHost } from './hosts';

/**
 * Resolve the active tenant from (in order):
 *   1. The host header — if it matches a `users.custom_domain`, that user is the tenant.
 *   2. The session cookie — falls back to whoever is signed in.
 *   3. Null — public/anonymous visitor on the canonical domain.
 *
 * The Host-based path is what powers white-label custom domains: a customer
 * CNAMEs `flights.theircompany.com` to our edge, sets `custom_domain` in
 * Settings, and every request from that hostname loads their branding & data.
 */
export async function getActiveTenant(): Promise<UserRow | null> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') || h.get('host') || '').toLowerCase().split(':')[0];
  if (host && !isOurHost(host)) {
    const u = queries.getUserByCustomDomain(host);
    if (u) return u;
  }
  return getCurrentUser();
}

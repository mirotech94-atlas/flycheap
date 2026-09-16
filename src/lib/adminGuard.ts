import 'server-only';
import { isAdminHost } from '@/lib/auth';

type H = { get(name: string): string | null };

export function adminHostOk(h: H): boolean {
  return isAdminHost(h.get('x-forwarded-host') ?? h.get('host') ?? '');
}

/**
 * Same-origin gate for state-changing admin endpoints. Fails CLOSED on a
 * cross-origin Origin even when Sec-Fetch-Site is absent (B3). Both headers
 * absent → allowed (older browsers / same-origin navigations).
 */
export function sameOriginOk(h: H): boolean {
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const origin = h.get('origin');
  const site = h.get('sec-fetch-site');
  if (origin) {
    try { if (new URL(origin).host !== host) return false; } catch { return false; }
  }
  if (site && site !== 'same-origin' && site !== 'none') return false;
  return true;
}

/** Trust the LAST x-forwarded-for hop (added by our own proxy), not the first
 *  (client-controlled) one (F1). */
export function clientIp(h: H): string {
  const xff = (h.get('x-forwarded-for') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : (h.get('x-real-ip') || 'unknown');
}

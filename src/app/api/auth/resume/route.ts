import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import {
  getCurrentUser, checkDeviceToken, startSession, setDeviceToken,
  isOwner, isAdminHost, endSession,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Trusted-device resume — the skip-OTP fast path.
 *
 * The login page bounces here when the visitor has no live session cookie but
 * DOES carry a valid `fareintel_device` cookie (planted on their last OTP
 * sign-in, 90-day sliding window). A server component cannot set cookies, so the
 * actual session start happens here, then we redirect to the intended page.
 *
 * A brand-new device (no device cookie) never reaches this route — it sees the
 * OTP form, which is the secure behaviour: we only skip OTP on a browser that
 * has already proven ownership of the account at least once.
 */

// Only ever redirect to a same-origin path — never an attacker-supplied absolute
// or protocol-relative URL.
function safeNext(raw: string | null): string {
  const n = (raw ?? '').trim();
  if (!n.startsWith('/') || n.startsWith('//')) return '';
  return n;
}

export async function GET(req: Request) {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const base = `${proto}://${host}`;
  const adminPortal = isAdminHost(host);

  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get('next')) || (adminPortal ? '/admin' : '/');
  const dest = new URL(next, base);
  const marketing = new URL('https://flycheap.18dn.com/');
  const freshLogin = new URL(`/login?fresh=1&next=${encodeURIComponent(next)}`, base);

  // 1) Somehow already have a live session — just go where they were headed.
  const existing = await getCurrentUser();
  if (existing) {
    if (adminPortal && !isOwner(existing)) return NextResponse.redirect(marketing);
    return NextResponse.redirect(dest);
  }

  // 2) Trusted device? Start a fresh session and slide the device window forward.
  const dev = await checkDeviceToken();
  if (dev) {
    // The device cookie is scoped to `.18dn.com`, so a client-portal device
    // token is also sent to the admin host. Never resume a non-owner into admin.
    if (adminPortal && !isOwner(dev)) {
      // Their device token is legitimate for the CLIENT portal (apex-scoped
      // cookie), just not for admin. Bounce to marketing WITHOUT revoking it —
      // the login page never bounces a non-owner here, so there is no loop.
      return NextResponse.redirect(marketing);
    }
    await startSession(dev.id);
    await setDeviceToken(dev.id);
    return NextResponse.redirect(dest);
  }

  // 3) No session and no valid device — clear any stale device cookie and show
  //    a fresh OTP form (fresh=1 stops the login page bouncing back here).
  await endSession(); // apex-aware clear of any stale device/session cookie
  return NextResponse.redirect(freshLogin);
}

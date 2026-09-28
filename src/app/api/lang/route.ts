import { NextRequest, NextResponse } from 'next/server';
import { isLocale, LOCALE_COOKIE } from '@/lib/i18n/locales';
import { safeNextPath } from '@/lib/safeNext';

export const dynamic = 'force-dynamic';

/** GET /api/lang?set=ar&next=/early-access → sets the locale cookie and redirects. */
export function GET(req: NextRequest) {
  const set = req.nextUrl.searchParams.get('set');
  const nextPath = req.nextUrl.searchParams.get('next') || '/';
  const safeNext = safeNextPath(nextPath) || '/';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'flycheap.live';
  const res = NextResponse.redirect(`${proto}://${host}${safeNext}`, 303);
  if (isLocale(set)) {
    res.cookies.set(LOCALE_COOKIE, set, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: true });
  }
  return res;
}

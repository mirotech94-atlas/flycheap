import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { queries } from '@/lib/db';
import { earlyAccessCount, getEarlyAccessById, joinEarlyAccess, listEarlyAccess, sendAccessRequestNotification, sendEarlyAccessEmail } from '@/lib/early-access';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

/** POST { email, homeAirport?, ref? } → position + referral link. Idempotent per email. */
export async function POST(req: NextRequest) {
  let body: { email?: string; name?: string; phone?: string; homeAirport?: string; ref?: string; acceptedTerms?: boolean; website?: string } = {};
  try { body = await req.json(); } catch { /* fallthrough */ }
  // Honeypot: real users never fill "website".
  if (body.website) return NextResponse.json({ ok: true, position: 0 });

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 });
  }
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ ok: false, error: 'Please enter your name.' }, { status: 400 });
  }
  // Terms acceptance is required (the form gates on it; enforce server-side too).
  if (body.acceptedTerms !== true) {
    return NextResponse.json({ ok: false, error: 'Please accept the Terms & Conditions to continue.' }, { status: 400 });
  }
  const phone = String(body.phone ?? '').trim().slice(0, 32) || undefined;
  const ip = clientIp(req);
  if (!queries.rateLimitCheck('early_access_ip', ip, 12, 3600)) {
    return NextResponse.json({ ok: false, error: 'Too many sign-ups from this network — try again in an hour.' }, { status: 429 });
  }

  const r = joinEarlyAccess({ email, name, phone, homeAirport: body.homeAirport, ref: body.ref, ip });
  if (!r.existing) {
    await sendEarlyAccessEmail(email, r);
    const row = getEarlyAccessById(r.id);
    if (row) await sendAccessRequestNotification(row, r.referrals);
  }
  return NextResponse.json({ ok: true, ...r });
}

/** GET → public count; admins may add ?format=csv for the full list. */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get('format');
  if (format === 'csv') {
    const user = await getCurrentUser();
    if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const rows = listEarlyAccess();
    const csv = ['position,email,home_airport,ref_code,referred_by,created_at,approved_at,declined_at',
      ...rows.map(r => [r.position, r.email, r.home_airport ?? '', r.ref_code, r.referred_by ?? '', r.created_at, r.approved_at ?? '', r.declined_at ?? ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="flycheap-early-access.csv"' } });
  }
  return NextResponse.json({ ok: true, count: earlyAccessCount() }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
